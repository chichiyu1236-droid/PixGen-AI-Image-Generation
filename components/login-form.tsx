"use client";

import { KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { GoogleLoginButton } from "@/components/auth-button";
import { getSafeNextPath } from "@/lib/auth/redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_COOLDOWN_SECONDS = 60;

function mapInitialErrorMessage(code?: string): string | null {
  if (!code) return null;
  switch (code) {
    case "auth_callback_failed":
      return "登录授权链接已失效或验证失败，请重新获取验证码或使用密码登录。";
    case "oauth_failed":
      return "第三方登录未完成，请重试或改用邮箱登录。";
    case "otp_expired":
      return "邮件验证码或重置链接已过期，请重新发送。";
    default:
      return "登录状态校验未通过，请重新登录。";
  }
}

export type LoginFormProps = {
  next?: string;
  initialError?: string;
  resetSuccess?: boolean;
};

export function LoginForm({
  next = "/generate",
  initialError,
  resetSuccess = false,
}: LoginFormProps) {
  const router = useRouter();
  const safeNext = getSafeNextPath(next);

  const [authTab, setAuthTab] = useState<"otp" | "password">(resetSuccess ? "password" : "otp");
  const [passwordView, setPasswordView] = useState<"signin" | "signup" | "forgot">("signin");

  const [email, setEmail] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [password, setPassword] = useState("");

  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [error, setError] = useState<string | null>(() => mapInitialErrorMessage(initialError));
  const [notice, setNotice] = useState<string | null>(() =>
    resetSuccess ? "密码已重置成功，请使用新密码登录。" : null,
  );

  const incomingPropsKey = `${initialError ?? ""}|${resetSuccess ? "1" : "0"}`;
  const [syncedPropsKey, setSyncedPropsKey] = useState(incomingPropsKey);
  if (syncedPropsKey !== incomingPropsKey) {
    setSyncedPropsKey(incomingPropsKey);
    setError(mapInitialErrorMessage(initialError));
    setNotice(resetSuccess ? "密码已重置成功，请使用新密码登录。" : null);
    if (resetSuccess) {
      setAuthTab("password");
      setPasswordView("signin");
    }
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function clearFeedback() {
    setError(null);
    setNotice(null);
  }

  async function onSendOtp() {
    clearFeedback();
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("请输入有效的邮箱地址。");
      return;
    }

    setSendingOtp(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        },
      });

      if (otpError) {
        const isRateLimit = /rate|seconds|limit/i.test(otpError.message);
        setError(isRateLimit ? "验证码发送过于频繁，请稍后再试。" : "验证码发送失败，请稍后重试。");
        return;
      }

      setCooldown(OTP_COOLDOWN_SECONDS);
      setNotice(`6 位验证码已发送至 ${trimmedEmail}，请查收邮件（含垃圾邮件夹）。`);
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSendingOtp(false);
    }
  }

  async function onVerifyOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();

    const trimmedEmail = email.trim();
    const cleanToken = otpToken.replace(/\D/g, "");

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("请输入有效的邮箱地址。");
      return;
    }
    if (cleanToken.length !== 6) {
      setError("请输入邮件中的 6 位数字验证码。");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: cleanToken,
        type: "email",
      });

      if (verifyError) {
        setError("验证码错误或已过期，请核对后重试或重新获取。");
        return;
      }

      router.push(safeNext);
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();

    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail) || password.length < 6) {
      setError("请输入有效邮箱，且密码不少于 6 位。");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();

      if (passwordView === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (signInError) {
          setError("邮箱或密码有误，请检查后重试。");
          return;
        }

        router.push(safeNext);
        router.refresh();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
          },
        });

        if (signUpError) {
          setError(signUpError.message || "注册失败，请稍后重试。");
          return;
        }

        if (data.session) {
          router.push(safeNext);
          router.refresh();
        } else {
          setNotice("验证邮件已发送，请点击邮件链接确认，或切回「验证码登录」输入邮件中的 6 位验证码完成登录。");
        }
      }
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgotPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();

    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("请输入需要找回密码的注册邮箱。");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });

      if (resetError) {
        setError("重置邮件发送失败，请稍后重试。");
        return;
      }

      setNotice("密码重置邮件已发送，请查收邮箱并点击链接设置新密码。");
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Primary Dual-Mode Switch: 验证码登录 ⇄ 密码登录 */}
      <div
        role="tablist"
        aria-label="登录方式切换"
        className="inline-flex w-full rounded-full border border-[#171916]/10 bg-[#f4f0e5] p-1 text-xs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={authTab === "otp"}
          onClick={() => {
            setAuthTab("otp");
            clearFeedback();
          }}
          className={`flex-1 rounded-full py-2 font-medium transition ${
            authTab === "otp"
              ? "bg-[#fbf9f3] text-[#171916] shadow-sm"
              : "text-[#6d7368] hover:text-[#171916]"
          }`}
        >
          验证码登录
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authTab === "password"}
          onClick={() => {
            setAuthTab("password");
            setPasswordView("signin");
            clearFeedback();
          }}
          className={`flex-1 rounded-full py-2 font-medium transition ${
            authTab === "password"
              ? "bg-[#fbf9f3] text-[#171916] shadow-sm"
              : "text-[#6d7368] hover:text-[#171916]"
          }`}
        >
          密码登录
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[#b45340]/25 bg-[#fdf3f0] px-3.5 py-2.5 text-xs text-[#8a3222]"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-[#566c58]/25 bg-[#e7eee5] px-3.5 py-2.5 text-xs text-[#2d3e2f]"
        >
          {notice}
        </p>
      ) : null}

      {authTab === "otp" ? (
        <form onSubmit={onVerifyOtpSubmit} className="space-y-3.5">
          <label className="grid gap-1.5 text-xs font-medium text-[#484e45]">
            <span>邮箱地址</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-4 py-3 text-sm text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
            />
          </label>

          <div className="grid gap-1.5 text-xs font-medium text-[#484e45]">
            <label htmlFor="pixgen-otp-code">6 位邮箱验证码</label>
            <div className="flex items-center gap-2">
              <input
                id="pixgen-otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpToken}
                onChange={(event) => setOtpToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="输入 6 位数字"
                className="min-w-0 flex-1 rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-4 py-3 font-mono text-sm tracking-[0.18em] text-[#171916] outline-none transition placeholder:font-sans placeholder:tracking-normal placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
              />
              <button
                type="button"
                onClick={onSendOtp}
                disabled={sendingOtp || cooldown > 0}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-[#171916]/15 bg-[#fbf9f3] px-3.5 py-3 text-xs font-medium text-[#171916] transition hover:border-[#171916]/30 hover:bg-[#f4f0e5] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {sendingOtp ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
                <span>
                  {sendingOtp
                    ? "发送中…"
                    : cooldown > 0
                      ? `${cooldown}s 后重发`
                      : "获取验证码"}
                </span>
              </button>
            </div>
          </div>

          <p className="text-[11px] leading-5 text-[#6d7368]">
            未注册邮箱验证通过后自动创建新账号，免密直达工作台。
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.16)] transition hover:bg-[#2a2e28] disabled:opacity-55"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <ShieldCheck size={16} aria-hidden />
            )}
            <span>{submitting ? "正在核验…" : "验证并登录"}</span>
          </button>
        </form>
      ) : passwordView === "forgot" ? (
        <form onSubmit={onForgotPasswordSubmit} className="space-y-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[#171916]">通过邮箱重置密码</span>
            <button
              type="button"
              onClick={() => {
                setPasswordView("signin");
                clearFeedback();
              }}
              className="font-medium text-[#566c58] underline-offset-4 transition hover:text-[#171916] hover:underline"
            >
              返回密码登录
            </button>
          </div>

          <label className="grid gap-1.5 text-xs font-medium text-[#484e45]">
            <span>注册邮箱</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-4 py-3 text-sm text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
            />
          </label>

          <p className="text-[11px] leading-5 text-[#6d7368]">
            我们将向该邮箱发送密码重置链接，点击邮件链接即可设置新密码。
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.16)] transition hover:bg-[#2a2e28] disabled:opacity-55"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Mail size={15} aria-hidden />
            )}
            <span>{submitting ? "正在发送…" : "发送重置邮件"}</span>
          </button>
        </form>
      ) : (
        <form onSubmit={onPasswordSubmit} className="space-y-3.5">
          <div className="flex items-center justify-between text-xs">
            <div className="inline-flex items-center gap-3">
              <button
                type="button"
                aria-pressed={passwordView === "signin"}
                onClick={() => {
                  setPasswordView("signin");
                  clearFeedback();
                }}
                className={`font-medium transition ${
                  passwordView === "signin"
                    ? "text-[#171916] underline decoration-[#566c58] decoration-2 underline-offset-4"
                    : "text-[#6d7368] hover:text-[#171916]"
                }`}
              >
                登录已有账号
              </button>
              <span aria-hidden className="text-[#171916]/15">
                |
              </span>
              <button
                type="button"
                aria-pressed={passwordView === "signup"}
                onClick={() => {
                  setPasswordView("signup");
                  clearFeedback();
                }}
                className={`font-medium transition ${
                  passwordView === "signup"
                    ? "text-[#171916] underline decoration-[#566c58] decoration-2 underline-offset-4"
                    : "text-[#6d7368] hover:text-[#171916]"
                }`}
              >
                注册新账号
              </button>
            </div>

            {passwordView === "signin" ? (
              <button
                type="button"
                onClick={() => {
                  setPasswordView("forgot");
                  clearFeedback();
                }}
                className="font-medium text-[#566c58] underline-offset-4 transition hover:text-[#171916] hover:underline"
              >
                忘记密码？
              </button>
            ) : null}
          </div>

          <label className="grid gap-1.5 text-xs font-medium text-[#484e45]">
            <span>邮箱地址</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-4 py-3 text-sm text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
            />
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-[#484e45]">
            <span>密码</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={passwordView === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位字符"
              className="rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-4 py-3 text-sm text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.16)] transition hover:bg-[#2a2e28] disabled:opacity-55"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <KeyRound size={15} aria-hidden />
            )}
            <span>
              {submitting
                ? "请稍候…"
                : passwordView === "signin"
                  ? "使用邮箱密码登录"
                  : "创建账号"}
            </span>
          </button>
        </form>
      )}

      {/* Secondary Google OAuth Option */}
      <div className="space-y-3 pt-1">
        <div className="relative flex items-center gap-3">
          <span className="h-px flex-1 bg-[#171916]/10" />
          <span className="text-[11px] tracking-[0.14em] text-[#92978b]">或使用其他方式</span>
          <span className="h-px flex-1 bg-[#171916]/10" />
        </div>

        <div onClickCapture={clearFeedback}>
          <GoogleLoginButton next={safeNext} />
        </div>

        <p className="text-center text-[11px] text-[#92978b]">
          海外网络适用 · 国内网络推荐直接使用上方邮箱验证码或密码登录
        </p>
      </div>
    </div>
  );
}
