import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));

vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureUserProfile: vi.fn(),
}));

describe("GET /auth/callback", () => {
  it("falls back to /generate for an absolute next URL", async () => {
    const response = await GET(new Request("http://localhost/auth/callback?next=https://attacker.example"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/generate");
  });

  it("ensures a profile after exchanging an auth code", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { user: { id: "user-1", email: "user@example.com" } },
          error: null,
        })),
      },
    } as never);

    const response = await GET(new Request("http://localhost/auth/callback?code=abc&next=/generate"));

    expect(response.headers.get("location")).toBe("http://localhost/generate");
    expect(ensureUserProfile).toHaveBeenCalledWith({ id: "user-1", email: "user@example.com" });
  });
});
