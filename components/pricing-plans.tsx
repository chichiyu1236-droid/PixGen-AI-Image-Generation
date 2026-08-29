"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatFenAsCny } from "@/lib/billing/money";
import type { MembershipPlan } from "@/lib/billing/plans";

type CheckoutResult = { orderId: string; reused?: boolean } | { error: string };

const CHANNELS = [
  { id: "wechat" as const, label: "微信支付" },
  { id: "alipay" as const, label: "支付宝" },
];

const ERROR_MESSAGES: Record<string, string> = {
  too_many_pending_orders: "你有太多未完成的订单，请先完成或等待它们过期。",
  provider_unavailable: "支付通道暂时不可用，请稍后再试。",
  unknown_sku: "商品不存在，请刷新页面重试。",
  invalid_request: "请求参数有误，请刷新页面重试。",
};

const TIERS = [
  { quota: 100, label: "标准", blurb: "适合偶尔生成灵感的轻量用户", popular: false },
  { quota: 300, label: "Pro", blurb: "适合高频创作的重度用户", popular: true },
];

function savingsPercent(monthly: MembershipPlan, yearly: MembershipPlan): number {
  const fullPrice = monthly.amountFen * 12;

  return Math.round(((fullPrice - yearly.amountFen) / fullPrice) * 100);
}

export function PricingPlans({ plans }: { plans: MembershipPlan[] }) {
  const router = useRouter();
  const [channel, setChannel] = useState<"wechat" | "alipay">("wechat");
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
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

  function planForTier(quota: number): MembershipPlan | undefined {
    return plans.find(
      (plan) => plan.quotaPerTranche === quota && (billing === "monthly" ? plan.periodDays === 30 : plan.periodDays === 365),
    );
  }

  async function onBuy(plan: MembershipPlan) {
    setLoadingPlanId(plan.id);
    setMessage(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, channel }),
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
      setLoadingPlanId(null);
    }
  }

  return (
    <section>
      {isWeChat ? (
        <div className="mb-6 rounded-[1.25rem] border border-amber-300/60 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
          检测到你正在微信内打开本页。微信内无法拉起微信支付，请点击右上角「···」选择「在浏览器打开」，或直接使用支付宝支付。
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center justify-center gap-6">
        <div className="flex items-center rounded-full border border-black/10 bg-white p-1">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              billing === "monthly" ? "bg-black text-white" : "text-black/60 hover:text-black"
            }`}
          >
            月付
          </button>
          <button
            type="button"
            onClick={() => setBilling("yearly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              billing === "yearly" ? "bg-black text-white" : "text-black/60 hover:text-black"
            }`}
          >
            年付省 17%
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col rounded-[1.5rem] border border-black/10 bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.05)]">
          <p className="font-display text-xl tracking-[0.1em] text-black/40">FREE</p>
          <h2 className="mt-2 text-2xl font-bold">免费体验</h2>
          <p className="mt-3 text-4xl font-bold">¥0</p>
          <p className="mt-3 text-sm leading-6 text-black/60">注册即送 5 张体验积分（一次性），一张图一分。</p>
          <button
            type="button"
            disabled
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-black/40"
          >
            当前方案
          </button>
          <ul className="mt-6 space-y-2 text-sm leading-6 text-black/60">
            <li>✓ 5 张一次性体验积分，不刷新</li>
            <li>✓ 经典 / Agent / 参考图全部模式</li>
            <li>✓ 可随时加购积分包</li>
          </ul>
        </div>

        {TIERS.map((tier) => {
          const plan = planForTier(tier.quota);

          if (!plan) {
            return null;
          }

          const monthlyPlan = plans.find((candidate) => candidate.quotaPerTranche === tier.quota && candidate.periodDays === 30);
          const savings = monthlyPlan && billing === "yearly" ? savingsPercent(monthlyPlan, plan) : 0;

          return (
            <div
              key={tier.quota}
              className={`relative flex flex-col rounded-[1.5rem] border p-6 shadow-[0_18px_50px_rgba(0,0,0,0.05)] ${
                tier.popular ? "border-black/70 bg-white" : "border-black/10 bg-white"
              }`}
            >
              {tier.popular ? (
                <span className="absolute -top-3 left-6 rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              ) : null}
              <p className="font-display text-xl tracking-[0.1em] text-black/40">{tier.label.toUpperCase()}</p>
              <h2 className="mt-2 text-2xl font-bold">{plan.name}</h2>
              <p className="mt-3 text-4xl font-bold">
                {formatFenAsCny(plan.amountFen)}
                <span className="ml-1 text-base font-medium text-black/45">{billing === "monthly" ? "/月" : "/年"}</span>
              </p>
              {savings > 0 ? (
                <p className="mt-1 text-xs font-semibold text-emerald-700">较月付省 {savings}%</p>
              ) : (
                <p className="mt-1 text-xs text-black/45">{tier.blurb}</p>
              )}
              <button
                type="button"
                onClick={() => onBuy(plan)}
                disabled={loadingPlanId !== null}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/90 disabled:opacity-60"
              >
                {loadingPlanId === plan.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {loadingPlanId === plan.id ? "正在创建订单…" : "立即开通"}
              </button>
              <ul className="mt-6 space-y-2 text-sm leading-6 text-black/60">
                <li>✓ 每期 {plan.quotaPerTranche} 张生成额度</li>
                <li>✓ {billing === "yearly" ? `年卡共 ${plan.tranches} 期，按 30 天逐期发放` : "会员期 30 天"}</li>
                <li>✓ 订阅积分优先消耗，永久积分兜底</li>
                <li>✓ 有效期内续费/升级随时顺延</li>
              </ul>
            </div>
          );
        })}
      </div>

      {message ? <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p> : null}

      <p className="mt-8 flex items-center gap-2 text-xs text-black/45">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        会员卡为手动续费：到期前 3 天站内提醒，再次购买即顺延会员期并发放新一期额度，不会自动扣款；每期额度按期有效、不滚存。
      </p>
    </section>
  );
}
