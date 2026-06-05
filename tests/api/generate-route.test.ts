import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileCredits } from "@/lib/auth/profile";
import { generateImageBase64 } from "@/lib/openai/images";
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
}));

vi.mock("@/lib/openai/provider-health", () => ({
  getImageProviderHealth: vi.fn(),
  getImageProviderErrorReason: vi.fn(() => null),
  markImageProviderUnavailable: vi.fn(),
}));

vi.mock("@/lib/storage/images", () => ({
  ensureGeneratedImagesBucket: vi.fn(),
  uploadGeneratedImage: vi.fn(),
}));

describe("POST /api/generate", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);
    vi.mocked(ensureUserProfile).mockResolvedValue(false);
    vi.mocked(createSupabaseAdminClient).mockReturnValue({} as never);
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
});
