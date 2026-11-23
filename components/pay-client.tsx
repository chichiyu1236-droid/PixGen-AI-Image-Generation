"use client";

import { CheckCircle2, Clock, Loader2, RefreshCw, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatFenAsCny } from "@/lib/billing/money";

export type PayOrderView = {
  id: string;
  status: "pending" | "paid" | "expired" | "failed" | "flagged";
  payUrl: string | null;
  channel: "wechat" | "alipay";
  amountFen: number;
  credits: number;
  packId: string;
  kind: "pack" | "plan";
  expiresAt: string;
  createdAt: string;
};

const CHANNEL_LABEL: Record<PayOrderView["channel"], string> = {
  wechat: "微信支付",
  alipay: "支付宝",
};

const POLL_INTERVAL_MS = 3 * 1000;

function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function PayClient({ order }: { order: PayOrderView }) {
  const router = useRouter();
  const [status, setStatus] = useState(order.status);
  const [remainingMs, setRemainingMs] = useState(new Date(order.expiresAt).getTime() - Date.now());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isWeChat, setIsWeChat] = useState(false);
  const [repurchasing, setRepurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
    setIsWeChat(/MicroMessenger/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (status !== "pending" || !order.payUrl) {
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
  }, [status, order.payUrl]);

  const poll = useCallback(async () => {
    if (statusRef.current !== "pending") {
      return;
    }

    try {
      const response = await fetch(`/api/orders/${order.id}`, { cache: "no-store" });
      const body = (await response.json()) as { order?: { status: PayOrderView["status"] } };

      if (body.order && body.order.status !== "pending") {
        setStatus(body.order.status);
      }
    } catch {
      // Transient network issues resolve on the next tick.
    }
  }, [order.id]);

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
        body: JSON.stringify({ planId: order.packId, channel: order.channel }),
      });
      const body = (await response.json()) as { orderId?: string; error?: string };

      if (!response.ok || !body.orderId) {
        setError("重新下单失败，请稍后再试。");
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
            {CHANNEL_LABEL[order.channel]} · {formatFenAsCny(order.amountFen)}
          </h1>
          <p className="mt-2 text-sm text-[#484e45]">
            购买 <span className="font-semibold text-[#171916]">{order.credits} 积分</span>，支付成功后立即到账
          </p>

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
              打开{CHANNEL_LABEL[order.channel]}
            </a>
          ) : null}

          {!isMobile && qrDataUrl ? (
            <div className="mt-6">
              <div className="mx-auto inline-block rounded-2xl border border-[#171916]/10 bg-white p-3 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`${CHANNEL_LABEL[order.channel]}支付二维码`}
                  className="rounded-lg"
                  width={220}
                  height={220}
                />
              </div>
              <p className="mt-3 text-xs text-[#6d7368]">请使用{CHANNEL_LABEL[order.channel]}扫码支付</p>
            </div>
          ) : null}

          {!isMobile && !qrDataUrl ? (
            <div className="mx-auto mt-6 grid h-[240px] w-[240px] place-items-center rounded-2xl border border-[#171916]/10 bg-[#f4f0e5] text-[#6d7368]">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            </div>
          ) : null}

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
          <p className="mt-2 text-sm leading-6 text-[#484e45]">
            <span className="font-semibold text-[#171916]">{order.credits} 积分</span>已到账，现在可以去生成图片了。
          </p>
          <Link
            href="/generate"
            className="mt-6 inline-flex rounded-full bg-[#171916] px-6 py-3 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
          >
            去生成图片
          </Link>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-3 block w-full text-xs text-[#6d7368] underline-offset-4 hover:underline"
          >
            刷新页面
          </button>
        </>
      ) : null}

      {status === "expired" ? (
        <>
          <h1 className="mt-4 font-display text-2xl font-normal text-[#171916]">订单已过期</h1>
          <p className="mt-2 text-sm leading-6 text-[#484e45]">
            这笔订单超时未支付。如已付款，积分会在到账通知后自动补上；也可以重新下一单。
          </p>
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

      {status === "failed" || status === "flagged" ? (
        <>
          <h1 className="mt-4 font-display text-2xl font-normal text-[#171916]">订单异常</h1>
          <p className="mt-2 text-sm leading-6 text-[#484e45]">
            这笔订单遇到了问题。如果你已经付款，请联系管理员核实并补发积分。
          </p>
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
