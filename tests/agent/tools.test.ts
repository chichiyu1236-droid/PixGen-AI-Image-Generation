import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentTool, type ToolContext } from "@/lib/agent/tools";
import { getCreditBalance, type CreditBalance } from "@/lib/auth/balance";
import { editImageBase64, generateImageBase64 } from "@/lib/openai/images";
import { getImageProviderHealth } from "@/lib/openai/provider-health";
import { ensureGeneratedImagesBucket, uploadGeneratedImage } from "@/lib/storage/images";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/auth/balance", () => ({ getCreditBalance: vi.fn() }));
vi.mock("@/lib/openai/images", () => ({
  generateImageBase64: vi.fn(),
  editImageBase64: vi.fn(),
}));
vi.mock("@/lib/openai/provider-health", () => ({
  getImageProviderHealth: vi.fn(),
  getImageProviderErrorReason: vi.fn(() => null),
  markImageProviderFailure: vi.fn(),
  markImageProviderHealthy: vi.fn(),
}));
vi.mock("@/lib/storage/images", () => ({
  GENERATED_IMAGES_BUCKET: "generated-images",
  ensureGeneratedImagesBucket: vi.fn(),
  uploadGeneratedImage: vi.fn(),
}));

const GEN_1 = "11111111-1111-1111-1111-111111111111";

const balanceWith = (overrides: Partial<CreditBalance> = {}): CreditBalance => ({
  permanentCredits: 5,
  subCredits: 0,
  subCreditsExpiresAt: null,
  planId: null,
  paidUntil: null,
  membershipActive: false,
  totalCredits: 5,
  ...overrides,
});

const generationRow = {
  id: "22222222-2222-2222-2222-222222222222",
  image_url: "https://example.com/new.png",
};

function queryable(result: { data: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
      }),
    }),
  };
}

function fakeAdmin(options: { canvasRows?: unknown[]; sourceRow?: unknown | null; rpc?: (...args: unknown[]) => unknown }) {
  return {
    rpc: vi.fn(options.rpc ?? (async () => ({ data: generationRow, error: null }))),
    from: vi.fn((table: string) => {
      if (table === "generations") {
        const result = { data: options.sourceRow ?? null };
        return queryable(result);
      }

      throw new Error(`unexpected table ${table}`);
    }),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          // jsdom's Blob lacks arrayBuffer; production runs on Node Blobs.
          data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
          error: null,
        })),
      })),
    },
  } as unknown as SupabaseClient<Database>;
}

function context(admin: SupabaseClient<Database>): ToolContext {
  return {
    userId: "user-1",
    sessionId: "session-1",
    admin,
    lastBuiltPrompt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCreditBalance).mockResolvedValue(balanceWith());
  vi.mocked(ensureGeneratedImagesBucket).mockResolvedValue(undefined);
  vi.mocked(getImageProviderHealth).mockReturnValue({ ok: true, model: "gpt-image-1", reason: null, retryAfterSeconds: 0 });
  vi.mocked(generateImageBase64).mockResolvedValue("base64-new");
  vi.mocked(editImageBase64).mockResolvedValue("base64-edited");
  vi.mocked(uploadGeneratedImage).mockResolvedValue({ imageUrl: "https://example.com/new.png", storagePath: "user-1/new.png" });
});

describe("build_prompt", () => {
  it("builds a prompt and stores it in the run context", async () => {
    const ctx = context(fakeAdmin({}));
    const result = await runAgentTool("build_prompt", {
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "balanced",
      subject: "一瓶高端护肤精华",
      extra: "",
    }, ctx);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(typeof result.data.prompt).toBe("string");
      expect(ctx.lastBuiltPrompt?.options.subject).toBe("一瓶高端护肤精华");
    }
  });

  it("rejects arguments that fail generation request validation", async () => {
    const result = await runAgentTool("build_prompt", { subject: "x" }, context(fakeAdmin({})));

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("invalid_arguments") });
  });
});

describe("generate_image", () => {
  it("fails fast when no prompt was built", async () => {
    const result = await runAgentTool("generate_image", {}, context(fakeAdmin({})));

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("no_prompt_built") });
  });

  it("generates, uploads, and records with agent lineage", async () => {
    const admin = fakeAdmin({});
    const rpc = admin.rpc as ReturnType<typeof vi.fn>;
    const ctx = context(admin);

    await runAgentTool("build_prompt", {
      imageType: "ecommerce_hero", aspectRatio: "square", style: "premium_minimal",
      scene: "studio", whitespace: "balanced", subject: "护肤品海报", extra: "",
    }, ctx);
    const result = await runAgentTool("generate_image", {}, ctx);

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_successful_generation", expect.objectContaining({
      p_agent_session_id: "session-1",
      p_origin: "agent",
    }));
  });

  it("blocks generation when credits run out", async () => {
    vi.mocked(getCreditBalance).mockResolvedValue(balanceWith({ permanentCredits: 0, totalCredits: 0 }));
    const admin = fakeAdmin({});
    const ctx = context(admin);

    await runAgentTool("build_prompt", {
      imageType: "ecommerce_hero", aspectRatio: "square", style: "premium_minimal",
      scene: "studio", whitespace: "balanced", subject: "护肤品海报", extra: "",
    }, ctx);
    const result = await runAgentTool("generate_image", {}, ctx);

    expect(result).toMatchObject({ ok: false, error: "insufficient_credits" });
    expect(generateImageBase64).not.toHaveBeenCalled();
  });

  it("blocks generation when the image provider is unhealthy", async () => {
    vi.mocked(getImageProviderHealth).mockReturnValue({ ok: false, model: "gpt-image-1", reason: "circuit_open", retryAfterSeconds: 30 });
    const ctx = context(fakeAdmin({}));

    await runAgentTool("build_prompt", {
      imageType: "ecommerce_hero", aspectRatio: "square", style: "premium_minimal",
      scene: "studio", whitespace: "balanced", subject: "护肤品海报", extra: "",
    }, ctx);
    const result = await runAgentTool("generate_image", {}, ctx);

    expect(result).toMatchObject({ ok: false, error: "provider_unavailable" });
    expect(generateImageBase64).not.toHaveBeenCalled();
  });
});

describe("edit_image", () => {
  const sourceRow = { id: GEN_1, user_id: "user-1", storage_path: "user-1/old.png", final_prompt: "原提示词" };

  it("downloads the source, edits it, and records lineage", async () => {
    const admin = fakeAdmin({ sourceRow });
    const rpc = admin.rpc as ReturnType<typeof vi.fn>;

    const result = await runAgentTool("edit_image", { generationId: GEN_1, instruction: "背景换成樱花色调" }, context(admin));

    expect(result.ok).toBe(true);
    expect(editImageBase64).toHaveBeenCalledWith(expect.objectContaining({ images: [expect.any(String)] }));
    expect(rpc).toHaveBeenCalledWith("record_successful_generation", expect.objectContaining({
      p_parent_generation_id: GEN_1,
      p_origin: "agent_edit",
      p_edit_instruction: "背景换成樱花色调",
    }));
  });

  it("marks variant edits with the agent_variant origin", async () => {
    const admin = fakeAdmin({ sourceRow });
    const rpc = admin.rpc as ReturnType<typeof vi.fn>;

    await runAgentTool("edit_image", { generationId: GEN_1, instruction: "换成海洋蓝配色", kind: "variant" }, context(admin));

    expect(rpc).toHaveBeenCalledWith("record_successful_generation", expect.objectContaining({ p_origin: "agent_variant" }));
  });

  it("rejects generations that do not belong to the caller", async () => {
    const result = await runAgentTool("edit_image", { generationId: GEN_1, instruction: "背景换成樱花" }, context(fakeAdmin({ sourceRow: null })));

    expect(result).toMatchObject({ ok: false, error: "generation_not_found" });
    expect(editImageBase64).not.toHaveBeenCalled();
  });
});
