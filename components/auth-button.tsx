"use client";

import { LogIn, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function GoogleLoginButton({ next = "/generate" }: { next?: string }) {
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
    <button onClick={signIn} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
      <LogIn size={18} />
      Google 登录
    </button>
  );
}

export function LogoutButton() {
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <button onClick={signOut} className="inline-flex items-center gap-2 rounded-md border border-ink/20 px-3 py-2 text-sm">
      <LogOut size={16} />
      退出
    </button>
  );
}
