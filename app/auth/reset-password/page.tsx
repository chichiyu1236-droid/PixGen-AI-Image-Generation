"use client";

import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BrandMark } from "@/components/app-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SessionState = "checking" | "invalid" | "ready";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function verifyRecoverySession() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!active) return;

        if (userError || !user) {
          setSessionState("invalid");
          return;
        }

        setUserEmail(user.email ?? null);
        setSessionState("ready");
      } catch {
        if (active) {
          setSessionState("invalid");
        }
      }
    }

    void verifyRecoverySession();

    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("新密码长度不能少于 6 位。");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致，请核对后重试。");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        const msg = (updateError.message ?? "").toLowerCase();
        if (/rate|limit|seconds|too many requests/i.test(msg)) {
          setError("操作过于频繁，请稍后再试。");
        } else if (/different from the old password|same_password/i.test(msg)) {
          setError("新密码不能与原密码相同，请修改后重试。");
        } else {
          setError("密码设置失败，请检查密码格式（不少于 6 位）或稍后重试。");
        }
        return;
      }

      await supabase.auth.signOut().catch(() => undefined);
      router.replace("/login?reset=success");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col justify-between bg-[#f6f3ea] px-5 py-8 text-[#171916] sm:px-10">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
        <BrandMark href="/" compact />
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
        >
          <ArrowLeft size={13} aria-hidden />
          返回登录
        </Link>
      </div>

      <section className="mx-auto my-10 w-full max-w-md rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3]/94 p-7 shadow-[0_24px_64px_rgba(23,25,22,0.065)] backdrop-blur sm:p-9">
        <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">
          PASSWORD SETUP
        </p>
        <h1 className="mt-2.5 font-display text-3xl font-normal leading-tight text-[#171916]">
          设置 / 重置登录密码
        </h1>

        {sessionState === "checking" ? (
          <div className="mt-8 flex items-center gap-2.5 text-sm text-[#484e45]">
            <Loader2 size={16} className="animate-spin text-[#566c58]" aria-hidden />
            <span>正在核验登录状态与链接有效性…</span>
          </div>
        ) : sessionState === "invalid" ? (
          <div className="mt-6 space-y-5">
            <p
              role="alert"
              className="rounded-xl border border-[#b45340]/25 bg-[#fdf3f0] px-4 py-3 text-xs leading-6 text-[#8a3222]"
            >
              重置链接已失效或已过期。请返回登录页，在「密码登录 → 忘记密码 / 首次设置密码？」中重新发送邮件。
            </p>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
            >
              返回登录页
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-[#484e45]">
              {userEmail
                ? `正在为账号 ${userEmail} 设置或重置登录密码，保存后可使用邮箱密码直接登录。`
                : "请输入不少于 6 位的登录密码，保存后可使用邮箱密码直接登录。"}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="grid gap-1.5 text-xs font-medium text-[#484e45]">
                <span>新密码</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 6 位字符"
                  className="rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-4 py-3 text-sm text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-[#484e45]">
                <span>确认新密码</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入新密码"
                  className="rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-4 py-3 text-sm text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
                />
              </label>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-[#b45340]/25 bg-[#fdf3f0] px-3.5 py-2.5 text-xs text-[#8a3222]"
                >
                  {error}
                </p>
              ) : null}

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
                <span>{submitting ? "正在保存…" : "确认保存密码"}</span>
              </button>
            </form>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[#6d7368]">
        <span className="text-[#92978b]">PixGen</span>
        <span aria-hidden className="text-[#171916]/15">
          ·
        </span>
        <Link className="underline-offset-4 transition hover:text-[#171916] hover:underline" href="/terms">
          服务条款
        </Link>
        <Link className="underline-offset-4 transition hover:text-[#171916] hover:underline" href="/privacy">
          隐私政策
        </Link>
      </div>
    </main>
  );
}
