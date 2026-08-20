import { NextResponse } from "next/server";
import { getBillingProvider } from "@/lib/billing/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

const RECONCILE_AFTER_MS = 30 * 1000;
// Lantu's query endpoint is rate limited to one call per 5 seconds; stay above it.
const RECONCILE_THROTTLE_MS = 10 * 1000;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_order_id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // RLS confines this select to the caller's own orders; other people's order
  // ids are indistinguishable from missing ones.
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  let current: OrderRow = order;

  // Lazy expiry: flip stale pending orders on read; no cron involved.
  if (current.status === "pending" && new Date(current.expires_at).getTime() <= Date.now()) {
    const { data: expired } = await admin
      .from("orders")
      .update({ status: "expired" })
      .eq("id", current.id)
      .eq("status", "pending")
      .select()
      .single();
    current = expired ?? { ...current, status: "expired" };
  }

  // Read-time reconciliation: if the webhook may have been lost, ask the
  // provider directly. Throttled so the 3s poller stays within provider limits.
  const createdAgo = Date.now() - new Date(current.created_at).getTime();
  const lastCheckedAgo = current.last_checked_at ? Date.now() - new Date(current.last_checked_at).getTime() : Infinity;

  if (current.status === "pending" && createdAgo > RECONCILE_AFTER_MS && lastCheckedAgo > RECONCILE_THROTTLE_MS) {
    const provider = getBillingProvider();

    try {
      const result = await provider.queryOrder({
        orderId: current.id,
        amountFen: current.amount_fen,
        channel: current.channel,
      });

      if (result.paid) {
        const { error: fulfillError } = await admin.rpc("fulfill_order", {
          p_order_id: current.id,
          p_provider_trade_no: result.providerTradeNo ?? "",
        });

        if (fulfillError) {
          console.error(`[billing] reconcile fulfill failed order=${current.id}: ${fulfillError.message}`);
        }
      }
    } catch (error) {
      console.error(`[billing] reconcile query failed order=${current.id}`, error);
    }

    const { data: refreshed } = await admin.from("orders").select("*").eq("id", current.id).single();
    await admin.from("orders").update({ last_checked_at: new Date().toISOString() }).eq("id", current.id);
    current = refreshed ?? current;
  }

  return NextResponse.json({
    order: {
      id: current.id,
      status: current.status,
      credits: current.credits,
      amountFen: current.amount_fen,
      channel: current.channel,
      payUrl: current.pay_url,
      expiresAt: current.expires_at,
      createdAt: current.created_at,
    },
  });
}
