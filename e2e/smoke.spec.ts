import { expect, test } from "@playwright/test";

test("home page renders and login entry is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /从一句模糊/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Google 登录" }).first()).toBeVisible();

  // Nav anchors: the flow section has its own anchor and the agent entry is
  // named 智能体 now. CSS locators — the nav collapses (display:none) on
  // mobile, which removes the links from the accessibility tree.
  await expect(page.locator('nav a[href="#flow"]')).toHaveText("创作");
  await expect(page.locator('nav a[href="#agent"]')).toHaveText("智能体");
});

test("feature flow style picker swaps the finished image", async ({ page }) => {
  await page.goto("/");

  const bright = page.getByRole("button", { name: "明亮生活风格" });
  await bright.click();
  await expect(bright).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "极简白底风格" })).toHaveAttribute("aria-pressed", "false");

  // The generating beat resolves back to the done badge.
  await expect(page.getByText("已生成 · −1 积分")).toBeVisible({ timeout: 5000 });
});

test("unauthenticated generation page redirects to login", async ({ page }) => {
  await page.goto("/generate");
  await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();
});

test("oauth code delivered to the site root is forwarded to the callback", async ({ page }) => {
  // Supabase falls back to the Site URL root when the redirect URL is not
  // allowlisted; the homepage must forward the code so the exchange completes
  // (an invalid code still lands the user on the login page, not a dead end).
  await page.goto("/?code=invalid-test-code");

  await page.waitForURL(/\/(generate|login)/);
  await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();
});
