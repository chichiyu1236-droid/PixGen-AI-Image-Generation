import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCanvasItems, listCanvasItemsWithError, runAgentTool, type ToolContext } from "@/lib/agent/tools";
import { editImageBase64, generateImageBase64 } from "@/lib/openai/images";
import { getImageProviderHealth } from "@/lib/openai/provider-health";
import { ensureGeneratedImagesBucket, uploadGeneratedImage } from "@/lib/storage/images";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

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

function fakeAdmin(options: {
  canvasRows?: unknown[];
  sourceRow?: unknown | null;
  rpc?: (...args: unknown[]) => unknown;
  storageRemove?: ReturnType<typeof vi.fn>;
}) {
  const remove = options.storageRemove ?? vi.fn(async () => ({ data: [], error: null }));

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
        remove,
      })),
    },
  } as unknown as SupabaseClient<Database>;
}

function context(admin: SupabaseClient<Database>, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    sessionId: "session-1",
    admin,
    totalCredits: 5,
    lastBuiltPrompt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
    const admin = fakeAdmin({});
    const ctx = context(admin, { totalCredits: 0 });

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

  it("decrements ctx.totalCredits after a successful generate_image to stop overspending in the same turn", async () => {
    const admin = fakeAdmin({});
    const ctx = context(admin, { totalCredits: 1 });

    await runAgentTool(
      "build_prompt",
      {
        imageType: "ecommerce_hero",
        aspectRatio: "square",
        style: "premium_minimal",
        scene: "studio",
        whitespace: "balanced",
        subject: "护肤品海报",
        extra: "",
      },
      ctx,
    );

    const first = await runAgentTool("generate_image", {}, ctx);
    expect(first.ok).toBe(true);
    expect(ctx.totalCredits).toBe(0);

    const second = await runAgentTool("generate_image", {}, ctx);
    expect(second).toEqual({ ok: false, error: "insufficient_credits", retryable: false });
    expect(generateImageBase64).toHaveBeenCalledTimes(1);
  });

  it("decrements ctx.totalCredits after a successful edit_image to stop overspending on multi-variant turns", async () => {
    const admin = fakeAdmin({ sourceRow });
    const ctx = context(admin, { totalCredits: 1 });

    const first = await runAgentTool("edit_image", { generationId: GEN_1, instruction: "换成海洋蓝", kind: "variant" }, ctx);
    expect(first.ok).toBe(true);
    expect(ctx.totalCredits).toBe(0);

    const second = await runAgentTool("edit_image", { generationId: GEN_1, instruction: "换成森林绿", kind: "variant" }, ctx);
    expect(second).toEqual({ ok: false, error: "insufficient_credits", retryable: false });
    expect(editImageBase64).toHaveBeenCalledTimes(1);
  });

  it("removes orphaned Storage objects when record_successful_generation fails in generate_image and edit_image", async () => {
    const removeGen = vi.fn(async () => ({ data: [], error: null }));
    const adminGen = fakeAdmin({
      storageRemove: removeGen,
      rpc: async () => ({ data: null, error: { message: "insufficient_credits" } }),
    });
    const ctxGen = context(adminGen, { totalCredits: 2 });

    await runAgentTool(
      "build_prompt",
      {
        imageType: "ecommerce_hero",
        aspectRatio: "square",
        style: "premium_minimal",
        scene: "studio",
        whitespace: "balanced",
        subject: "护肤品海报",
        extra: "",
      },
      ctxGen,
    );

    const genResult = await runAgentTool("generate_image", {}, ctxGen);
    expect(genResult).toEqual({ ok: false, error: "insufficient_credits", retryable: false });
    expect(ctxGen.totalCredits).toBe(0);
    expect(removeGen).toHaveBeenCalledWith(["user-1/new.png"]);

    const removeEdit = vi.fn(async () => ({ data: [], error: null }));
    const adminEdit = fakeAdmin({
      sourceRow,
      storageRemove: removeEdit,
      rpc: async () => ({ data: null, error: { message: "db_timeout" } }),
    });
    const ctxEdit = context(adminEdit, { totalCredits: 2 });

    const editResult = await runAgentTool("edit_image", { generationId: GEN_1, instruction: "背景换成樱花" }, ctxEdit);
    expect(editResult).toEqual({ ok: false, error: "generation_record_failed", retryable: true });
    expect(ctxEdit.totalCredits).toBe(2);
    expect(removeEdit).toHaveBeenCalledWith(["user-1/new.png"]);
  });

  it("inherits source aspect_ratio size for portrait and landscape edits and falls back to square for unknown values", async () => {
    const portraitAdmin = fakeAdmin({ sourceRow: { ...sourceRow, aspect_ratio: "portrait" } });
    const portraitRpc = portraitAdmin.rpc as ReturnType<typeof vi.fn>;

    const portraitResult = await runAgentTool(
      "edit_image",
      { generationId: GEN_1, instruction: "背景换成樱花色调" },
      context(portraitAdmin),
    );
    expect(portraitResult.ok).toBe(true);
    expect(editImageBase64).toHaveBeenLastCalledWith(expect.objectContaining({ size: "1024x1536" }));
    expect(portraitRpc).toHaveBeenCalledWith(
      "record_successful_generation",
      expect.objectContaining({ p_aspect_ratio: "portrait" }),
    );

    const landscapeAdmin = fakeAdmin({ sourceRow: { ...sourceRow, aspect_ratio: "landscape" } });
    const landscapeRpc = landscapeAdmin.rpc as ReturnType<typeof vi.fn>;

    const landscapeResult = await runAgentTool(
      "edit_image",
      { generationId: GEN_1, instruction: "背景换成落日余晖" },
      context(landscapeAdmin),
    );
    expect(landscapeResult.ok).toBe(true);
    expect(editImageBase64).toHaveBeenLastCalledWith(expect.objectContaining({ size: "1536x1024" }));
    expect(landscapeRpc).toHaveBeenCalledWith(
      "record_successful_generation",
      expect.objectContaining({ p_aspect_ratio: "landscape" }),
    );

    const unknownAdmin = fakeAdmin({ sourceRow: { ...sourceRow, aspect_ratio: "ultrawide_99" } });
    const unknownRpc = unknownAdmin.rpc as ReturnType<typeof vi.fn>;

    await runAgentTool(
      "edit_image",
      { generationId: GEN_1, instruction: "背景换成暖光" },
      context(unknownAdmin),
    );
    expect(editImageBase64).toHaveBeenLastCalledWith(expect.objectContaining({ size: "1024x1024" }));
    expect(unknownRpc).toHaveBeenCalledWith(
      "record_successful_generation",
      expect.objectContaining({ p_aspect_ratio: "square" }),
    );
  });
});

describe("listCanvasItemsWithError / listCanvasItems", () => {
  function canvasAdmin(result: { data: unknown; error: unknown }) {
    return {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: async () => result,
          }),
        }),
      })),
    } as unknown as SupabaseClient<Database>;
  }

  it("distinguishes an explicit empty result from a Supabase query error", async () => {
    const emptyResult = await listCanvasItemsWithError(canvasAdmin({ data: [], error: null }), "session-1");
    expect(emptyResult).toEqual({ data: [], error: null });

    const errorResult = await listCanvasItemsWithError(
      canvasAdmin({ data: null, error: { message: "db_timeout" } }),
      "session-1",
    );
    expect(errorResult).toEqual({ data: null, error: { message: "db_timeout" } });
  });

  it("keeps listCanvasItems backwards-compatible by returning [] on query error", async () => {
    const items = await listCanvasItems(canvasAdmin({ data: null, error: { message: "db_timeout" } }), "session-1");
    expect(items).toEqual([]);
  });
});
