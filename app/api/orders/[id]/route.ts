import { NextResponse } from "next/server";
import { getBillingProviderById } from "@/lib/billing/provider";
import { isValidStripeSessionId } from "@/lib/billing/providers/stripe";
import type { BillingProvider } from "@/lib/billing/providers/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

const RECONCILE_AFTER_MS = 30 * 1000;
// Lantu's query endpoint is rate limited to one call per 5 seconds; stay above it.
const RECONCILE_THROTTLE_MS = 10 * 1000;
// Lightweight throttle for immediate Stripe redirect-back verification.
const STRIPE_RETURN_THROTTLE_MS = 3 * 1000;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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

  // Validate optional `?stripe_session_id=` against strict format and stored
  // `provider_trade_no` binding before allowing immediate redirect-back lookup.
  const url = new URL(request.url);
  const rawStripeSessionId = url.searchParams.get("stripe_session_id");
  const validStripeSessionId = isValidStripeSessionId(rawStripeSessionId) ? rawStripeSessionId : null;
  const matchesStoredTradeNo =
    !current.provider_trade_no || current.provider_trade_no === validStripeSessionId;
  const trustedStripeSessionId =
    current.provider === "stripe" && validStripeSessionId && matchesStoredTradeNo ? validStripeSessionId : null;

  const nowMs = Date.now();
  const createdAgo = nowMs - new Date(current.created_at).getTime();
  const lastCheckedAgo = current.last_checked_at ? nowMs - new Date(current.last_checked_at).getTime() : Infinity;

  const shouldImmediateStripeReconcile =
    trustedStripeSessionId !== null &&
    (current.status === "pending" || current.status === "expired") &&
    lastCheckedAgo >= STRIPE_RETURN_THROTTLE_MS;

  const shouldScheduledPendingReconcile =
    current.status === "pending" && createdAgo > RECONCILE_AFTER_MS && lastCheckedAgo > RECONCILE_THROTTLE_MS;

  if (shouldImmediateStripeReconcile || shouldScheduledPendingReconcile) {
    let provider: BillingProvider | undefined;

    try {
      provider = getBillingProviderById(current.provider);
    } catch (error) {
      console.error(`[billing] reconcile provider blocked order=${current.id} provider=${current.provider}`, error);
    }

    if (provider) {
      try {
        const result = await provider.queryOrder({
          orderId: current.id,
          amountFen: current.amount_fen,
          channel: current.channel,
          providerTradeNo: current.provider_trade_no,
          stripeSessionId: trustedStripeSessionId,
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
  }

  return NextResponse.json({
    order: {
      id: current.id,
      status: current.status,
      credits: current.credits,
      amountFen: current.amount_fen,
      channel: current.channel,
      provider: current.provider,
      payUrl: current.pay_url,
      expiresAt: current.expires_at,
      createdAt: current.created_at,
    },
  });
}
