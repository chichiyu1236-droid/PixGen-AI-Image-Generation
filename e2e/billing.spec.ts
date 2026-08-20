import { createHash } from "node:crypto";
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

test.describe("Billing flow", () => {
  const stamp = Date.now();
  const email = `e2e-billing-${stamp}@example.com`;
  const password = `E2e!Bill${stamp}`;
  let userId = "";

  test.beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("checkout -> cashier page -> mock payment -> success", async ({ page }) => {
    const anon = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { session } } = await anon.auth.signInWithPassword({ email, password });
    expect(session).toBeTruthy();

    const ref = projectRef(supabaseUrl);
    const cookieName = `sb-${ref}-auth-token`;
    const cookieValue = Buffer.from(JSON.stringify(session)).toString("base64");

    await page.context().addCookies([
      { name: cookieName, value: cookieValue, domain: "localhost", path: "/" },
    ]);

    await page.goto("/upgrade");
    await expect(page.getByText("购买积分")).toBeVisible();
    await expect(page.getByText("尝鲜包")).toBeVisible();
    await expect(page.getByText("¥9.90")).toBeVisible();

    const buyButton = page.getByRole("button", { name: "立即购买" });
    await expect(buyButton).toBeVisible();
    await buyButton.click();

    await page.waitForURL(/\/pay\//, { timeout: 10_000 });

    await expect(page.getByText("CHECKOUT")).toBeVisible();
    await expect(page.getByText("微信支付")).toBeVisible();
    await expect(page.getByText("¥9.90")).toBeVisible();
    await expect(page.getByText("20 积分")).toBeVisible();
    await expect(page.getByText("订单有效期剩余")).toBeVisible();

    const qrImage = page.locator("img[alt*='支付二维码']");
    await expect(qrImage).toBeVisible({ timeout: 10_000 });

    const orderUrl = new URL(page.url());
    const orderId = orderUrl.pathname.split("/").pop()!;

    const { data: order } = await admin.from("orders").select("amount_fen").eq("id", orderId).single();
    expect(order).toBeTruthy();

    const callbackParams = buildCallbackParams({ orderId, amountFen: order!.amount_fen });
    const webhookResponse = await fetch(`http://localhost:3000/api/webhooks/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(callbackParams).toString(),
    });
    expect(webhookResponse.status).toBe(200);
    const ack = await webhookResponse.text();
    expect(ack).toBe("success");

    await expect(page.getByText("支付成功")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("20 积分已到账")).toBeVisible();

    const { data: profile } = await admin.from("profiles").select("credits").eq("id", userId).single();
    expect(profile!.credits).toBeGreaterThanOrEqual(20);

    const { data: events } = await admin
      .from("credit_events")
      .select("type")
      .eq("user_id", userId)
      .eq("type", "purchase");
    expect(events!.length).toBeGreaterThanOrEqual(1);
  });

  test("cashier page shows 404 for other user's order", async ({ page }) => {
    const { data: { user: otherUser } } = await admin.auth.admin.createUser({
      email: `e2e-other-${stamp}@example.com`,
      password: `E2e!Other${stamp}`,
      email_confirm: true,
    });

    const { data: order } = await admin.from("orders").insert({
      user_id: otherUser!.id,
      pack_id: "starter-20",
      credits: 20,
      amount_fen: 990,
      status: "pending",
      channel: "wechat",
      provider: "mock",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }).select("id").single();

    const anon = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { session } } = await anon.auth.signInWithPassword({ email, password });
    const ref = projectRef(supabaseUrl);
    await page.context().addCookies([
      { name: `sb-${ref}-auth-token`, value: Buffer.from(JSON.stringify(session)).toString("base64"), domain: "localhost", path: "/" },
    ]);

    await page.goto(`/pay/${order!.id}`);
    await expect(page.locator("h1, h2")).toContainText(/404|not found/i).catch(() => {
      return expect(page.getByText("404")).toBeVisible();
    });

    await admin.auth.admin.deleteUser(otherUser!.id);
  });
});
