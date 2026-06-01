import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: vi.fn(),
    },
  })),
}));

describe("GET /auth/callback", () => {
  it("falls back to /generate for an absolute next URL", async () => {
    const response = await GET(new Request("http://localhost/auth/callback?next=https://attacker.example"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/generate");
  });
});
