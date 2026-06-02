import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileCredits } from "@/lib/auth/profile";

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

describe("POST /api/generate", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never);
    vi.mocked(ensureUserProfile).mockResolvedValue(false);
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
});
