"use client";

import { Check, CreditCard, Loader2, Mail, ShieldCheck, Sparkles, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatFenAsCny } from "@/lib/billing/money";
import type { MembershipPlan } from "@/lib/billing/plans";
import {
  buildSupportMailto,
  getSupportEmail,
  isSafeHttpsUrl,
  redirectToExternalUrl,
} from "@/lib/billing/support";

type CheckoutResult =
  | { orderId: string; reused?: boolean; redirectUrl?: string }
  | { error: string };

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
  { quota: 100, label: "标准", blurb: "适合日常出图与轻量使用", popular: false },
  { quota: 300, label: "Pro", blurb: "适合高频出图与多轮改图", popular: true },
];

const FAQ_ITEMS = [
  {
    q: "会触发自动续费吗？",
    a: "不会。所有会员卡均为手动续费，到期前 3 天站内提醒，不会自动扣款。",
  },
  {
    q: "会员期内续费或升级怎么计算？",
    a: "立即发放所购档位一期额度，会员有效期在原到期日基础上叠加顺延。",
  },
  {
    q: "订阅积分与永久积分如何扣减？",
    a: "优先扣减当期订阅池积分，订阅池用完后自动使用永久池积分兜底，永久积分不过期。",
  },
] as const;

function savingsPercent(monthly: MembershipPlan, yearly: MembershipPlan): number {
  const fullPrice = monthly.amountFen * 12;

  return Math.round(((fullPrice - yearly.amountFen) / fullPrice) * 100);
}

export function PricingPlans({
  plans,
  billingProvider = "mock",
  supportEmail,
}: {
  plans: MembershipPlan[];
  billingProvider?: string;
  supportEmail?: string;
}) {
  const router = useRouter();
  const isStripe = (billingProvider ?? "mock").trim().toLowerCase() === "stripe";
  const resolvedSupportEmail = (supportEmail ?? getSupportEmail()).trim();
  const supportMailto = buildSupportMailto(resolvedSupportEmail, { subject: "PixGen 会员购买咨询" });
  const [channel, setChannel] = useState<"wechat" | "alipay">("wechat");
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isWeChat, setIsWeChat] = useState(false);

  useEffect(() => {
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
        body: JSON.stringify({
          planId: plan.id,
          channel: isStripe ? "stripe" : channel,
        }),
      });
      const body = (await response.json().catch(() => null)) as CheckoutResult | null;

      if (!response.ok || !body || "error" in body) {
        const error = body && "error" in body ? body.error : "unknown";
        setMessage(ERROR_MESSAGES[error] ?? "下单失败，请稍后再试。");
        return;
      }

      if (body.redirectUrl && isSafeHttpsUrl(body.redirectUrl)) {
        redirectToExternalUrl(body.redirectUrl);
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
    <section className="space-y-8">
      {isWeChat && !isStripe ? (
        <div className="rounded-2xl border border-[#b48a52]/35 bg-[#f6ebd9] px-5 py-4 text-sm leading-6 text-[#5a411e]">
          检测到你正在微信内打开本页。微信内无法拉起微信支付，请点击右上角「···」选择「在浏览器打开」，或直接使用支付宝支付。
        </div>
      ) : null}

      {/* Billing Cycle & Payment Channel Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/88 p-3 shadow-[0_12px_32px_rgba(23,25,22,0.04)]">
        <div className="inline-flex items-center rounded-full border border-[#171916]/10 bg-[#f4f0e5] p-1">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            aria-pressed={billing === "monthly"}
            className={`rounded-full px-5 py-2 text-xs font-semibold transition sm:text-sm ${
              billing === "monthly" ? "bg-[#171916] text-[#faf7ef] shadow-sm" : "text-[#484e45] hover:text-[#171916]"
            }`}
          >
            月付
          </button>
          <button
            type="button"
            onClick={() => setBilling("yearly")}
            aria-pressed={billing === "yearly"}
            className={`rounded-full px-5 py-2 text-xs font-semibold transition sm:text-sm ${
              billing === "yearly" ? "bg-[#171916] text-[#faf7ef] shadow-sm" : "text-[#484e45] hover:text-[#171916]"
            }`}
          >
            年付省 17%
          </button>
        </div>

        {isStripe ? (
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#566c58]/20 bg-[#e7eee5]/70 px-4 py-2 text-xs text-[#384a3a]">
            <CreditCard size={14} className="shrink-0" aria-hidden />
            <span>Stripe 安全收银台 · 支持支付宝 / 微信支付 / 银行卡（人民币单次付款）</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#6d7368]">支付方式</span>
            {CHANNELS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setChannel(item.id)}
                aria-pressed={channel === item.id}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                  channel === item.id
                    ? "bg-[#384a3a] text-[#faf7ef]"
                    : "border border-[#171916]/12 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/30 hover:text-[#171916]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Three-Column Oil Gallery Pricing Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Free Tier */}
        <div className="flex flex-col rounded-[1.85rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-7 shadow-[0_18px_48px_rgba(23,25,22,0.045)]">
          <p className="font-display text-xs tracking-[0.22em] text-[#6d7368]">FREE</p>
          <h2 className="mt-2 font-display text-2xl font-normal text-[#171916]">免费体验</h2>
          <p className="mt-4 font-display text-4xl font-normal tabular-nums text-[#171916]">¥0</p>
          <p className="mt-2 text-xs leading-5 text-[#6d7368]">5 张试用积分 · 经典模式。</p>

          <button
            type="button"
            disabled
            className="mt-6 inline-flex items-center justify-center rounded-full border border-[#171916]/10 bg-[#f4f0e5] px-5 py-3 text-sm font-medium text-[#92978b]"
          >
            当前基础层
          </button>

          <ul className="mt-7 space-y-2.5 border-t border-[#171916]/8 pt-6 text-sm leading-6 text-[#484e45]">
            <li className="flex items-start gap-2">
              <Check size={15} className="mt-1 shrink-0 text-[#566c58]" aria-hidden />
              <span>5 张一次性试用积分，不刷新</span>
            </li>
            <li className="flex items-start gap-2">
              <Check size={15} className="mt-1 shrink-0 text-[#566c58]" aria-hidden />
              <span>经典生成模式与参考图上传</span>
            </li>
            <li className="flex items-start gap-2 text-[#92978b]">
              <X size={15} className="mt-1 shrink-0" aria-hidden />
              <span>Agent 对话（会员专属）</span>
            </li>
          </ul>
        </div>

        {/* Standard & Pro Tiers */}
        {TIERS.map((tier) => {
          const plan = planForTier(tier.quota);

          if (!plan) {
            return null;
          }

          const monthlyPlan = plans.find(
            (candidate) => candidate.quotaPerTranche === tier.quota && candidate.periodDays === 30,
          );
          const savings = monthlyPlan && billing === "yearly" ? savingsPercent(monthlyPlan, plan) : 0;

          return (
            <div
              key={tier.quota}
              className={[
                "relative flex flex-col overflow-hidden rounded-[1.85rem] border p-7 transition",
                tier.popular
                  ? "border-[#566c58]/55 bg-[#fbf9f3] shadow-[0_24px_64px_rgba(56,74,58,0.12)]"
                  : "border-[#171916]/10 bg-[#fbf9f3]/92 shadow-[0_18px_48px_rgba(23,25,22,0.045)]",
              ].join(" ")}
            >
              {tier.popular ? (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 opacity-55">
                  <Image src="/images/oil-section-wash.webp" alt="" fill sizes="35vw" className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#fbf9f3]/40 to-[#fbf9f3]" />
                </div>
              ) : null}

              <div className="relative z-10 flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-xs tracking-[0.22em] text-[#6d7368]">{tier.label.toUpperCase()}</p>
                  {tier.popular ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#384a3a] px-3 py-1 text-[11px] font-medium text-[#faf7ef]">
                      <Sparkles size={11} aria-hidden /> 推荐方案
                    </span>
                  ) : null}
                </div>

                <h2 className="mt-2 font-display text-2xl font-normal text-[#171916]">{plan.name}</h2>

                <p className="mt-4 font-display text-4xl font-normal tabular-nums text-[#171916]">
                  {formatFenAsCny(plan.amountFen)}
                  <span className="ml-1 font-sans text-sm font-normal text-[#6d7368]">
                    {billing === "monthly" ? "/月" : "/年"}
                  </span>
                </p>

                {savings > 0 ? (
                  <p className="mt-1.5 text-xs font-semibold text-[#384a3a]">较月付省 {savings}%</p>
                ) : (
                  <p className="mt-1.5 text-xs text-[#6d7368]">{tier.blurb}</p>
                )}

                <button
                  type="button"
                  onClick={() => void onBuy(plan)}
                  disabled={loadingPlanId !== null}
                  className={[
                    "mt-6 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition disabled:opacity-60",
                    tier.popular
                      ? "bg-[#171916] text-[#faf7ef] shadow-[0_12px_28px_rgba(23,25,22,0.16)] hover:bg-[#2a2e28]"
                      : "bg-[#171916] text-[#faf7ef] hover:bg-[#2a2e28]",
                  ].join(" ")}
                >
                  {loadingPlanId === plan.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {loadingPlanId === plan.id ? "正在创建订单…" : "立即开通"}
                </button>

                <ul className="mt-7 space-y-2.5 border-t border-[#171916]/8 pt-6 text-sm leading-6 text-[#484e45]">
                  <li className="flex items-start gap-2">
                    <Check size={15} className="mt-1 shrink-0 text-[#566c58]" aria-hidden />
                    <span>每期 {plan.quotaPerTranche} 张生成额度</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check size={15} className="mt-1 shrink-0 text-[#566c58]" aria-hidden />
                    <span>Agent 对话工作台（会员专属）</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check size={15} className="mt-1 shrink-0 text-[#566c58]" aria-hidden />
                    <span>{billing === "yearly" ? `年卡共 ${plan.tranches} 期，按 30 天逐期发放` : "会员期 30 天"}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check size={15} className="mt-1 shrink-0 text-[#566c58]" aria-hidden />
                    <span>订阅积分优先消耗，永久积分兜底</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check size={15} className="mt-1 shrink-0 text-[#566c58]" aria-hidden />
                    <span>有效期内续费或升级随时顺延</span>
                  </li>
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {message ? (
        <p className="rounded-2xl border border-[#b45340]/25 bg-[#fdf3f0] px-4 py-3 text-sm text-[#8a3222]">{message}</p>
      ) : null}

      {/* Concise Editorial FAQ Strip */}
      <div className="grid gap-4 rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/82 p-6 md:grid-cols-3">
        {FAQ_ITEMS.map((item) => (
          <div key={item.q} className="space-y-1.5">
            <h3 className="text-sm font-semibold text-[#171916]">{item.q}</h3>
            <p className="text-xs leading-6 text-[#6d7368]">{item.a}</p>
          </div>
        ))}
      </div>

      {/* Pre-Purchase Compliance Notice & Support */}
      <div className="space-y-2 rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/75 px-5 py-4 text-xs leading-6 text-[#6d7368]">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-[#566c58]" aria-hidden />
          <span>
            点击「立即开通」即表示你已阅读并同意{" "}
            <Link href="/terms" className="font-medium text-[#384a3a] underline underline-offset-4 hover:text-[#171916]">
              服务条款与退款规则
            </Link>{" "}
            及{" "}
            <Link href="/privacy" className="font-medium text-[#384a3a] underline underline-offset-4 hover:text-[#171916]">
              隐私政策
            </Link>
            。会员卡为人民币单次付费，到期前 3 天站内提醒，不会自动扣款；每期额度按期有效、不滚存。
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
          <Link href="/billing" className="font-medium text-[#484e45] underline underline-offset-4 hover:text-[#171916]">
            查看历史账单与积分明细
          </Link>
          {resolvedSupportEmail ? (
            <span className="inline-flex items-center gap-1.5">
              <Mail size={13} className="text-[#566c58]" aria-hidden />
              客服邮箱：
              <a
                href={supportMailto}
                className="font-medium text-[#384a3a] underline underline-offset-4 hover:text-[#171916]"
              >
                {resolvedSupportEmail}
              </a>
            </span>
          ) : null}
        </p>
      </div>
    </section>
  );
}
