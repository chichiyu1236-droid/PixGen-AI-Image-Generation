import { expect, test } from "@playwright/test";

test("home page renders and login entry is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /把想法/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Google 登录" }).first()).toBeVisible();
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
