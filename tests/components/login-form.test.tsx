import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "@/app/auth/reset-password/page";
import { LoginForm } from "@/components/login-form";

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

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    authMock.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    authMock.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    authMock.signUp.mockResolvedValue({ data: { session: null }, error: null });
    authMock.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    authMock.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com" }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("sends 6-digit email OTP with 60s cooldown and verifies with type=email before redirecting to safe next", async () => {
    vi.useFakeTimers();
    render(<LoginForm next="/upgrade" />);

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

  it("supports password sign-in, sign-up, and sanitizes external next URLs back to /generate", async () => {
    render(<LoginForm next="https://attacker.example/steal" />);

    fireEvent.click(screen.getByRole("tab", { name: "密码登录" }));
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
    expect(routerMock.push).toHaveBeenCalledWith("/generate");

    // Switch to sign-up sub-mode
    fireEvent.click(screen.getByRole("button", { name: "注册新账号" }));
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    await waitFor(() => {
      expect(authMock.signUp).toHaveBeenCalledWith({
        email: "member@pixgen.cn",
        password: "secret123",
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fgenerate`,
        },
      });
    });
    expect(screen.getByRole("status").textContent).toContain("验证邮件已发送");
  });

  it("triggers forgot-password email pointing to /auth/callback?next=/auth/reset-password", async () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole("tab", { name: "密码登录" }));
    fireEvent.click(screen.getByRole("button", { name: "忘记密码？" }));

    fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
      target: { value: "forgot@pixgen.cn" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }));

    await waitFor(() => {
      expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith("forgot@pixgen.cn", {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });
    });
    expect(screen.getByRole("status").textContent).toContain("密码重置邮件已发送");
  });

  it("renders callback error alerts, password reset success banner, and Google secondary login error feedback", async () => {
    const { rerender } = render(<LoginForm initialError="auth_callback_failed" next="/upgrade" />);

    expect(screen.getByRole("alert").textContent).toContain("登录授权链接已失效或验证失败");

    rerender(<LoginForm resetSuccess next="/upgrade" />);
    expect(screen.getByRole("status").textContent).toContain("密码已重置成功");

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
    expect(screen.queryByLabelText("新密码")).toBeNull();
    expect(screen.getByRole("link", { name: "返回登录页" }).getAttribute("href")).toBe("/login");
  });

  it("validates confirmation, updates password, signs out, and redirects to /login?reset=success", async () => {
    authMock.getUser.mockResolvedValueOnce({
      data: { user: { id: "u-reset", email: "reset@pixgen.cn" } },
      error: null,
    });
    authMock.updateUser.mockResolvedValueOnce({ data: { user: {} }, error: null });
    authMock.signOut.mockResolvedValueOnce({ error: null });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("新密码")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("新密码"), { target: { value: "newpass123" } });
    fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: "mismatch" } });
    fireEvent.click(screen.getByRole("button", { name: "确认修改密码" }));

    expect(screen.getByRole("alert").textContent).toContain("两次输入的密码不一致");
    expect(authMock.updateUser).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: "newpass123" } });
    fireEvent.click(screen.getByRole("button", { name: "确认修改密码" }));

    await waitFor(() => {
      expect(authMock.updateUser).toHaveBeenCalledWith({ password: "newpass123" });
    });
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
    expect(routerMock.replace).toHaveBeenCalledWith("/login?reset=success");
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});
