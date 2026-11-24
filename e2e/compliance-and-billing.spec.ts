import { expect, test } from "@playwright/test";

test.describe("Auth entry and legal compliance pages", () => {
  test("guest clicks login from landing page and uses dual-mode OTP / password login UI", async ({ page }) => {
    await page.goto("/");

    const loginLink = page.locator('header nav a[href="/login"]');
    await expect(loginLink).toBeVisible();
    await loginLink.click();

    await page.waitForURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();

    // Default tab is 6-digit email OTP login/signup.
    const otpTab = page.getByRole("tab", { name: "验证码登录" });
    const passwordTab = page.getByRole("tab", { name: "密码登录" });
    await expect(otpTab).toHaveAttribute("aria-selected", "true");
    await expect(passwordTab).toHaveAttribute("aria-selected", "false");
    await expect(page.getByLabel("6 位邮箱验证码")).toBeVisible();
    await expect(page.getByRole("button", { name: "获取验证码" })).toBeVisible();
    await expect(page.getByRole("button", { name: "验证并登录" })).toBeVisible();

    // Secondary Google login is placed below the divider.
    await expect(page.getByText("或使用其他方式")).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();

    // Switch to password mode and verify signin / signup / forgot-password controls.
    await passwordTab.click();
    await expect(passwordTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "登录已有账号" })).toBeVisible();
    await expect(page.getByRole("button", { name: "注册新账号" })).toBeVisible();
    await expect(page.getByRole("button", { name: "使用邮箱密码登录" })).toBeVisible();

    await page.getByRole("button", { name: "忘记密码？" }).click();
    await expect(page.getByText("通过邮箱重置密码")).toBeVisible();
    await expect(page.getByRole("button", { name: "发送重置邮件" })).toBeVisible();

    // Compliance links at the bottom of /login.
    await expect(page.locator('a[href="/terms"]')).toBeVisible();
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
  });

  test("/terms and /privacy are publicly accessible without login and cross-linked", async ({ page }) => {
    const termsRes = await page.goto("/terms");
    expect(termsRes?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "服务条款与退款规则" })).toBeVisible();
    await expect(page.getByText("不会开通任何形式的自动续费或周期免密代扣")).toBeVisible();
    await expect(page.getByText("标准月卡")).toBeVisible();
    await expect(page.getByText("¥19.90")).toBeVisible();
    await expect(page.getByRole("heading", { name: /数字商品退款与争议处理政策/ })).toBeVisible();

    await page.locator('header a[href="/privacy"]').click();
    await page.waitForURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "隐私政策" })).toBeVisible();
    await expect(page.getByText("不留存银行卡号与支付密码")).toBeVisible();
    await expect(page.locator('header a[href="/terms"]')).toBeVisible();
  });

  test("unauthenticated /billing and /upgrade redirect to /login with next parameter", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForURL(/\/login\?next=(?:%2F|\/)billing/);
    await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();

    await page.goto("/upgrade");
    await page.waitForURL(/\/login\?next=(?:%2F|\/)upgrade/);
    await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();
  });

  test("/auth/reset-password shows expired link guidance when opened without a recovery session", async ({ page }) => {
    await page.goto("/auth/reset-password");
    await expect(page.getByRole("heading", { name: "设置新密码" })).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toContainText("重置链接已失效或已过期");
    await expect(page.getByRole("link", { name: "返回登录页" })).toHaveAttribute("href", "/login");
  });
});
