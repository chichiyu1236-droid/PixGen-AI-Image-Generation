"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatFenAsCny } from "@/lib/billing/money";
import type { CreditPack } from "@/lib/billing/packs";

type CheckoutResult = { orderId: string; reused?: boolean } | { error: string };

const CHANNELS = [
  { id: "wechat" as const, label: "微信支付" },
  { id: "alipay" as const, label: "支付宝" },
];

const ERROR_MESSAGES: Record<string, string> = {
  too_many_pending_orders: "你有太多未完成的订单，请先完成或等待它们过期。",
  provider_unavailable: "支付通道暂时不可用，请稍后再试。",
  unknown_pack: "积分包不存在，请刷新页面重试。",
  invalid_request: "请求参数有误，请刷新页面重试。",
};

export function UpgradePlans({ packs }: { packs: CreditPack[] }) {
  const router = useRouter();
  const [channel, setChannel] = useState<"wechat" | "alipay">("wechat");
  const [loadingPackId, setLoadingPackId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isWeChat, setIsWeChat] = useState(false);

  useEffect(() => {
    // WeChat's in-app browser cannot launch WeChat Pay without an official
    // merchant mini-program, so guide users out and favor Alipay.
    if (typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent)) {
      setIsWeChat(true);
      setChannel("alipay");
    }
  }, []);

  async function onBuy(pack: CreditPack) {
    setLoadingPackId(pack.id);
    setMessage(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, channel }),
      });
      const body = (await response.json()) as CheckoutResult;

      if (!response.ok || "error" in body) {
        const error = "error" in body ? body.error : "unknown";
        setMessage(ERROR_MESSAGES[error] ?? "下单失败，请稍后再试。");
        return;
      }

      router.push(`/pay/${body.orderId}`);
    } catch {
      setMessage("网络异常，请稍后重试。");
    } finally {
      setLoadingPackId(null);
    }
  }

  return (
    <section>
      {isWeChat ? (
        <div className="mb-6 rounded-[1.25rem] border border-amber-300/60 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
          检测到你正在微信内打开本页。微信内无法拉起微信支付，请点击右上角「···」选择「在浏览器打开」，或直接使用支付宝支付。
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {CHANNELS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setChannel(item.id)}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              channel === item.id ? "bg-black text-white" : "border border-black/10 bg-white text-black hover:border-black/25"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {packs.map((pack) => (
          <div key={pack.id} className="flex flex-col rounded-[1.5rem] border border-black/10 bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.05)]">
            <p className="font-display text-xl tracking-[0.1em] text-black/40">PACK</p>
            <h2 className="mt-2 text-2xl font-bold">{pack.name}</h2>
            <p className="mt-2 text-4xl font-bold">{formatFenAsCny(pack.amountFen)}</p>
            <p className="mt-3 text-sm leading-6 text-black/60">{pack.description}</p>
            <p className="mt-1 text-xs text-black/40">{pack.credits} 积分 · 一次性购买 · 永不过期</p>
            <button
              type="button"
              onClick={() => onBuy(pack)}
              disabled={loadingPackId !== null}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/90 disabled:opacity-60"
            >
              {loadingPackId === pack.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {loadingPackId === pack.id ? "正在创建订单…" : "立即购买"}
            </button>
          </div>
        ))}
      </div>

      {message ? <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p> : null}

      <p className="mt-8 flex items-center gap-2 text-xs text-black/45">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        支付由第三方支付平台处理，支付成功后积分自动到账；如遇问题可联系管理员核实补发。
      </p>
    </section>
  );
}
