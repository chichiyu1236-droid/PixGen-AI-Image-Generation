"use client";

import { Loader2, LogIn, LogOut } from "lucide-react";
import { useState } from "react";
import { getSafeNextPath } from "@/lib/auth/redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function GoogleLoginButton({
  next = "/generate",
  className = "inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#171916]/14 bg-[#fbf9f3] px-5 py-2.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/28 hover:bg-[#f4f0e5] hover:text-[#171916] disabled:opacity-55",
}: {
  next?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    setLoading(true);
    const safeNext = getSafeNextPath(next);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        },
      });

      if (oauthError) {
        setError("Google 登录拉起失败，请确认处于海外网络环境，或直接使用上方邮箱登录。");
        setLoading(false);
      }
    } catch {
      setError("网络连接异常，Google 登录需海外网络支持，建议直接使用上方邮箱登录。");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={signIn} disabled={loading} className={className}>
        {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogIn size={15} aria-hidden />}
        <span>{loading ? "正在连接 Google…" : "Google 登录"}</span>
      </button>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[#b45340]/25 bg-[#fdf3f0] px-3.5 py-2 text-xs text-[#8a3222]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function LogoutButton({
  className = "inline-flex items-center justify-center gap-2 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-2 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]",
}: {
  className?: string;
}) {
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <button type="button" onClick={signOut} className={className}>
      <LogOut size={14} aria-hidden />
      退出登录
    </button>
  );
}
