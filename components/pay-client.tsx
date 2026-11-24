"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatFenAsCny } from "@/lib/billing/money";
import {
  buildSupportMailto,
  getSupportContactText,
  getSupportEmail,
  isSafeHttpsUrl,
  redirectToExternalUrl,
} from "@/lib/billing/support";

export type PlanSnapshotView = {
  planId: string;
  quotaPerTranche: number;
  tranches: number;
  periodDays: number;
};

export type PayOrderView = {
  id: string;
  status: "pending" | "paid" | "expired" | "failed" | "flagged";
  payUrl: string | null;
  channel: "wechat" | "alipay" | "stripe";
  provider: string;
  amountFen: number;
  credits: number;
  packId: string;
  kind: "pack" | "plan";
  planSnapshot: PlanSnapshotView | null;
  expiresAt: string;
  createdAt: string;
};

const CHANNEL_LABEL: Record<string, string> = {
  wechat: "微信支付",
  alipay: "支付宝",
  stripe: "Stripe 在线支付",
};

const POLL_INTERVAL_MS = 3 * 1000;
const STRIPE_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;

function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function PayClient({
  order,
  stripeSessionId,
  canceled = false,
  supportEmail,
}: {
  order: PayOrderView;
  stripeSessionId?: string;
  canceled?: boolean;
  supportEmail?: string;
}) {
  const router = useRouter();
  const isStripe = order.provider === "stripe" || order.channel === "stripe";
  const validStripeSessionId =
    stripeSessionId && STRIPE_SESSION_ID_PATTERN.test(stripeSessionId.trim())
      ? stripeSessionId.trim()
      : undefined;
  const safeStripePayUrl = isStripe && isSafeHttpsUrl(order.payUrl) ? order.payUrl.trim() : null;
  const resolvedSupportEmail = (supportEmail ?? getSupportEmail()).trim();
  const supportMailto = buildSupportMailto(resolvedSupportEmail, {
    subject: `PixGen 订单异常核实：${order.id}`,
    body: `订单号：${order.id}\n金额：${formatFenAsCny(order.amountFen)}\n问题描述：`,
  });

  const isYearly = Boolean(order.planSnapshot && order.planSnapshot.tranches > 1);
  const tranches = order.planSnapshot?.tranches ?? 1;
  const quotaPerTranche = order.planSnapshot?.quotaPerTranche ?? order.credits;
  const channelLabel = CHANNEL_LABEL[order.channel] ?? order.channel;

  const [status, setStatus] = useState<PayOrderView["status"]>(order.status);
  const [remainingMs, setRemainingMs] = useState(new Date(order.expiresAt).getTime() - Date.now());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isWeChat, setIsWeChat] = useState(false);
  const [repurchasing, setRepurchasing] = useState(false);
  const [reconciling, setReconciling] = useState(
    Boolean(isStripe && validStripeSessionId && (order.status === "pending" || order.status === "expired")),
  );
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const orderQueryUrl =
    isStripe && validStripeSessionId
      ? `/api/orders/${order.id}?stripe_session_id=${encodeURIComponent(validStripeSessionId)}`
      : `/api/orders/${order.id}`;

  useEffect(() => {
    setStatus(order.status);
    setRemainingMs(new Date(order.expiresAt).getTime() - Date.now());
  }, [order.id, order.status, order.expiresAt]);

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
    setIsWeChat(/MicroMessenger/i.test(navigator.userAgent));
  }, []);

  // Skip local QR code rendering for Stripe hosted checkout orders.
  useEffect(() => {
    if (isStripe || status !== "pending" || !order.payUrl) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(order.payUrl as string, { width: 240, margin: 2 });

      if (!cancelled) {
        setQrDataUrl(dataUrl);
      }
    })().catch(() => {
      if (!cancelled) {
        setError("二维码生成失败，请刷新页面重试。");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isStripe, status, order.payUrl]);

  const poll = useCallback(
    async (allowExpired = false) => {
      const currentStatus = statusRef.current;

      if (currentStatus !== "pending" && !(allowExpired && currentStatus === "expired")) {
        return;
      }

      try {
        const response = await fetch(orderQueryUrl, { cache: "no-store" });

        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as { order?: { status: PayOrderView["status"] } };

        if (body.order && body.order.status !== statusRef.current) {
          setStatus(body.order.status);
        }
      } catch {
        // Transient network issues resolve on the next tick.
      }
    },
    [orderQueryUrl],
  );

  // Immediately reconcile on return from Stripe Checkout, including orders that
  // lazily flipped to expired right before the user landed back.
  useEffect(() => {
    if (!isStripe || !validStripeSessionId) {
      return;
    }

    if (statusRef.current !== "pending" && statusRef.current !== "expired") {
      return;
    }

    let active = true;
    setReconciling(true);

    void poll(true).finally(() => {
      if (active) {
        setReconciling(false);
      }
    });

    return () => {
      active = false;
    };
  }, [isStripe, validStripeSessionId, poll]);

  // Poll while visible; pause when hidden, refresh immediately on return.
  useEffect(() => {
    if (status !== "pending") {
      return;
    }

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status, poll]);

  // Countdown; flip to expired locally when time runs out.
  useEffect(() => {
    if (status !== "pending") {
      return;
    }

    const timer = setInterval(() => {
      const remaining = new Date(order.expiresAt).getTime() - Date.now();
      setRemainingMs(remaining);

      if (remaining <= 0) {
        setStatus("expired");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [status, order.expiresAt]);

  async function recheckStripePayment() {
    setReconciling(true);
    setError(null);

    try {
      await poll(true);
    } finally {
      setReconciling(false);
    }
  }

  async function repurchase() {
    setRepurchasing(true);
    setError(null);

    try {
      if (order.kind !== "plan") {
        setError("积分包已下架，请前往定价页选购会员卡。");
        return;
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: order.packId,
          channel: isStripe ? "stripe" : order.channel,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        orderId?: string;
        redirectUrl?: string;
        error?: string;
      } | null;

      if (!response.ok || !body?.orderId) {
        if (body?.error === "too_many_pending_orders") {
          setError("你有太多未完成的订单，请先完成或等待它们过期。");
        } else {
          setError("重新下单失败，请稍后再试。");
        }
        return;
      }

      if (body.redirectUrl && isSafeHttpsUrl(body.redirectUrl)) {
        redirectToExternalUrl(body.redirectUrl);
        return;
      }

      router.push(`/pay/${body.orderId}`);
    } catch {
      setError("网络异常，请稍后再试。");
    } finally {
      setRepurchasing(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3]/94 p-8 text-center shadow-[0_24px_64px_rgba(23,25,22,0.07)] backdrop-blur tabular-nums">
      <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">CHECKOUT</p>

      {status === "pending" ? (
        <>
          <h1 className="mt-2.5 font-display text-2xl font-normal text-[#171916]">
            {channelLabel} · {formatFenAsCny(order.amountFen)}
          </h1>

          {isYearly ? (
            <p className="mt-2 text-sm leading-6 text-[#484e45]">
              共 <span className="font-semibold text-[#171916]">{tranches} 期</span>，每 30 天发放{" "}
              <span className="font-semibold text-[#171916]">{quotaPerTranche} 积分</span>，首期支付成功后立即到账
            </p>
          ) : (
            <p className="mt-2 text-sm text-[#484e45]">
              购买 <span className="font-semibold text-[#171916]">{order.credits} 积分</span>，支付成功后立即到账
            </p>
          )}

          {isStripe ? (
            <div className="mt-5 space-y-4">
              {canceled ? (
                <div className="rounded-2xl border border-[#b48a52]/35 bg-[#f6ebd9] px-4 py-3 text-left text-xs leading-6 text-[#5a411e]">
                  你已取消本次 Stripe 支付，订单仍在有效期内，可随时重新前往完成付款。
                </div>
              ) : null}

              {validStripeSessionId ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#566c58]/25 bg-[#e7eee5] px-4 py-3 text-xs leading-5 text-[#384a3a]">
                  {reconciling ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
                  <span>
                    {reconciling
                      ? "正在向 Stripe 核实支付结果，请稍候…"
                      : "已完成支付？系统正在同步订单状态，通常几秒内自动到账。"}
                  </span>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/85 px-4 py-4 text-left text-xs leading-6 text-[#484e45]">
                <p className="flex items-center gap-1.5 font-medium text-[#171916]">
                  <ShieldCheck className="h-4 w-4 text-[#566c58]" aria-hidden />
                  Stripe 托管收银台
                </p>
                <p className="mt-1 text-[#6d7368]">
                  支持支付宝、微信支付与银行卡完成单次人民币支付，不会开通自动续费。付款后将自动跳回本页完成入账。
                </p>
              </div>

              {safeStripePayUrl ? (
                <a
                  href={safeStripePayUrl}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  前往 Stripe 收银台完成支付
                </a>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-[#6d7368]">当前托管支付链接不可用，请重新发起订单。</p>
                  <button
                    type="button"
                    onClick={() => void repurchase()}
                    disabled={repurchasing}
                    className="inline-flex items-center gap-2 rounded-full bg-[#171916] px-6 py-3 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28] disabled:opacity-60"
                  >
                    {repurchasing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                    重新下单
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {isWeChat && order.channel === "wechat" ? (
                <div className="mt-5 rounded-2xl border border-[#b48a52]/35 bg-[#f6ebd9] px-4 py-3 text-sm leading-6 text-[#5a411e]">
                  微信内无法拉起微信支付。请点击右上角「···」选择「在浏览器打开」后重新扫码，或返回选择支付宝支付。
                </div>
              ) : null}

              {isMobile && !isWeChat && order.payUrl ? (
                <a
                  href={order.payUrl}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                >
                  <Smartphone className="h-4 w-4" aria-hidden />
                  打开{channelLabel}
                </a>
              ) : null}

              {!isMobile && qrDataUrl ? (
                <div className="mt-6">
                  <div className="mx-auto inline-block rounded-2xl border border-[#171916]/10 bg-white p-3 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrDataUrl}
                      alt={`${channelLabel}支付二维码`}
                      className="rounded-lg"
                      width={220}
                      height={220}
                    />
                  </div>
                  <p className="mt-3 text-xs text-[#6d7368]">请使用{channelLabel}扫码支付</p>
                </div>
              ) : null}

              {!isMobile && !qrDataUrl ? (
                <div className="mx-auto mt-6 grid h-[240px] w-[240px] place-items-center rounded-2xl border border-[#171916]/10 bg-[#f4f0e5] text-[#6d7368]">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                </div>
              ) : null}
            </>
          )}

          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-[#6d7368]">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            订单有效期剩余 {formatCountdown(remainingMs)}，支付后本页自动刷新
          </p>
        </>
      ) : null}

      {status === "paid" ? (
        <>
          <div className="mt-6 grid place-items-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-[#e7eee5] text-[#384a3a]">
              <CheckCircle2 className="h-9 w-9" aria-hidden />
            </div>
          </div>
          <h1 className="mt-4 font-display text-2xl font-normal text-[#171916]">支付成功</h1>
          {isYearly ? (
            <p className="mt-2 text-sm leading-6 text-[#484e45]">
              首期 <span className="font-semibold text-[#171916]">{quotaPerTranche} 积分</span>已到账（共 {tranches}{" "}
              期，每 30 天发放 {quotaPerTranche} 积分），现在可以去生成图片了。
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#484e45]">
              <span className="font-semibold text-[#171916]">{order.credits} 积分</span>已到账，现在可以去生成图片了。
            </p>
          )}
          <Link
            href="/generate"
            className="mt-6 inline-flex rounded-full bg-[#171916] px-6 py-3 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
          >
            去生成图片
          </Link>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-[#6d7368]">
            <Link href="/billing" className="underline-offset-4 hover:text-[#171916] hover:underline">
              查看账单与明细
            </Link>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="underline-offset-4 hover:text-[#171916] hover:underline"
            >
              刷新页面
            </button>
          </div>
        </>
      ) : null}

      {status === "expired" ? (
        <>
          <h1 className="mt-4 font-display text-2xl font-normal text-[#171916]">订单已过期</h1>
          {reconciling ? (
            <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-[#566c58]/25 bg-[#e7eee5] px-4 py-3 text-xs text-[#384a3a]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              正在向 Stripe 核实临近过期的支付结果…
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#484e45]">
              这笔订单超时未支付。如已付款，积分会在到账通知后自动补上；也可以重新下一单。
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {isStripe && validStripeSessionId ? (
              <button
                type="button"
                onClick={() => void recheckStripePayment()}
                disabled={reconciling}
                className="inline-flex items-center gap-2 rounded-full border border-[#171916]/15 bg-[#f4f0e5] px-5 py-3 text-sm font-medium text-[#171916] transition hover:border-[#171916]/35 disabled:opacity-60"
              >
                {reconciling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                重新核验支付状态
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void repurchase()}
              disabled={repurchasing}
              className="inline-flex items-center gap-2 rounded-full bg-[#171916] px-6 py-3 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28] disabled:opacity-60"
            >
              {repurchasing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              重新下单
            </button>
          </div>
        </>
      ) : null}

      {status === "failed" || status === "flagged" ? (
        <>
          <div className="mt-5 grid place-items-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[#fdf3f0] text-[#8a3222]">
              <AlertTriangle className="h-7 w-7" aria-hidden />
            </div>
          </div>
          <h1 className="mt-4 font-display text-2xl font-normal text-[#171916]">订单异常</h1>
          <p className="mt-2 text-sm leading-6 text-[#484e45]">
            这笔订单遇到了问题。如果你已完成付款，请保留下方订单号并联系客服核实补发。
          </p>
          <div className="mt-4 space-y-2 rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/85 px-4 py-3 text-left text-xs text-[#484e45]">
            <p className="break-all">
              <span className="text-[#6d7368]">订单号：</span>
              <span className="font-mono text-[#171916]">{order.id}</span>
            </p>
            {resolvedSupportEmail ? (
              <p className="flex flex-wrap items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0 text-[#566c58]" aria-hidden />
                <span className="text-[#6d7368]">客服邮箱：</span>
                <a
                  href={supportMailto}
                  className="font-medium text-[#384a3a] underline underline-offset-4 hover:text-[#171916]"
                >
                  {resolvedSupportEmail}
                </a>
              </p>
            ) : (
              <p className="text-[#6d7368]">{getSupportContactText()}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void repurchase()}
            disabled={repurchasing}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#171916] px-6 py-3 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28] disabled:opacity-60"
          >
            {repurchasing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            重新下单
          </button>
        </>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-[#b45340]/25 bg-[#fdf3f0] px-4 py-3 text-xs text-[#8a3222]">{error}</p>
      ) : null}

      <Link href="/upgrade" className="mt-6 block text-xs text-[#6d7368] underline-offset-4 hover:text-[#171916] hover:underline">
        返回会员方案
      </Link>
    </section>
  );
}
