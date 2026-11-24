import { NextResponse } from "next/server";
import { getBillingEnv } from "@/lib/billing/env";
import { verifyStripeWebhookSignature } from "@/lib/billing/providers/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FULFILLABLE_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

interface StripeCheckoutSessionObject {
  id?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  client_reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface StripeWebhookEvent {
  id?: string;
  type?: string;
  data?: {
    object?: StripeCheckoutSessionObject;
  };
}

export async function POST(request: Request) {
  const webhookSecret = getBillingEnv().STRIPE_WEBHOOK_SECRET.trim();

  if (!webhookSecret) {
    console.error("[billing] stripe webhook secret is not configured");
    return NextResponse.json({ error: "stripe_webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  if (!verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
    console.warn("[billing] stripe webhook rejected: invalid signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let parsedEvent: unknown;

  try {
    parsedEvent = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (!parsedEvent || typeof parsedEvent !== "object" || Array.isArray(parsedEvent)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const event = parsedEvent as StripeWebhookEvent;

  if (!event.type || !FULFILLABLE_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const session = event.data?.object;

  if (!session || session.payment_status !== "paid") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const metadataOrderId =
    session.metadata && typeof session.metadata.order_id === "string" ? session.metadata.order_id.trim() : "";
  const clientRefOrderId = typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
  const orderId = metadataOrderId || clientRefOrderId;

  if (!UUID_REGEX.test(orderId)) {
    console.warn(`[billing] stripe webhook missing/invalid order_id event=${event.id ?? "n/a"}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const admin = createSupabaseAdminClient();
  const { data: order, error: lookupError } = await admin
    .from("orders")
    .select("id,user_id,credits,amount_fen,status,channel,provider")
    .eq("id", orderId)
    .maybeSingle();

  if (lookupError) {
    console.error(`[billing] stripe webhook order lookup failed order=${orderId}: ${lookupError.message}`);
    return NextResponse.json({ error: "order_lookup_failed" }, { status: 500 });
  }

  if (!order || order.provider !== "stripe") {
    console.warn(
      `[billing] stripe webhook ignored order=${orderId} found=${Boolean(order)} provider=${order?.provider ?? "none"}`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const rawNotify = parsedEvent as Json;
  const recordNotification = async () => {
    await admin
      .from("orders")
      .update({ raw_notify: rawNotify, notified_at: new Date().toISOString() })
      .eq("id", order.id);
  };

  if (order.status === "paid") {
    await recordNotification();
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const amountMatches = typeof session.amount_total === "number" && session.amount_total === order.amount_fen;
  const currencyMatches = typeof session.currency === "string" && session.currency.toLowerCase() === "cny";

  if (!amountMatches || !currencyMatches) {
    console.error(
      `[billing] stripe webhook mismatch order=${order.id} expected=${order.amount_fen}fen/cny got=${String(session.amount_total)}/${String(session.currency)} - FLAGGED`,
    );
    await admin
      .from("orders")
      .update({ status: "flagged", raw_notify: rawNotify, notified_at: new Date().toISOString() })
      .eq("id", order.id)
      .neq("status", "paid");
    return NextResponse.json({ received: true, flagged: true }, { status: 200 });
  }

  const providerTradeNo = typeof session.id === "string" ? session.id : "";
  const { error: fulfillError } = await admin.rpc("fulfill_order", {
    p_order_id: order.id,
    p_provider_trade_no: providerTradeNo,
  });

  if (fulfillError) {
    if (fulfillError.message.includes("order_not_fulfillable")) {
      console.error(`[billing] stripe webhook order not fulfillable order=${order.id}: ${fulfillError.message}`);
      await recordNotification();
      return NextResponse.json({ received: true }, { status: 200 });
    }

    console.error(`[billing] stripe webhook fulfill failed order=${order.id}: ${fulfillError.message}`);
    return NextResponse.json({ error: "fulfill_failed" }, { status: 500 });
  }

  await recordNotification();
  console.log(`[billing] stripe order fulfilled order=${order.id} credits=${order.credits} session=${providerTradeNo}`);

  return NextResponse.json({ received: true }, { status: 200 });
}
