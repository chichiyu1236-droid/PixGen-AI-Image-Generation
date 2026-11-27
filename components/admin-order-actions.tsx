"use client";

import { Loader2, RefreshCw, SearchCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminOrder = {
  id: string;
  status: string;
};

const ADMIN_ORDER_ERROR_MESSAGES: Record<string, string> = {
  forbidden: "无管理员权限，无法执行该操作。",
  not_authenticated: "登录状态已失效，请重新登录后重试。",
  order_not_found: "未找到该订单，请刷新列表重试。",
  provider_mismatch: "该订单所属支付通道与当前配置不一致，无法查单。",
  provider_query_failed: "向支付平台查询订单状态失败，请稍后重试。",
  fulfill_failed: "订单补发失败，请稍后重试或检查日志。",
  invalid_request: "请求参数无效，请刷新页面重试。",
};

const DEFAULT_ADMIN_ORDER_ERROR = "操作失败，请稍后重试。";

export function mapAdminOrderErrorMessage(error?: string | null, serverMessage?: string | null): string {
  const normalizedError = typeof error === "string" ? error.trim() : "";
  const normalizedMessage = typeof serverMessage === "string" ? serverMessage.trim() : "";

  if (normalizedError === "provider_mismatch" && normalizedMessage) {
    return normalizedMessage;
  }

  if (normalizedError && ADMIN_ORDER_ERROR_MESSAGES[normalizedError]) {
    return ADMIN_ORDER_ERROR_MESSAGES[normalizedError];
  }

  return DEFAULT_ADMIN_ORDER_ERROR;
}

export function AdminOrderActions({ order }: { order: AdminOrder }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"query" | "fulfill" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: "query" | "fulfill") {
    setBusy(action);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/orders/${order.id}/${action}`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { result?: string; error?: string; message?: string }
        | null;

      if (!response.ok) {
        setMessage(mapAdminOrderErrorMessage(body?.error, body?.message));
        return;
      }

      const resultMessages: Record<string, string> = {
        fulfilled: "已发货",
        already_paid: "订单已是已支付状态",
        not_paid: "平台侧显示未支付",
      };
      setMessage(resultMessages[body?.result ?? ""] ?? "操作完成");
      router.refresh();
    } catch {
      setMessage("网络异常，请稍后再试。");
    } finally {
      setBusy(null);
    }
  }

  if (order.status === "paid") {
    return <span className="text-xs text-ink/40">已完结</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("query")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink/20 px-2.5 py-1.5 text-xs font-semibold transition hover:border-ink/40 disabled:opacity-60"
        >
          {busy === "query" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <SearchCheck className="h-3.5 w-3.5" aria-hidden />}
          查询平台
        </button>
        <button
          type="button"
          onClick={() => run("fulfill")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
        >
          {busy === "fulfill" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          手工补发
        </button>
      </div>
      {message ? <span className="text-xs text-ink/60">{message}</span> : null}
    </div>
  );
}
