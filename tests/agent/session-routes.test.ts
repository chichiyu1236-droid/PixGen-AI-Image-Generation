import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listSessions, POST as createSession } from "@/app/api/agent/sessions/route";
import { GET as getSession } from "@/app/api/agent/sessions/[id]/route";
import { POST as postMessage } from "@/app/api/agent/sessions/[id]/messages/route";
import { createBrain } from "@/lib/agent/brain";
import { createMockBrain } from "@/lib/agent/brains/mock";
import { listCanvasItems, runAgentTool } from "@/lib/agent/tools";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth/ensure-profile", () => ({ ensureUserProfile: vi.fn() }));
vi.mock("@/lib/agent/brain", () => ({ createBrain: vi.fn() }));
vi.mock("@/lib/agent/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/tools")>();
  return {
    ...actual,
    runAgentTool: vi.fn(),
    listCanvasItems: vi.fn(),
    agentToolDefinitions: [],
  };
});

const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";

function serverClient(options: { user?: { id: string } | null; session?: object | null; sessions?: object[] }) {
  const user = "user" in options ? options.user : { id: USER_ID };

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === "agent_sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: options.session ?? null, error: null }),
            }),
            order: () => ({
              limit: async () => ({ data: options.sessions ?? [], error: null }),
            }),
          }),
        };
      }

      if (table === "agent_messages") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    }),
  };
}

type GenerationCanvasRow = {
  id: string;
  image_url: string | null;
  origin: "agent" | "agent_edit" | "agent_variant" | "classic";
  created_at: string;
  final_prompt: string;
  parent_generation_id: string | null;
};

type GenerationsQueryOutcome = { data: GenerationCanvasRow[] | null; error: unknown } | Error;

function adminClient(options: {
  membershipActive?: boolean;
  onDeleteMessage?: (id: string) => void;
  deleteMessageResult?: { error: unknown } | Error;
  generationsQueries?: GenerationsQueryOutcome[];
  onInsertMessage?: (row: { id?: string; role: string; content?: string; trace?: unknown[] }) => void;
} = {}) {
  let generationsCallIndex = 0;

  return {
    rpc: vi.fn(async () => ({
      data: [
        {
          permanentCredits: 0,
          subCredits: 100,
          subCreditsExpiresAt: null,
          planId: "std-month",
          paidUntil: "2099-01-01T00:00:00.000Z",
          membershipActive: options.membershipActive ?? true,
          totalCredits: 100,
        },
      ],
      error: null,
    })),
    from: vi.fn((table: string) => {
      if (table === "agent_messages") {
        return {
          insert: (row: { id?: string; role: string; content?: string; trace?: unknown[] }) => {
            options.onInsertMessage?.(row);
            return {
              error: null,
              select: () => ({
                single: async () => ({
                  data: {
                    id: row.id ?? `msg-${row.role}`,
                    role: row.role,
                    content: row.content ?? "",
                    trace: row.trace ?? [],
                    created_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            };
          },
          delete: () => ({
            eq: async (_column: string, id: string) => {
              options.onDeleteMessage?.(id);
              if (options.deleteMessageResult instanceof Error) {
                throw options.deleteMessageResult;
              }
              return options.deleteMessageResult ?? { error: null };
            },
          }),
          select: () => ({
            eq: () => ({
              neq: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "agent_sessions") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: SESSION_ID, title: "新会话", created_at: new Date().toISOString(), last_message_at: new Date().toISOString() },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      if (table === "generations") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => {
                const outcomes = options.generationsQueries;
                if (!outcomes || outcomes.length === 0) {
                  return { data: [], error: null };
                }
                const outcome = outcomes[Math.min(generationsCallIndex, outcomes.length - 1)];
                generationsCallIndex += 1;
                if (outcome instanceof Error) {
                  throw outcome;
                }
                return outcome;
              },
            }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureUserProfile).mockResolvedValue(false);
  vi.mocked(listCanvasItems).mockResolvedValue([]);
  vi.mocked(createBrain).mockImplementation(() => createMockBrain());
});

describe("POST /api/agent/sessions", () => {
  it("rejects unauthenticated users", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ user: null }) as never);

    const response = await createSession();

    expect(response.status).toBe(401);
  });

  it("creates a session for the caller", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({}) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(adminClient() as never);

    const response = await createSession();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.id).toBe(SESSION_ID);
  });

  it("rejects non-members with agent_membership_required", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({}) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(adminClient({ membershipActive: false }) as never);

    const response = await createSession();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("agent_membership_required");
  });
});

describe("GET /api/agent/sessions", () => {
  it("lists the caller's sessions", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      serverClient({ sessions: [{ id: SESSION_ID, title: "海报" }] }) as never,
    );

    const response = await listSessions();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(1);
  });
});

describe("POST /api/agent/sessions/[id]/messages", () => {
  function request(body: unknown) {
    return new Request(`http://localhost/api/agent/sessions/${SESSION_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated users", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ user: null }) as never);

    const response = await postMessage(request({ text: "做一张海报" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 404 for sessions owned by others", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: null }) as never);

    const response = await postMessage(request({ text: "做一张海报" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).toBe(404);
  });

  it("rejects an invalid body", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({}) as never);

    const response = await postMessage(request({ text: "" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).toBe(400);
  });

  it("runs the mock brain end to end and returns both messages with the canvas", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(adminClient() as never);
    vi.mocked(runAgentTool)
      .mockResolvedValueOnce({ ok: true, data: { prompt: "专业提示词", costCredits: 0 } })
      .mockResolvedValueOnce({
        ok: true,
        data: { generationId: "55555555-5555-5555-5555-555555555555", imageUrl: "https://example.test/1.png", origin: "agent", costCredits: 1 },
      });
    vi.mocked(listCanvasItems).mockResolvedValue([
      {
        generationId: "55555555-5555-5555-5555-555555555555",
        imageUrl: "https://example.test/1.png",
        origin: "agent",
        version: "图 1 · v1",
        basedOn: null,
        promptSummary: "专业提示词",
        createdAt: new Date().toISOString(),
      },
    ]);

    const response = await postMessage(request({ text: "做一张高端护肤品的电商海报，极简风格" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userMessage.role).toBe("user");
    expect(body.assistantMessage.role).toBe("assistant");
    expect(body.assistantMessage.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool", name: "generate_image", costCredits: 1, status: "done" }),
        expect.objectContaining({ type: "image", generationId: "55555555-5555-5555-5555-555555555555" }),
      ]),
    );
    expect(body.canvas).toHaveLength(1);
  });

  it("surfaces an insufficient-credits reply instead of charging", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(adminClient() as never);
    vi.mocked(runAgentTool).mockResolvedValue({ ok: false, error: "insufficient_credits", retryable: false });

    const response = await postMessage(request({ text: "做一张海报" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assistantMessage.content).toContain("积分");
    expect(body.assistantMessage.trace).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "step", status: "failed" })]),
    );
  });

  it("reports provider unavailability in the trace without failing the request", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(adminClient() as never);
    vi.mocked(runAgentTool).mockResolvedValue({ ok: false, error: "provider_unavailable", retryable: true });

    const response = await postMessage(request({ text: "做一张海报" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assistantMessage.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool", status: "failed", detail: "provider_unavailable" }),
      ]),
    );
    expect(body.assistantMessage.content).toContain("失败");
  });

  it("rejects non-member message requests with agent_membership_required", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(adminClient({ membershipActive: false }) as never);

    const response = await postMessage(request({ text: "做一张海报" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("agent_membership_required");
    expect(runAgentTool).not.toHaveBeenCalled();
  });

  it("keeps expired-member sessions readable but blocks new turns", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      serverClient({ session: { id: SESSION_ID, title: "海报" } }) as never,
    );
    vi.mocked(createSupabaseAdminClient).mockReturnValue(adminClient({ membershipActive: false }) as never);

    const readResponse = await getSession(new Request(`http://localhost/api/agent/sessions/${SESSION_ID}`), {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(readResponse.status).toBe(200);

    const writeResponse = await postMessage(request({ text: "再改一版" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    const body = await writeResponse.json();

    expect(writeResponse.status).toBe(403);
    expect(body.error).toBe("agent_membership_required");
    expect(runAgentTool).not.toHaveBeenCalled();
  });

  it("removes the inserted user message when createBrain throws", async () => {
    const insertedIds: string[] = [];
    const deletedIds: string[] = [];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      adminClient({
        onInsertMessage: (row) => {
          if (row.role === "user" && row.id) insertedIds.push(row.id);
        },
        onDeleteMessage: (id) => deletedIds.push(id),
      }) as never,
    );
    vi.mocked(createBrain).mockImplementation(() => {
      throw new Error("missing_api_key");
    });

    const response = await postMessage(request({ text: "你好" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ error: "agent_provider_unavailable", userMessageRemoved: true });
    expect(insertedIds).toHaveLength(1);
    expect(deletedIds).toEqual(insertedIds);
  });

  it("removes the inserted user message when runAgentTurn throws before generating any image", async () => {
    const insertedIds: string[] = [];
    const deletedIds: string[] = [];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      adminClient({
        generationsQueries: [
          { data: [], error: null },
          { data: [], error: null },
        ],
        onInsertMessage: (row) => {
          if (row.role === "user" && row.id) insertedIds.push(row.id);
        },
        onDeleteMessage: (id) => deletedIds.push(id),
      }) as never,
    );
    vi.mocked(createBrain).mockReturnValue({
      respond: vi.fn().mockRejectedValue(new Error("upstream_503")),
    });

    const response = await postMessage(request({ text: "你好" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ error: "agent_turn_failed", userMessageRemoved: true });
    expect(insertedIds).toHaveLength(1);
    expect(deletedIds).toEqual(insertedIds);
  });

  it("preserves the inserted user message when runAgentTurn throws after producing a new canvas image", async () => {
    const deletedIds: string[] = [];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      adminClient({
        generationsQueries: [
          { data: [], error: null },
          {
            data: [
              {
                id: "66666666-6666-6666-6666-666666666666",
                image_url: "https://example.test/generated.png",
                origin: "agent",
                created_at: new Date().toISOString(),
                final_prompt: "海报",
                parent_generation_id: null,
              },
            ],
            error: null,
          },
        ],
        onDeleteMessage: (id) => deletedIds.push(id),
      }) as never,
    );
    vi.mocked(createBrain).mockReturnValue({
      respond: vi.fn().mockRejectedValue(new Error("followup_turn_503")),
    });

    const response = await postMessage(request({ text: "做一张海报" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ error: "agent_turn_failed", userMessageRemoved: false });
    expect(deletedIds).toHaveLength(0);
  });

  it("preserves the inserted user message when post-failure canvas verification returns a Supabase error", async () => {
    const deletedIds: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      adminClient({
        generationsQueries: [
          { data: [], error: null },
          { data: null, error: { message: "connection_reset" } },
        ],
        onDeleteMessage: (id) => deletedIds.push(id),
      }) as never,
    );
    vi.mocked(createBrain).mockReturnValue({
      respond: vi.fn().mockRejectedValue(new Error("followup_turn_503")),
    });

    try {
      const response = await postMessage(request({ text: "做一张海报" }), {
        params: Promise.resolve({ id: SESSION_ID }),
      });
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body).toMatchObject({ error: "agent_turn_failed", userMessageRemoved: false });
      expect(deletedIds).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith({ message: "connection_reset" });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("preserves the inserted user message when post-failure canvas verification throws", async () => {
    const deletedIds: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      adminClient({
        generationsQueries: [{ data: [], error: null }, new Error("db_timeout")],
        onDeleteMessage: (id) => deletedIds.push(id),
      }) as never,
    );
    vi.mocked(createBrain).mockReturnValue({
      respond: vi.fn().mockRejectedValue(new Error("followup_turn_503")),
    });

    try {
      const response = await postMessage(request({ text: "做一张海报" }), {
        params: Promise.resolve({ id: SESSION_ID }),
      });
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body).toMatchObject({ error: "agent_turn_failed", userMessageRemoved: false });
      expect(deletedIds).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: "db_timeout" }));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("preserves the inserted user message when pre-turn canvas lookup returns a Supabase error", async () => {
    const deletedIds: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      adminClient({
        generationsQueries: [
          { data: null, error: { message: "pre_turn_db_error" } },
          { data: [], error: null },
        ],
        onDeleteMessage: (id) => deletedIds.push(id),
      }) as never,
    );
    vi.mocked(createBrain).mockReturnValue({
      respond: vi.fn().mockRejectedValue(new Error("upstream_503")),
    });

    try {
      const response = await postMessage(request({ text: "做一张海报" }), {
        params: Promise.resolve({ id: SESSION_ID }),
      });
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body).toMatchObject({ error: "agent_turn_failed", userMessageRemoved: false });
      expect(deletedIds).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith({ message: "pre_turn_db_error" });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns userMessageRemoved: false when deleting the orphan user message fails with a Supabase error", async () => {
    const deletedIds: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverClient({ session: { id: SESSION_ID } }) as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      adminClient({
        generationsQueries: [
          { data: [], error: null },
          { data: [], error: null },
        ],
        deleteMessageResult: { error: { message: "delete_failed" } },
        onDeleteMessage: (id) => deletedIds.push(id),
      }) as never,
    );
    vi.mocked(createBrain).mockReturnValue({
      respond: vi.fn().mockRejectedValue(new Error("upstream_503")),
    });

    try {
      const response = await postMessage(request({ text: "你好" }), {
        params: Promise.resolve({ id: SESSION_ID }),
      });
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body).toMatchObject({ error: "agent_turn_failed", userMessageRemoved: false });
      expect(deletedIds).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledWith({ message: "delete_failed" });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
