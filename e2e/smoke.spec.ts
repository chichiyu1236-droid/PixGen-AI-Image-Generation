import { expect, test } from "@playwright/test";

test("home page renders and login entry points to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /从一句模糊/ })).toBeVisible();
  await expect(page.locator('header nav a[href="/login"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Google 登录" })).toHaveCount(0);

  // Nav anchors: the agent entry is named 智能体. CSS locators — the nav
  // collapses (display:none) on mobile, which removes the links from the
  // accessibility tree.
  await expect(page.locator('nav a[href="#agent"]')).toHaveText("智能体");
  await expect(page.locator('nav a[href="#pricing"]')).toHaveText("价格");

  // Footer legal compliance links
  await expect(page.locator('footer a[href="/terms"]')).toHaveText("服务条款");
  await expect(page.locator('footer a[href="/privacy"]')).toHaveText("隐私政策");
});

test("pricing section shows three static plan cards", async ({ page }) => {
  await page.goto("/");

  const pricing = page.locator("#pricing");
  await expect(pricing.getByRole("heading", { name: "免费体验" })).toBeVisible();
  await expect(pricing.getByRole("heading", { name: "标准会员" })).toBeVisible();
  await expect(pricing.getByRole("heading", { name: "Pro 会员" })).toBeVisible();

  // Prices come from the shared membership plan definitions.
  await expect(pricing.getByText("¥19.9", { exact: false })).toBeVisible();
  await expect(pricing.getByText("¥49.9", { exact: false })).toBeVisible();
  await expect(pricing.getByText(/年付 .*\/年，省 17%/).first()).toBeVisible();

  // Paid plan cards route unauthenticated visitors to /login?next=/upgrade.
  await expect(pricing.locator('a[href="/login?next=/upgrade"]')).toHaveCount(2);

  // The landing page is display-only: no inline checkout controls.
  await expect(pricing.getByRole("button", { name: "立即开通" })).toHaveCount(0);
  await expect(pricing.getByText("微信支付")).toHaveCount(0);
});

test("unauthenticated generation page redirects to login", async ({ page }) => {
  await page.goto("/generate");
  await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();
});

test("oauth code delivered to the site root is forwarded to the callback and surfaces error on login", async ({
  page,
}) => {
  // Supabase falls back to the Site URL root when the redirect URL is not
  // allowlisted; the homepage forwards the code to /auth/callback, and an
  // invalid code redirects back to /login?error=auth_callback_failed with a clear alert.
  await page.goto("/?code=invalid-test-code");

  await page.waitForURL(/\/login\?error=auth_callback_failed/);
  await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
});
