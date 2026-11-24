import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({ data: { user: null }, error: null })),
      verifyOtp: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));

vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureUserProfile: vi.fn(),
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("redirects to /login with error=auth_callback_failed when exchangeCodeForSession fails", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { user: null, session: null },
          error: { message: "invalid grant" },
        })),
      },
    } as never);

    const response = await GET(new Request("http://localhost/auth/callback?code=bad-code&next=/upgrade"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=auth_callback_failed&next=%2Fupgrade",
    );
    expect(ensureUserProfile).not.toHaveBeenCalled();
  });

  it("redirects to /login with error=auth_callback_failed when upstream error param is present", async () => {
    const response = await GET(
      new Request("http://localhost/auth/callback?error=access_denied&next=https://evil.example"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=auth_callback_failed&next=%2Fgenerate",
    );
  });

  it("verifies token_hash for recovery and defaults next to /auth/reset-password", async () => {
    const verifyOtp = vi.fn(async () => ({
      data: { user: { id: "user-2", email: "reset@example.com" } },
      error: null,
    }));
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        verifyOtp,
      },
    } as never);

    const response = await GET(
      new Request("http://localhost/auth/callback?token_hash=th_recovery_123&type=recovery"),
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "th_recovery_123",
      type: "recovery",
    });
    expect(ensureUserProfile).toHaveBeenCalledWith({ id: "user-2", email: "reset@example.com" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/auth/reset-password");
  });

  it("redirects to /login?error=otp_expired when token_hash type is disallowed or verifyOtp fails", async () => {
    const invalidTypeRes = await GET(
      new Request("http://localhost/auth/callback?token_hash=th_1&type=sms&next=/upgrade"),
    );
    expect(invalidTypeRes.status).toBe(307);
    expect(invalidTypeRes.headers.get("location")).toBe(
      "http://localhost/login?error=otp_expired&next=%2Fupgrade",
    );

    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        verifyOtp: vi.fn(async () => ({
          data: { user: null },
          error: { message: "Token has expired" },
        })),
      },
    } as never);

    const expiredRes = await GET(
      new Request("http://localhost/auth/callback?token_hash=th_expired&type=email&next=/upgrade"),
    );
    expect(expiredRes.status).toBe(307);
    expect(expiredRes.headers.get("location")).toBe(
      "http://localhost/login?error=otp_expired&next=%2Fupgrade",
    );
  });

  it("does not abort redirect if ensureUserProfile throws", async () => {
    vi.mocked(ensureUserProfile).mockRejectedValueOnce(new Error("transient db error"));
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { user: { id: "user-3", email: "u3@example.com" } },
          error: null,
        })),
      },
    } as never);

    const response = await GET(new Request("http://localhost/auth/callback?code=ok&next=/upgrade"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/upgrade");
  });
});
