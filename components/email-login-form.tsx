"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function EmailLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("邮箱或密码错误");
      } else {
        window.location.href = "/generate";
      }
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="email"
        placeholder="邮箱"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30"
      />
      <input
        type="password"
        placeholder="密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-black/30"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black transition hover:border-black/25 disabled:opacity-60"
      >
        {loading ? "登录中..." : "邮箱登录"}
      </button>
    </form>
  );
}
