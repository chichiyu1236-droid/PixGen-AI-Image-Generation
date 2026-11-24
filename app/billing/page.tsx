import { ArrowRight, Coins, Crown, History, KeyRound, Mail, ReceiptText, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MembershipNotice } from "@/components/membership-notice";
import { EMPTY_BALANCE, getCreditBalance } from "@/lib/auth/balance";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { formatFenAsCny } from "@/lib/billing/money";
import { getMembershipPlan } from "@/lib/billing/plans";
import { buildSupportMailto, getSupportContactText, getSupportEmail } from "@/lib/billing/support";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type MembershipRow = Pick<
  Database["public"]["Tables"]["memberships"]["Row"],
  "plan_id" | "paid_until" | "next_grant_at" | "pending_tranches"
>;
type OrderRow = Pick<
  Database["public"]["Tables"]["orders"]["Row"],
  "id" | "pack_id" | "credits" | "amount_fen" | "status" | "channel" | "provider" | "kind" | "plan_snapshot" | "expires_at" | "created_at" | "paid_at"
>;
type CreditEventRow = Pick<
  Database["public"]["Tables"]["credit_events"]["Row"],
  "id" | "type" | "amount" | "reason" | "created_at"
>;

const CHANNEL_LABEL: Record<string, string> = {
  wechat: "微信支付",
  alipay: "支付宝",
  stripe: "Stripe 在线支付",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  expired: "已过期",
  failed: "支付失败",
  flagged: "订单异常",
};

const CREDIT_EVENT_LABEL: Record<string, string> = {
  signup_bonus: "注册赠送",
  generation_charge: "生图消耗",
  purchase: "积分包充值",
  admin_adjustment: "人工调整",
  membership_grant: "会员额度发放",
  membership_expire: "订阅额度清零",
};

function formatDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "-";
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "-";
  }

  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function parsePendingTranches(raw: Json | null | undefined): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0);
}

function describeOrderProduct(order: OrderRow): { title: string; detail: string } {
  const catalogPlan = getMembershipPlan(order.pack_id);
  const rawSnapshot = order.plan_snapshot;
  const snapshot =
    rawSnapshot && typeof rawSnapshot === "object" && !Array.isArray(rawSnapshot)
      ? (rawSnapshot as Record<string, unknown>)
      : null;

  const tranches =
    typeof snapshot?.tranches === "number" ? snapshot.tranches : (catalogPlan?.tranches ?? 1);
  const quotaPerTranche =
    typeof snapshot?.quotaPerTranche === "number"
      ? snapshot.quotaPerTranche
      : (catalogPlan?.quotaPerTranche ?? order.credits);

  if (order.kind === "plan") {
    const title = catalogPlan?.name ?? `会员套餐 (${order.pack_id})`;
    const detail =
      tranches > 1
        ? `共 ${tranches} 期 · 每 30 天发放 ${quotaPerTranche} 积分`
        : `单期 ${quotaPerTranche} 积分 · 会员期 30 天`;
    return { title, detail };
  }

  return {
    title: `历史积分包 (${order.pack_id})`,
    detail: `永久积分 +${order.credits}`,
  };
}

function formatCreditEventReason(event: CreditEventRow): string {
  const reason = event.reason?.trim() ?? "";

  if (!reason) {
    return "-";
  }

  if (reason === "Image generation (subscription pool)") {
    return "图像生成扣减（订阅池）";
  }

  if (reason === "Image generation (permanent pool)") {
    return "图像生成扣减（永久池）";
  }

  if (reason === "Subscription credits expired") {
    return "订阅周期到期自动清零";
  }

  return reason;
}

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/billing");
  }

  await ensureUserProfile(user).catch(() => undefined);
  // evaluate_membership is service-role-only (it drives lazy expiry & period
  // tranche grants), so run it first before reading user-scoped RLS tables.
  const balance = await getCreditBalance(createSupabaseAdminClient(), user.id).catch(() => EMPTY_BALANCE);

  const [membershipRes, ordersRes, eventsRes] = await Promise.all([
    supabase
      .from("memberships")
      .select("plan_id, paid_until, next_grant_at, pending_tranches")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, pack_id, credits, amount_fen, status, channel, provider, kind, plan_snapshot, expires_at, created_at, paid_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("credit_events")
      .select("id, type, amount, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const membership = (membershipRes.data ?? null) as MembershipRow | null;
  const orders = (ordersRes.data ?? []) as OrderRow[];
  const creditEvents = (eventsRes.data ?? []) as CreditEventRow[];
  const ordersLoadError = Boolean(ordersRes.error);
  const eventsLoadError = Boolean(eventsRes.error);

  const pendingTranches = parsePendingTranches(membership?.pending_tranches);
  const activePlanName = getMembershipPlan(membership?.plan_id ?? balance.planId ?? "")?.name ?? null;
  const nowMs = Date.now();
  const supportEmail = getSupportEmail();
  const supportMailto = buildSupportMailto(supportEmail, { subject: "PixGen 账单与积分咨询" });

  return (
    <AppShell balance={balance}>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <MembershipNotice balance={balance} compact />

        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#171916]/10 pb-6">
          <div>
            <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">BILLING</p>
            <h1 className="mt-1.5 font-display text-3xl font-normal text-[#171916] sm:text-4xl">账单与积分明细</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#484e45]">
              查看当前会员状态、双积分池余额、历史支付订单与每笔积分变动记录。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/auth/reset-password"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-4 py-2.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
            >
              <KeyRound size={14} aria-hidden />
              设置 / 修改密码
            </Link>
            <Link
              href="/upgrade"
              className="inline-flex items-center gap-2 rounded-full bg-[#171916] px-5 py-2.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
            >
              升级或续费会员
              <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </header>

        {/* Membership & Dual-Pool Balance Summary */}
        <section aria-label="账户权益概览" className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.6rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-5 shadow-[0_14px_36px_rgba(23,25,22,0.04)]">
            <div className="flex items-center justify-between gap-2 text-xs text-[#6d7368]">
              <span>会员状态</span>
              <Crown size={15} className="text-[#566c58]" aria-hidden />
            </div>
            {balance.membershipActive ? (
              <>
                <p className="mt-3 font-display text-2xl font-normal text-[#171916]">
                  {activePlanName ?? "有效会员"}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#484e45]">
                  有效期至 <span className="font-medium tabular-nums text-[#171916]">{formatDate(balance.paidUntil)}</span>
                </p>
                {pendingTranches.length > 0 ? (
                  <p className="mt-1 text-xs leading-5 text-[#384a3a]">
                    年卡待发剩余 {pendingTranches.length} 期（下次发放：{formatDate(membership?.next_grant_at)}）
                  </p>
                ) : (
                  <p className="mt-1 text-xs leading-5 text-[#6d7368]">手动续费，不自动扣款</p>
                )}
              </>
            ) : balance.paidUntil ? (
              <>
                <p className="mt-3 font-display text-2xl font-normal text-[#8a6a3f]">会员已过期</p>
                <p className="mt-2 text-xs leading-5 text-[#6d7368]">
                  已于 <span className="tabular-nums">{formatDate(balance.paidUntil)}</span> 到期，续费即重新激活
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 font-display text-2xl font-normal text-[#171916]">免费体验版</p>
                <p className="mt-2 text-xs leading-5 text-[#6d7368]">开通会员可解锁每期积分与 Agent 对话工作台</p>
              </>
            )}
          </div>

          <div className="rounded-[1.6rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-5 shadow-[0_14px_36px_rgba(23,25,22,0.04)] tabular-nums">
            <div className="flex items-center justify-between gap-2 text-xs text-[#6d7368]">
              <span>订阅池积分</span>
              <Sparkles size={15} className="text-[#566c58]" aria-hidden />
            </div>
            <p className="mt-3 font-display text-3xl font-normal text-[#171916]">
              {balance.subCredits}
              <span className="ml-1.5 font-sans text-xs font-normal text-[#6d7368]">积分</span>
            </p>
            <p className="mt-2 text-xs leading-5 text-[#6d7368]">
              {balance.subCredits > 0 && balance.subCreditsExpiresAt
                ? `当期有效期至 ${formatDate(balance.subCreditsExpiresAt)}，到期清零不滚存`
                : "优先消耗订阅池积分，按周期发放"}
            </p>
          </div>

          <div className="rounded-[1.6rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-5 shadow-[0_14px_36px_rgba(23,25,22,0.04)] tabular-nums">
            <div className="flex items-center justify-between gap-2 text-xs text-[#6d7368]">
              <span>永久池积分</span>
              <Coins size={15} className="text-[#b48a52]" aria-hidden />
            </div>
            <p className="mt-3 font-display text-3xl font-normal text-[#171916]">
              {balance.permanentCredits}
              <span className="ml-1.5 font-sans text-xs font-normal text-[#6d7368]">积分</span>
            </p>
            <p className="mt-2 text-xs leading-5 text-[#6d7368]">
              永久有效，订阅池耗尽后自动兜底 · 当前总可用 {balance.totalCredits} 积分
            </p>
          </div>
        </section>

        {/* Order History */}
        <section className="rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-6 shadow-[0_16px_42px_rgba(23,25,22,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#171916]/8 pb-4">
            <div className="flex items-center gap-2">
              <ReceiptText size={18} className="text-[#566c58]" aria-hidden />
              <h2 className="font-display text-xl font-normal text-[#171916]">历史订单</h2>
            </div>
            <span className="text-xs text-[#6d7368]">最近 {orders.length} 条记录</span>
          </div>

          {ordersLoadError ? (
            <div className="mt-4 rounded-2xl border border-[#b45340]/25 bg-[#fdf3f0] px-4 py-3 text-sm text-[#8a3222]">
              历史订单暂时加载失败，请刷新页面重试。
            </div>
          ) : orders.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[#6d7368]">暂无订单记录</p>
              <Link
                href="/upgrade"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#384a3a] underline underline-offset-4 hover:text-[#171916]"
              >
                前往查看会员方案
              </Link>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-[#6d7368]">
                  <tr>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">下单时间</th>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">商品与权益</th>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">金额</th>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">支付渠道</th>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">状态</th>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">操作 / 订单号</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171916]/6 tabular-nums">
                  {orders.map((order) => {
                    const channel: string = order.channel;
                    const isEffectivelyExpired =
                      order.status === "pending" && new Date(order.expires_at).getTime() <= nowMs;
                    const displayStatus: string = isEffectivelyExpired ? "expired" : order.status;
                    const canContinuePay = order.status === "pending" && !isEffectivelyExpired;
                    const product = describeOrderProduct(order);

                    return (
                      <tr key={order.id} className="align-top">
                        <td className="py-3.5 pr-4 text-xs text-[#484e45]">{formatDateTime(order.created_at)}</td>
                        <td className="py-3.5 pr-4">
                          <p className="font-medium text-[#171916]">{product.title}</p>
                          <p className="mt-0.5 text-xs text-[#6d7368]">{product.detail}</p>
                        </td>
                        <td className="py-3.5 pr-4 font-semibold text-[#171916]">{formatFenAsCny(order.amount_fen)}</td>
                        <td className="py-3.5 pr-4 text-xs text-[#484e45]">{CHANNEL_LABEL[channel] ?? channel}</td>
                        <td className="py-3.5 pr-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              displayStatus === "paid"
                                ? "bg-[#e7eee5] text-[#384a3a]"
                                : displayStatus === "pending"
                                  ? "bg-[#f6ebd9] text-[#7c5922]"
                                  : displayStatus === "flagged" || displayStatus === "failed"
                                    ? "bg-[#fdf3f0] text-[#8a3222]"
                                    : "bg-[#ede8dc] text-[#6d7368]"
                            }`}
                          >
                            {ORDER_STATUS_LABEL[displayStatus] ?? displayStatus}
                          </span>
                        </td>
                        <td className="py-3.5 text-xs">
                          {canContinuePay ? (
                            <Link
                              href={`/pay/${order.id}`}
                              className="inline-flex items-center rounded-full bg-[#171916] px-3 py-1 text-xs font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                            >
                              继续支付
                            </Link>
                          ) : displayStatus === "failed" || displayStatus === "flagged" ? (
                            <Link
                              href={`/pay/${order.id}`}
                              className="inline-flex items-center text-xs font-medium text-[#8a3222] underline underline-offset-4 hover:text-[#171916]"
                            >
                              查看异常详情
                            </Link>
                          ) : (
                            <span className="font-mono text-[11px] text-[#6d7368]">{order.id}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Credit Events Ledger */}
        <section className="rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-6 shadow-[0_16px_42px_rgba(23,25,22,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#171916]/8 pb-4">
            <div className="flex items-center gap-2">
              <History size={18} className="text-[#566c58]" aria-hidden />
              <h2 className="font-display text-xl font-normal text-[#171916]">积分变动流水</h2>
            </div>
            <span className="text-xs text-[#6d7368]">最近 {creditEvents.length} 条记录</span>
          </div>

          {eventsLoadError ? (
            <div className="mt-4 rounded-2xl border border-[#b45340]/25 bg-[#fdf3f0] px-4 py-3 text-sm text-[#8a3222]">
              积分变动流水暂时加载失败，请刷新页面重试。
            </div>
          ) : creditEvents.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#6d7368]">暂无积分变动记录</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-[#6d7368]">
                  <tr>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">时间</th>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">类型</th>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">变动</th>
                    <th className="border-b border-[#171916]/10 pb-3 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171916]/6 tabular-nums">
                  {creditEvents.map((event) => {
                    const eventType: string = event.type;
                    const positive = event.amount > 0;

                    return (
                      <tr key={event.id} className="align-top">
                        <td className="py-3 pr-4 text-xs text-[#484e45]">{formatDateTime(event.created_at)}</td>
                        <td className="py-3 pr-4">
                          <span className="inline-flex rounded-full border border-[#171916]/10 bg-[#f4f0e5] px-2.5 py-0.5 text-xs text-[#484e45]">
                            {CREDIT_EVENT_LABEL[eventType] ?? eventType}
                          </span>
                        </td>
                        <td
                          className={`py-3 pr-4 font-semibold ${
                            positive ? "text-[#384a3a]" : "text-[#7a4b2b]"
                          }`}
                        >
                          {positive ? `+${event.amount}` : String(event.amount)}
                        </td>
                        <td className="py-3 text-xs leading-5 text-[#6d7368]">{formatCreditEventReason(event)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Support & Legal Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/75 px-5 py-4 text-xs text-[#484e45]">
          <div className="flex items-center gap-2">
            <Mail size={15} className="shrink-0 text-[#566c58]" aria-hidden />
            {supportEmail ? (
              <span>
                对订单、积分到账或退款有疑问？请联系客服邮箱{" "}
                <a
                  href={supportMailto}
                  className="font-medium text-[#384a3a] underline underline-offset-4 hover:text-[#171916]"
                >
                  {supportEmail}
                </a>
              </span>
            ) : (
              <span>{getSupportContactText()}</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-[#6d7368]">
            <Link href="/terms" className="underline-offset-4 hover:text-[#171916] hover:underline">
              服务条款与退款规则
            </Link>
            <Link href="/privacy" className="underline-offset-4 hover:text-[#171916] hover:underline">
              隐私政策
            </Link>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}
