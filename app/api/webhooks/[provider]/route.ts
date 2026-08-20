import { NextResponse } from "next/server";
import { getBillingProvider } from "@/lib/billing/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Merges query-string params with form-urlencoded or JSON body params. */
async function collectParams(request: Request, url: URL): Promise<Record<string, string>> {
  const params: Record<string, string> = {};

  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }

  const text = await request.text().catch(() => "");

  if (text) {
    try {
      const json = JSON.parse(text) as unknown;

      if (json && typeof json === "object" && !Array.isArray(json)) {
        for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
          if (typeof value === "string" || typeof value === "number") {
            params[key] = String(value);
          }
        }
      }
    } catch {
      for (const [key, value] of new URLSearchParams(text).entries()) {
        params[key] = value;
      }
    }
  }

  return params;
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await context.params;
  const provider = getBillingProvider();

  if (provider.id !== providerId) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }

  const url = new URL(request.url);
  const params = await collectParams(request, url);
  const verification = provider.verifyCallback(params);

  if (!verification.valid) {
    console.warn(`[billing] webhook rejected (${verification.reason}) provider=${providerId}`);
    return new Response(provider.callbackAck.failure, { status: 200 });
  }

  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id,user_id,credits,amount_fen,status,channel,provider")
    .eq("id", verification.orderId)
    .maybeSingle();

  if (!order) {
    console.warn(`[billing] webhook for unknown order=${verification.orderId}`);
    return new Response(provider.callbackAck.failure, { status: 200 });
  }

  const recordNotification = async () => {
    await admin
      .from("orders")
      .update({ raw_notify: params, notified_at: new Date().toISOString() })
      .eq("id", order.id);
  };

  if (order.status === "paid") {
    await recordNotification();
    return new Response(provider.callbackAck.success, { status: 200 });
  }

  if (verification.amountFen !== order.amount_fen) {
    // Never fulfill on a mismatched amount; flag for manual review and ack so
    // the provider stops retrying - retries cannot fix a mismatch.
    console.error(
      `[billing] webhook amount mismatch order=${order.id} expected=${order.amount_fen}fen got=${verification.amountFen}fen - FLAGGED`,
    );
    await admin
      .from("orders")
      .update({ status: "flagged", raw_notify: params, notified_at: new Date().toISOString() })
      .eq("id", order.id)
      .neq("status", "paid");
    return new Response(provider.callbackAck.success, { status: 200 });
  }

  const { error: fulfillError } = await admin.rpc("fulfill_order", {
    p_order_id: order.id,
    p_provider_trade_no: verification.providerTradeNo ?? "",
  });

  if (fulfillError) {
    // Non-200: transient DB trouble should be retried by the provider.
    console.error(`[billing] fulfill failed order=${order.id}: ${fulfillError.message}`);
    return new Response(provider.callbackAck.failure, { status: 500 });
  }

  await recordNotification();
  console.log(`[billing] order fulfilled order=${order.id} credits=${order.credits}`);

  return new Response(provider.callbackAck.success, { status: 200 });
}
