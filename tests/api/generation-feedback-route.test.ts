import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/generations/[id]/feedback/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

describe("PATCH /api/generations/:id/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);
  });

  it("rejects unauthenticated users", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/generations/generation-1/feedback", {
        method: "PATCH",
        body: JSON.stringify({ feedback: "liked" }),
      }),
      { params: Promise.resolve({ id: "generation-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("not_authenticated");
  });

  it("updates feedback for the authenticated user's generation", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
    } as never);

    const maybeSingle = vi.fn(async () => ({
      data: { id: "generation-1", feedback: "liked" },
      error: null,
    }));
    const admin = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle,
              })),
            })),
          })),
        })),
      })),
    };
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

    const response = await PATCH(
      new Request("http://localhost/api/generations/generation-1/feedback", {
        method: "PATCH",
        body: JSON.stringify({ feedback: "liked" }),
      }),
      { params: Promise.resolve({ id: "generation-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generation.feedback).toBe("liked");
    expect(maybeSingle).toHaveBeenCalled();
  });
});
