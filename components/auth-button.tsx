"use client";

import { LogIn, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function GoogleLoginButton({
  next = "/generate",
  className = "inline-flex items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-2.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]",
}: {
  next?: string;
  className?: string;
}) {
  async function signIn() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <button type="button" onClick={signIn} className={className}>
      <LogIn size={16} aria-hidden />
      Google 登录
    </button>
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
