import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "@/app/auth/reset-password/page";
import { LoginForm, mapAuthErrorMessage } from "@/components/login-form";

const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

const authMock = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithOAuth: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/login",
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: authMock,
  }),
}));

describe("mapAuthErrorMessage", () => {
  it("translates rate limits, invalid credentials, unconfirmed email, and unknown errors into Chinese", () => {
    expect(mapAuthErrorMessage({ message: "email rate limit exceeded" }, "send_otp")).toBe(
      "邮件发送过于频繁，请稍后再试。",
    );
    expect(
      mapAuthErrorMessage(
        { message: "For security purposes, you can only request this after 42 seconds." },
        "forgot_password",
      ),
    ).toBe("邮件发送过于频繁，请稍后再试。");
    expect(mapAuthErrorMessage({ message: "Too many requests", status: 429 }, "verify_otp")).toBe(
      "请求过于频繁，请稍后再试。",
    );
    expect(mapAuthErrorMessage({ message: "Invalid login credentials" }, "password_signin")).toBe(
      "邮箱或密码有误，请检查后重试。",
    );
    expect(mapAuthErrorMessage({ message: "Email not confirmed" }, "password_signin")).toBe(
      "该邮箱尚未完成验证，请先使用「验证码登录 / 注册」验证邮箱。",
    );
    expect(
      mapAuthErrorMessage({ message: "Database error querying schema" }, "password_signin"),
    ).toBe("密码登录失败，请稍后重试。");
    expect(mapAuthErrorMessage({ message: "Token has expired or is invalid" }, "verify_otp")).toBe(
      "验证码错误或已过期，请核对后重试或重新获取。",
    );
  });
});

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    authMock.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    authMock.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    authMock.signUp.mockResolvedValue({ data: { session: null }, error: null });
    authMock.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    authMock.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com" },
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("uses OTP tab as unified login/signup entry with 5-credit auto-signup hint, 60s cooldown, and safe next redirect", async () => {
    vi.useFakeTimers();
    render(<LoginForm next="/upgrade" />);

    const otpTab = screen.getByRole("tab", { name: "验证码登录 / 注册" });
    expect(otpTab.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByText(/未注册邮箱验证 6 位验证码后自动创建账号并获赠 5 张试用积分/),
    ).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
      target: { value: "  creator@pixgen.cn  " },
    });

    const sendBtn = screen.getByRole("button", { name: "获取验证码" });
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    expect(authMock.signInWithOtp).toHaveBeenCalledWith({
      email: "creator@pixgen.cn",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fupgrade`,
      },
    });

    const cooldownBtn = screen.getByRole("button", { name: "60s 后重发" });
    expect((cooldownBtn as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: "59s 后重发" })).toBeDefined();

    fireEvent.change(screen.getByLabelText("6 位邮箱验证码"), {
      target: { value: "123 456" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    });

    expect(authMock.verifyOtp).toHaveBeenCalledWith({
      email: "creator@pixgen.cn",
      token: "123456",
      type: "email",
    });
    expect(routerMock.push).toHaveBeenCalledWith("/upgrade");
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("keeps only password sign-in (no sign-up sub-mode) on password tab and sanitizes external next URLs", async () => {
    render(<LoginForm next="https://attacker.example/steal" />);

    fireEvent.click(screen.getByRole("tab", { name: "密码登录" }));

    expect(screen.queryByRole("button", { name: "注册新账号" })).toBeNull();
    expect(screen.queryByRole("button", { name: "创建账号" })).toBeNull();
    expect(screen.getByText("已有账号密码登录")).toBeDefined();
    expect(screen.getByRole("button", { name: "忘记密码 / 首次设置密码？" })).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
      target: { value: "member@pixgen.cn" },
    });
    fireEvent.change(screen.getByPlaceholderText("至少 6 位字符"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "使用邮箱密码登录" }));

    await waitFor(() => {
      expect(authMock.signInWithPassword).toHaveBeenCalledWith({
        email: "member@pixgen.cn",
        password: "secret123",
      });
    });
    expect(authMock.signUp).not.toHaveBeenCalled();
    expect(routerMock.push).toHaveBeenCalledWith("/generate");
  });

  it("triggers password setup / reset email pointing to /auth/callback?next=/auth/reset-password", async () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole("tab", { name: "密码登录" }));
    fireEvent.click(screen.getByRole("button", { name: "忘记密码 / 首次设置密码？" }));

    expect(
      screen.getByText(/验证码注册的用户也可通过此入口给邮箱设置登录密码/),
    ).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
      target: { value: "forgot@pixgen.cn" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送设置 / 重置邮件" }));

    await waitFor(() => {
      expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith("forgot@pixgen.cn", {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });
    });
    expect(screen.getByRole("status").textContent).toContain("密码设置 / 重置邮件已发送");
  });

  it("never renders raw English Supabase errors across OTP send, OTP verify, password sign-in, and forgot-password", async () => {
    render(<LoginForm />);

    // 1) OTP send: email rate limit exceeded
    authMock.signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { message: "email rate limit exceeded" },
    });
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
      target: { value: "user@pixgen.cn" },
    });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("邮件发送过于频繁，请稍后再试。");
    });
    expect(screen.getByRole("alert").textContent).not.toMatch(/rate limit|exceeded/i);

    // 2) OTP verify: unexpected upstream English error
    authMock.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Token has expired or is invalid" },
    });
    fireEvent.change(screen.getByLabelText("6 位邮箱验证码"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "验证码错误或已过期，请核对后重试或重新获取。",
      );
    });
    expect(screen.getByRole("alert").textContent).not.toMatch(/token|expired|invalid/i);

    // 3) Password sign-in: Email not confirmed & Invalid login credentials
    fireEvent.click(screen.getByRole("tab", { name: "密码登录" }));
    fireEvent.change(screen.getByPlaceholderText("至少 6 位字符"), {
      target: { value: "secret123" },
    });

    authMock.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Email not confirmed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "使用邮箱密码登录" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "该邮箱尚未完成验证，请先使用「验证码登录 / 注册」验证邮箱。",
      );
    });

    authMock.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });
    fireEvent.click(screen.getByRole("button", { name: "使用邮箱密码登录" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("邮箱或密码有误，请检查后重试。");
    });

    // 4) Forgot password: email rate limit exceeded
    fireEvent.click(screen.getByRole("button", { name: "忘记密码 / 首次设置密码？" }));
    authMock.resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: { message: "email rate limit exceeded" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送设置 / 重置邮件" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("邮件发送过于频繁，请稍后再试。");
    });
    expect(screen.getByRole("alert").textContent).not.toMatch(/rate limit|exceeded/i);
  });

  it("renders callback error alerts, password reset success banner, and Google secondary login error feedback", async () => {
    const { rerender } = render(<LoginForm initialError="auth_callback_failed" next="/upgrade" />);

    expect(screen.getByRole("alert").textContent).toContain("登录授权链接已失效或验证失败");

    rerender(<LoginForm resetSuccess next="/upgrade" />);
    expect(screen.getByRole("status").textContent).toContain("密码已设置 / 重置成功");

    authMock.signInWithOAuth.mockResolvedValueOnce({
      data: { url: null },
      error: { message: "network unreachable" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Google 登录" }));

    await waitFor(() => {
      expect(authMock.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Fupgrade`,
        },
      });
    });
    expect(screen.getByRole("alert").textContent).toContain("海外网络");
  });
});

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("blocks blind submission when no valid recovery session exists", async () => {
    authMock.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("重置链接已失效或已过期");
    });
    expect(screen.getByRole("heading", { name: "设置 / 重置登录密码" })).toBeDefined();
    expect(screen.queryByLabelText("新密码")).toBeNull();
    expect(screen.getByRole("link", { name: "返回登录页" }).getAttribute("href")).toBe("/login");
  });

  it("validates confirmation, updates password, signs out, and redirects to /login?reset=success", async () => {
    authMock.getUser.mockResolvedValueOnce({
      data: { user: { id: "u-reset", email: "reset@pixgen.cn" } },
    });
    authMock.updateUser.mockResolvedValueOnce({ data: { user: {} }, error: null });
    authMock.signOut.mockResolvedValueOnce({ error: null });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("新密码")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("新密码"), { target: { value: "newpass123" } });
    fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: "mismatch" } });
    fireEvent.click(screen.getByRole("button", { name: "确认保存密码" }));

    expect(screen.getByRole("alert").textContent).toContain("两次输入的密码不一致");
    expect(authMock.updateUser).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: "newpass123" } });
    fireEvent.click(screen.getByRole("button", { name: "确认保存密码" }));

    await waitFor(() => {
      expect(authMock.updateUser).toHaveBeenCalledWith({ password: "newpass123" });
    });
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
    expect(routerMock.replace).toHaveBeenCalledWith("/login?reset=success");
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});
