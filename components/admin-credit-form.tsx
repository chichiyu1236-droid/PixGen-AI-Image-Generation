"use client";

import { Loader2, PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

type Result =
  | {
      profile: {
        email: string | null;
        credits: number;
      };
    }
  | { error: string };

export function AdminCreditForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const body = (await response.json()) as Result;

      if (!response.ok || "error" in body) {
        setMessage("调整失败，请确认邮箱是否存在且你有管理员权限。");
        return;
      }

      setMessage(`${body.profile.email} 当前积分：${body.profile.credits}`);
      router.refresh();
    } catch {
      setMessage("网络异常，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">补发积分</h2>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-2 text-sm font-semibold">
          用户邮箱
          <input
            name="email"
            type="email"
            required
            className="rounded-md border border-ink/15 px-3 py-2 font-normal outline-none transition focus:border-steel"
            placeholder="user@example.com"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          补发数量
          <input
            name="amount"
            type="number"
            min={1}
            max={10000}
            defaultValue={20}
            required
            className="rounded-md border border-ink/15 px-3 py-2 font-normal outline-none transition focus:border-steel"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          备注
          <input
            name="reason"
            defaultValue="Development testing credit top-up"
            className="rounded-md border border-ink/15 px-3 py-2 font-normal outline-none transition focus:border-steel"
          />
        </label>
      </div>
      <button
        disabled={loading}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="animate-spin" size={18} /> : <PlusCircle size={18} />}
        补发积分
      </button>
      {message ? <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-ink/70">{message}</p> : null}
    </form>
  );
}
