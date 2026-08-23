import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function projectRef(url: string): string {
  return new URL(url).hostname.split(".")[0];
}

function authCookie(session: unknown): { name: string; value: string; domain: string; path: string } {
  return {
    name: `sb-${projectRef(supabaseUrl)}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    domain: "localhost",
    path: "/",
  };
}

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test.describe("Agent workbench", () => {
  const stamp = Date.now();
  const email = `e2e-agent-${stamp}@example.com`;
  const password = `E2e!Agent${stamp}`;
  let userId = "";

  test.beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("fuzzy -> generate -> edit -> variants with credits and canvas lineage", async ({ page }) => {
    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { session } } = await anon.auth.signInWithPassword({ email, password });
    expect(session).toBeTruthy();
    await page.context().addCookies([authCookie(session)]);

    await page.goto("/generate?mode=agent");
    await expect(page.getByText("DIALOGUE")).toBeVisible();
    await expect(page.getByText("和 Agent 聊")).toBeVisible();
    await expect(page.getByText("还没想好，聊聊看")).toBeVisible();
    await expect(page.getByText("聊出来的图会出现在这里")).toBeVisible();

    const input = page.getByPlaceholder("不知道想要什么也没关系，随便说一句…");
    const send = page.getByRole("button", { name: "发送" });

    // 1) Fuzzy request -> clarifying question, no tools, no credits spent.
    await input.fill("我想发个小红书，但完全没想好要什么图");
    await send.click();
    await expect(page.getByText("想法是聊出来的")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("正在思考")).toHaveCount(0);

    // 2) Concrete request -> generation lands on the canvas (5 -> 4 credits).
    await input.fill("做一张高端护肤品的电商海报，极简风格");
    await send.click();
    await expect(page.getByText("生成好了（消耗 1 积分）")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByAltText("画布作品 图 1 · v1")).toBeVisible();
    await expect(page.getByText("剩余积分：4")).toBeVisible();

    // 3) The fresh image is auto-selected; edit it (4 -> 3 credits).
    await expect(page.getByText("编辑对象")).toBeVisible();
    await input.fill("背景换成樱花色调");
    await send.click();
    await expect(page.getByText("改好了，新版本已经放上画布")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByAltText("画布作品 图 2 · v2")).toBeVisible();
    await expect(page.getByText("基于 图 1 · v1 修改")).toBeVisible();
    await expect(page.getByText("剩余积分：3")).toBeVisible();

    // 4) Variants: two more edits billed separately (3 -> 1 credits).
    await input.fill("给这张图生成两个不同配色的变体");
    await send.click();
    await expect(page.getByText("两个配色变体已经放上画布")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText("剩余积分：1")).toBeVisible();
    await expect(page.locator("img[alt^='画布作品']")).toHaveCount(4);

    // Server-side truth: messages, lineage, and credit events.
    const { data: dbSession } = await admin.from("agent_sessions").select("id").eq("user_id", userId).single();
    expect(dbSession).toBeTruthy();

    const { count: messageCount } = await admin
      .from("agent_messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", dbSession!.id);
    expect(messageCount).toBe(8);

    const { data: generations } = await admin
      .from("generations")
      .select("id, origin, parent_generation_id, agent_session_id")
      .eq("agent_session_id", dbSession!.id)
      .order("created_at", { ascending: true });
    expect(generations).toHaveLength(4);
    expect(generations![0]).toMatchObject({ origin: "agent", parent_generation_id: null });
    expect(generations![1]).toMatchObject({ origin: "agent_edit", parent_generation_id: generations![0].id });
    expect(generations![2]?.origin).toBe("agent_variant");
    expect(generations![3]?.origin).toBe("agent_variant");

    const { count: charges } = await admin
      .from("credit_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "generation_charge");
    expect(charges).toBe(4);
  });

  test("session access is confined to its owner", async ({ page }) => {
    const { data: { user: otherUser } } = await admin.auth.admin.createUser({
      email: `e2e-agent-other-${stamp}@example.com`,
      password: `E2e!Other${stamp}`,
      email_confirm: true,
    });

    const { data: otherSession } = await admin
      .from("agent_sessions")
      .insert({ user_id: otherUser!.id, title: "别人的会话" })
      .select("id")
      .single();

    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { session } } = await anon.auth.signInWithPassword({ email, password });
    await page.context().addCookies([authCookie(session)]);

    const response = await fetch(`http://localhost:3000/api/agent/sessions/${otherSession!.id}`, {
      headers: { cookie: `sb-${projectRef(supabaseUrl)}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` },
    });
    expect(response.status).toBe(404);

    await admin.auth.admin.deleteUser(otherUser!.id);
  });
});
