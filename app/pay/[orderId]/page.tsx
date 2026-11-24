import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/app-shell";
import { PayClient, type PlanSnapshotView } from "@/components/pay-client";
import { getMembershipPlan } from "@/lib/billing/plans";
import { getSupportEmail } from "@/lib/billing/support";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type PayPageProps = {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const STRIPE_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;

function resolvePlanSnapshot(order: OrderRow): PlanSnapshotView | null {
  const raw = order.plan_snapshot;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const planId = typeof record.planId === "string" ? record.planId : order.pack_id;
    const quotaPerTranche = typeof record.quotaPerTranche === "number" ? record.quotaPerTranche : null;
    const tranches = typeof record.tranches === "number" ? record.tranches : null;
    const periodDays = typeof record.periodDays === "number" ? record.periodDays : null;

    if (
      quotaPerTranche !== null &&
      tranches !== null &&
      periodDays !== null &&
      Number.isFinite(quotaPerTranche) &&
      Number.isFinite(tranches) &&
      Number.isFinite(periodDays) &&
      quotaPerTranche > 0 &&
      tranches > 0 &&
      periodDays > 0
    ) {
      return { planId, quotaPerTranche, tranches, periodDays };
    }
  }

  if (order.kind === "plan") {
    const catalogPlan = getMembershipPlan(order.pack_id);

    if (catalogPlan) {
      return {
        planId: catalogPlan.id,
        quotaPerTranche: catalogPlan.quotaPerTranche,
        tranches: catalogPlan.tranches,
        periodDays: catalogPlan.periodDays,
      };
    }
  }

  return null;
}

export default async function PayPage({ params, searchParams }: PayPageProps) {
  const { orderId } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawSessionId =
    typeof resolvedSearchParams.stripe_session_id === "string"
      ? resolvedSearchParams.stripe_session_id.trim()
      : "";
  const stripeSessionId = STRIPE_SESSION_ID_PATTERN.test(rawSessionId) ? rawSessionId : undefined;
  const canceled =
    resolvedSearchParams.canceled === "1" || resolvedSearchParams.canceled === "true";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextParams = new URLSearchParams();

    if (stripeSessionId) {
      nextParams.set("stripe_session_id", stripeSessionId);
    }

    if (canceled) {
      nextParams.set("canceled", "1");
    }

    const nextQuery = nextParams.toString();
    const nextPath = nextQuery ? `/pay/${orderId}?${nextQuery}` : `/pay/${orderId}`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  // RLS confines this to the caller's own orders; anyone else's id is a 404.
  const { data: order } = (await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()) as {
    data: OrderRow | null;
  };

  if (!order) {
    notFound();
  }

  const planSnapshot = resolvePlanSnapshot(order);
  const supportEmail = getSupportEmail();

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f3ea] text-[#171916]">
      <header className="border-b border-[#171916]/10 bg-[#f4f0e5]/85 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <BrandMark href="/" compact />
          <Link
            href="/upgrade"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
          >
            <ArrowLeft size={13} aria-hidden />
            返回会员方案
          </Link>
        </div>
      </header>

      <main className="grid flex-1 place-items-center px-5 py-10">
        <PayClient
          key={order.id}
          order={{
            id: order.id,
            status: order.status,
            payUrl: order.pay_url,
            channel: order.channel,
            provider: order.provider,
            amountFen: order.amount_fen,
            credits: order.credits,
            packId: order.pack_id,
            kind: order.kind,
            planSnapshot,
            expiresAt: order.expires_at,
            createdAt: order.created_at,
          }}
          stripeSessionId={stripeSessionId}
          canceled={canceled}
          supportEmail={supportEmail}
        />
      </main>

      <footer className="border-t border-[#171916]/8 px-5 py-4 text-center text-xs text-[#6d7368]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-4">
          <Link href="/billing" className="underline-offset-4 hover:text-[#171916] hover:underline">
            账单与明细
          </Link>
          <span aria-hidden className="text-[#171916]/20">
            ·
          </span>
          <Link href="/terms" className="underline-offset-4 hover:text-[#171916] hover:underline">
            服务条款与退款规则
          </Link>
          <span aria-hidden className="text-[#171916]/20">
            ·
          </span>
          <Link href="/privacy" className="underline-offset-4 hover:text-[#171916] hover:underline">
            隐私政策
          </Link>
        </div>
      </footer>
    </div>
  );
}
