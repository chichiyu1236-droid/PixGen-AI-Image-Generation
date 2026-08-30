import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MOCK_SECRET = process.env.MOCK_APP_SECRET ?? "mock-secret";

function projectRef(url: string): string {
  return new URL(url).hostname.split(".")[0];
}

function signParams(params: Record<string, string>, secret: string): string {
  const stringA = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("md5").update(`${stringA}&key=${secret}`, "utf8").digest("hex").toUpperCase();
}

function buildCallbackParams(input: { orderId: string; amountFen: number }): Record<string, string> {
  const params: Record<string, string> = {
    code: "0",
    timestamp: String(Math.floor(Date.now() / 1000)),
    mch_id: "mock-mch",
    order_no: `mock-order-${input.orderId}`,
    out_trade_no: input.orderId,
    pay_no: `mock-pay-${input.orderId}`,
    total_fee: (input.amountFen / 100).toFixed(2),
  };
  return { ...params, sign: signParams(params, MOCK_SECRET) };
}

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test.describe.configure({ mode: "serial" });

test.describe("Membership flow", () => {
  const stamp = Date.now();
  const email = `e2e-member-${stamp}@example.com`;
  const password = `E2e!Mem${stamp}`;
  const DAY_MS = 24 * 60 * 60 * 1000;
  let userId = "";
  let firstPaidUntil = "";

  async function signIn(page: Page) {
    const anon = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { session } } = await anon.auth.signInWithPassword({ email, password });
    expect(session).toBeTruthy();
    const ref = projectRef(supabaseUrl);
    await page.context().addCookies([
      {
        name: `sb-${ref}-auth-token`,
        value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
        domain: "localhost",
        path: "/",
      },
    ]);
  }

  /** Waits for the cashier, pays the pending plan order through the mock webhook. */
  async function payCurrentPlanOrder(page: Page): Promise<string> {
    await page.waitForURL(/\/pay\//, { timeout: 30_000 });
    const orderId = new URL(page.url()).pathname.split("/").pop()!;

    const { data: order } = await admin
      .from("orders")
      .select("amount_fen, kind, plan_snapshot")
      .eq("id", orderId)
      .single();
    expect(order!.kind).toBe("plan");
    expect(order!.plan_snapshot).toBeTruthy();

    const response = await fetch("http://localhost:3000/api/webhooks/mock", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(buildCallbackParams({ orderId, amountFen: order!.amount_fen })).toString(),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("success");
    return orderId;
  }

  test.beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data!.user.id;
  });

  test.afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("buying the standard monthly card fulfills membership and grants the first tranche", async ({ page }) => {
    test.slow();
    await signIn(page);
    await page.goto("/upgrade");
    await expect(page.getByText("免费体验")).toBeVisible();
    await expect(page.getByText("¥19.90").first()).toBeVisible();

    await page.getByRole("button", { name: "立即开通" }).first().click();
    const orderId = await payCurrentPlanOrder(page);

    const { data: order } = await admin.from("orders").select("status, pack_id, credits").eq("id", orderId).single();
    expect(order!.status).toBe("paid");
    expect(order!.pack_id).toBe("std-month");
    expect(order!.credits).toBe(100);

    const { data: membership } = await admin.from("memberships").select("*").eq("user_id", userId).single();
    expect(membership!.plan_id).toBe("std-month");
    expect(membership!.pending_tranches).toEqual([]);
    const paidUntil = new Date(membership!.paid_until).getTime();
    expect(paidUntil).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    expect(paidUntil).toBeLessThan(Date.now() + 31 * DAY_MS);
    firstPaidUntil = membership!.paid_until;

    const { data: profile } = await admin.from("profiles").select("credits, sub_credits").eq("id", userId).single();
    expect(profile!.sub_credits).toBe(100);
    expect(profile!.credits).toBe(5);

    const { data: events } = await admin
      .from("credit_events")
      .select("type, amount")
      .eq("user_id", userId)
      .eq("type", "membership_grant");
    expect(events!.length).toBe(1);
    expect(events![0].amount).toBe(100);
  });

  test("generation charging prefers the subscription pool", async () => {
    const { data, error } = await admin.rpc("record_successful_generation", {
      p_user_id: userId,
      p_image_url: "https://example.com/e2e-membership.png",
      p_storage_path: `${userId}/e2e-membership.png`,
      p_final_prompt: "e2e membership charge",
      p_input_subject: "e2e",
      p_input_extra: null,
      p_options_json: {},
      p_aspect_ratio: "square",
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const { data: profile } = await admin.from("profiles").select("credits, sub_credits").eq("id", userId).single();
    expect(profile!.sub_credits).toBe(99);
    expect(profile!.credits).toBe(5);

    const { data: events } = await admin
      .from("credit_events")
      .select("reason")
      .eq("user_id", userId)
      .eq("type", "generation_charge")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(events![0].reason).toContain("subscription pool");
  });

  test("renewing within the membership extends paid_until and stacks quota", async ({ page }) => {
    test.slow();
    await signIn(page);
    await page.goto("/upgrade");
    await page.getByRole("button", { name: "立即开通" }).first().click();
    await payCurrentPlanOrder(page);

    const { data: membership } = await admin.from("memberships").select("*").eq("user_id", userId).single();
    const expectedUntil = new Date(firstPaidUntil).getTime() + 30 * DAY_MS;
    expect(Math.abs(new Date(membership!.paid_until).getTime() - expectedUntil)).toBeLessThan(5_000);

    const { data: profile } = await admin.from("profiles").select("credits, sub_credits").eq("id", userId).single();
    expect(profile!.sub_credits).toBe(199);
  });

  test("buying a yearly card mid-cycle upgrades the plan and queues remaining tranches", async ({ page }) => {
    test.slow();
    await signIn(page);
    await page.goto("/upgrade");
    await page.getByRole("button", { name: "年付省 17%" }).click();
    await page.getByRole("button", { name: "立即开通" }).nth(1).click();
    await payCurrentPlanOrder(page);

    const { data: membership } = await admin.from("memberships").select("*").eq("user_id", userId).single();
    expect(membership!.plan_id).toBe("pro-year");
    const pending = membership!.pending_tranches as number[];
    expect(pending).toHaveLength(11);
    expect(pending[0]).toBe(300);

    const { data: profile } = await admin.from("profiles").select("credits, sub_credits").eq("id", userId).single();
    expect(profile!.sub_credits).toBe(499);
  });

  test("badge renders membership pools alongside permanent credits", async ({ page }) => {
    await signIn(page);
    await page.goto("/generate");
    await expect(page.getByText(/会员 499 张/)).toBeVisible();
    await expect(page.getByText("永久积分 5")).toBeVisible();
  });

  test("expired subscription pool zeroes on read; the permanent pool still pays for generations", async ({ page }) => {
    await admin
      .from("profiles")
      .update({ credits: 7, sub_credits_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", userId);

    await signIn(page);
    await page.goto("/generate");
    await expect(page.getByText("永久积分 7")).toBeVisible();

    const { data: profile } = await admin.from("profiles").select("credits, sub_credits").eq("id", userId).single();
    expect(profile!.sub_credits).toBe(0);

    const { error } = await admin.rpc("record_successful_generation", {
      p_user_id: userId,
      p_image_url: "https://example.com/e2e-permanent.png",
      p_storage_path: `${userId}/e2e-permanent.png`,
      p_final_prompt: "e2e permanent charge",
      p_input_subject: "e2e",
      p_input_extra: null,
      p_options_json: {},
      p_aspect_ratio: "square",
    });
    expect(error).toBeNull();

    const { data: after } = await admin.from("profiles").select("credits, sub_credits").eq("id", userId).single();
    expect(after!.credits).toBe(6);
    expect(after!.sub_credits).toBe(0);

    await admin.from("memberships").update({ paid_until: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", userId);
    await page.goto("/generate");
    await expect(page.getByText("会员已过期")).toBeVisible();
  });

  test("skipped periods forfeit and only the current period grants on return", async ({ page }) => {
    await admin
      .from("memberships")
      .update({
        paid_until: new Date(Date.now() + 270 * DAY_MS).toISOString(),
        next_grant_at: new Date(Date.now() - 90 * DAY_MS).toISOString(),
        pending_tranches: Array.from({ length: 10 }, () => 300),
      })
      .eq("user_id", userId);

    await signIn(page);
    await page.goto("/upgrade");

    const { data: membership } = await admin.from("memberships").select("*").eq("user_id", userId).single();
    const pending = membership!.pending_tranches as number[];
    expect(pending).toHaveLength(6);

    const { data: profile } = await admin.from("profiles").select("sub_credits").eq("id", userId).single();
    expect(profile!.sub_credits).toBe(300);

    const nextGrant = new Date(membership!.next_grant_at).getTime();
    expect(nextGrant).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    expect(nextGrant).toBeLessThan(Date.now() + 31 * DAY_MS);
  });
  test("shows the renewal notice during the last 3 days of the membership", async ({ page }) => {
    await admin
      .from("memberships")
      .update({ paid_until: new Date(Date.now() + 2 * DAY_MS).toISOString() })
      .eq("user_id", userId);

    await signIn(page);
    await page.goto("/generate");
    await expect(page.getByText(/你的会员将于/)).toBeVisible();
    await expect(page.getByRole("link", { name: "去续费" })).toBeVisible();
  });
});
