import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/credits/route";
import { isAdminEmail } from "@/lib/admin/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/access", () => ({
  isAdminEmail: vi.fn(),
}));

describe("POST /api/admin/credits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "admin-1", email: "admin@example.com" } },
          error: null,
        })),
      },
    } as never);
    vi.mocked(isAdminEmail).mockReturnValue(true);
  });

  it("rejects non-admin users", async () => {
    vi.mocked(isAdminEmail).mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com", amount: 20, reason: "test" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("forbidden");
  });

  it("adds credits and writes a credit event", async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }));
    const insert = vi.fn(async () => ({ error: null }));
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "user-1", email: "user@example.com", credits: 3 },
                  error: null,
                })),
              })),
            })),
            update,
          };
        }

        return { insert };
      }),
    };
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

    const response = await POST(
      new Request("http://localhost/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com", amount: 20, reason: "manual test" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.credits).toBe(23);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ credits: 23 }));
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        type: "signup_bonus",
        amount: 20,
        reason: "Admin credit top-up: manual test",
      }),
    );
  });
});
