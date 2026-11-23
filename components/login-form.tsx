"use client";

import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GoogleLoginButton } from "@/components/auth-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setError("请输入有效邮箱，且密码不少于 6 位。");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (signInError) {
          setError("邮箱或密码有误，请检查后重试。");
          return;
        }

        router.push("/generate");
        router.refresh();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/generate`,
          },
        });

        if (signUpError) {
          setError(signUpError.message || "注册失败，请稍后重试。");
          return;
        }

        if (data.session) {
          router.push("/generate");
          router.refresh();
        } else {
          setNotice("验证邮件已发送，请查收邮箱完成确认后登录。");
        }
      }
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <GoogleLoginButton className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.16)] transition hover:bg-[#2a2e28]" />

      <div className="relative flex items-center gap-3">
        <span className="h-px flex-1 bg-[#171916]/10" />
        <span className="text-[11px] tracking-[0.14em] text-[#92978b]">或使用邮箱密码</span>
        <span className="h-px flex-1 bg-[#171916]/10" />
      </div>

      <div className="inline-flex w-full rounded-full border border-[#171916]/10 bg-[#f4f0e5] p-1 text-xs">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
            setNotice(null);
          }}
          aria-pressed={mode === "signin"}
          className={`flex-1 rounded-full py-2 font-medium transition ${
            mode === "signin" ? "bg-[#fbf9f3] text-[#171916] shadow-sm" : "text-[#6d7368] hover:text-[#171916]"
          }`}
        >
          邮箱登录
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(null);
            setNotice(null);
          }}
          aria-pressed={mode === "signup"}
          className={`flex-1 rounded-full py-2 font-medium transition ${
            mode === "signup" ? "bg-[#fbf9f3] text-[#171916] shadow-sm" : "text-[#6d7368] hover:text-[#171916]"
          }`}
        >
          注册新账号
        </button>
      </div>

      <form onSubmit={onEmailSubmit} className="space-y-3.5">
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
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 6 位字符"
            className="rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-4 py-3 text-sm text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-xl border border-[#b45340]/25 bg-[#fdf3f0] px-3.5 py-2.5 text-xs text-[#8a3222]">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-xl border border-[#566c58]/25 bg-[#e7eee5] px-3.5 py-2.5 text-xs text-[#2d3e2f]">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#171916]/15 bg-[#fbf9f3] px-5 py-3 text-sm font-medium text-[#171916] transition hover:border-[#171916]/35 hover:bg-[#f4f0e5] disabled:opacity-55"
        >
          {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Mail size={15} aria-hidden />}
          {loading ? "请稍候…" : mode === "signin" ? "使用邮箱登录" : "创建账号"}
        </button>
      </form>
    </div>
  );
}
