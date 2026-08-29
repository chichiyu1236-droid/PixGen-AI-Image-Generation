import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileCredits } from "@/lib/auth/profile";
import { editImageBase64, generateImageBase64 } from "@/lib/openai/images";
import { getImageProviderHealth } from "@/lib/openai/provider-health";
import { ensureGeneratedImagesBucket, uploadGeneratedImage } from "@/lib/storage/images";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/profile", () => ({
  getProfileCredits: vi.fn(),
}));

vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureUserProfile: vi.fn(),
}));

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
  ensureGeneratedImagesBucket: vi.fn(),
  uploadGeneratedImage: vi.fn(),
}));

const basePayload = {
  imageType: "ecommerce_hero",
  aspectRatio: "square",
  style: "premium_minimal",
  scene: "studio",
  whitespace: "balanced",
  subject: "一双白色运动鞋",
  extra: "",
};

const HISTORY_GENERATION_ID = "5f0b1c2e-1111-4222-8333-444455556666";

function authenticatedContext() {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
  } as never);
}

describe("POST /api/generate", () => {
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    rpc = vi.fn(async () => ({
      data: { id: "gen-1", image_url: "https://example.com/image.png", feedback: null },
      error: null,
    }));

    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);
    vi.mocked(ensureUserProfile).mockResolvedValue(false);
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as never);
    vi.mocked(getProfileCredits).mockResolvedValue(5);
    vi.mocked(ensureGeneratedImagesBucket).mockResolvedValue(undefined);
    vi.mocked(getImageProviderHealth).mockReturnValue({
      ok: true,
      model: "gpt-image-2",
      reason: null,
      retryAfterSeconds: 0,
    });
    vi.mocked(uploadGeneratedImage).mockResolvedValue({
      imageUrl: "https://example.com/image.png",
      storagePath: "user-1/image.png",
    });
    vi.mocked(generateImageBase64).mockResolvedValue("base64-image");
    vi.mocked(editImageBase64).mockResolvedValue("base64-edited");
  });

  it("rejects unauthenticated users", async () => {
    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("not_authenticated");
  });

  it("returns a structured error when profile credits cannot be loaded", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
    } as never);
    vi.mocked(getProfileCredits).mockRejectedValue(new Error("Unable to load credits: missing"));

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({
        imageType: "ecommerce_hero",
        aspectRatio: "square",
        style: "premium_minimal",
        scene: "studio",
        whitespace: "balanced",
        subject: "一双白色运动鞋",
        extra: "",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("profile_unavailable");
  });

  it("rejects requests while the image provider is marked unavailable", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
    } as never);
    vi.mocked(ensureUserProfile).mockResolvedValue(true);
    vi.mocked(getProfileCredits).mockResolvedValue(5);
    vi.mocked(getImageProviderHealth).mockReturnValue({
      ok: false,
      model: "gpt-image-2",
      reason: "auth_unavailable",
      retryAfterSeconds: 120,
    });

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({
        imageType: "ecommerce_hero",
        aspectRatio: "square",
        style: "premium_minimal",
        scene: "studio",
        whitespace: "balanced",
        subject: "white running shoes",
        extra: "",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("provider_unavailable");
    expect(ensureGeneratedImagesBucket).not.toHaveBeenCalled();
    expect(generateImageBase64).not.toHaveBeenCalled();
  });

  it("checks storage availability before calling the image provider", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
    } as never);
    vi.mocked(ensureUserProfile).mockResolvedValue(true);
    vi.mocked(getProfileCredits).mockResolvedValue(5);
    vi.mocked(ensureGeneratedImagesBucket).mockRejectedValue(new Error("Bucket not found"));

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({
        imageType: "ecommerce_hero",
        aspectRatio: "square",
        style: "premium_minimal",
        scene: "studio",
        whitespace: "balanced",
        subject: "white running shoes",
        extra: "",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("storage_unavailable");
    expect(generateImageBase64).not.toHaveBeenCalled();
  });

  it("returns a structured error when generated image upload fails", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
    } as never);
    vi.mocked(ensureUserProfile).mockResolvedValue(true);
    vi.mocked(getProfileCredits).mockResolvedValue(5);
    vi.mocked(uploadGeneratedImage).mockRejectedValue(new Error("Upload failed"));

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({
        imageType: "ecommerce_hero",
        aspectRatio: "square",
        style: "premium_minimal",
        scene: "studio",
        whitespace: "balanced",
        subject: "white running shoes",
        extra: "",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("storage_unavailable");
  });

  it("routes reference requests to the edit endpoint and records lineage metadata only", async () => {
    authenticatedContext();

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        aspectRatio: "portrait",
        referenceImages: [
          { data: "a".repeat(200), generationId: HISTORY_GENERATION_ID },
          { data: "b".repeat(200) },
        ],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generation.id).toBe("gen-1");
    expect(editImageBase64).toHaveBeenCalledWith({
      prompt: expect.stringContaining("Visual references"),
      images: ["a".repeat(200), "b".repeat(200)],
      size: "1024x1536",
    });
    expect(generateImageBase64).not.toHaveBeenCalled();

    const rpcArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcArgs.p_parent_generation_id).toBe(HISTORY_GENERATION_ID);
    expect(JSON.stringify(rpcArgs.p_options_json)).not.toContain("a".repeat(200));
    expect(JSON.stringify(rpcArgs.p_options_json)).not.toContain("b".repeat(200));
    expect((rpcArgs.p_options_json as { referenceImages: Array<Record<string, unknown>> }).referenceImages).toEqual([
      { source: "history", generationId: HISTORY_GENERATION_ID },
      { source: "upload" },
    ]);
  });

  it("omits the parent link when every reference image is a fresh upload", async () => {
    authenticatedContext();

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        referenceImages: [{ data: "a".repeat(200) }],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const rpcArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcArgs.p_parent_generation_id).toBeUndefined();
    expect((rpcArgs.p_options_json as { referenceImages: Array<Record<string, unknown>> }).referenceImages).toEqual([
      { source: "upload" },
    ]);
  });

  it("keeps the text-to-image path and response shape for requests without references", async () => {
    authenticatedContext();

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify(basePayload),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generation.image_url).toBe("https://example.com/image.png");
    expect(generateImageBase64).toHaveBeenCalledWith({
      prompt: expect.stringContaining("一双白色运动鞋"),
      size: "1024x1024",
    });
    expect(editImageBase64).not.toHaveBeenCalled();

    const rpcArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcArgs.p_parent_generation_id).toBeUndefined();
    expect((rpcArgs.p_options_json as { referenceImages: Array<Record<string, unknown>> }).referenceImages).toEqual([]);
  });

  it("rejects oversized reference image lists before calling the image provider", async () => {
    authenticatedContext();

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        referenceImages: ["a", "b", "c", "d"].map((character) => ({ data: character.repeat(200) })),
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(generateImageBase64).not.toHaveBeenCalled();
    expect(editImageBase64).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
