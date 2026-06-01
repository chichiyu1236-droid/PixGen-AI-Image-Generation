import { expect, test } from "@playwright/test";

test("home page renders and login entry is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "勾选需求，生成更专业的商业图片" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Google 登录" })).toBeVisible();
});

test("unauthenticated generation page redirects to login", async ({ page }) => {
  await page.goto("/generate");
  await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();
});
