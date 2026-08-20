import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin/access";
import { getBillingProvider } from "@/lib/billing/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionContext = { params: Promise<{ id: string }> };

const ORDER_COLUMNS = "id,user_id,pack_id,credits,amount_fen,status,channel,provider,provider_trade_no,pay_url,expires_at,created_at,paid_at,notified_at,profiles(email)";

export async function POST(_request: Request, context: ActionContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  if (order.status === "paid") {
    return NextResponse.json({ order, result: "already_paid" });
  }

  const provider = getBillingProvider();

  if (provider.id !== order.provider) {
    return NextResponse.json({ error: "provider_mismatch", message: `订单属于 ${order.provider}，当前激活的是 ${provider.id}` }, { status: 409 });
  }

  let paid = false;
  let providerTradeNo: string | null = null;

  try {
    const result = await provider.queryOrder({
      orderId: order.id,
      amountFen: order.amount_fen,
      channel: order.channel,
    });
    paid = result.paid;
    providerTradeNo = result.providerTradeNo;
  } catch (error) {
    console.error(`[billing] admin query failed order=${order.id}`, error);
    return NextResponse.json({ error: "provider_query_failed" }, { status: 502 });
  }

  await admin.from("orders").update({ last_checked_at: new Date().toISOString() }).eq("id", order.id);

  if (!paid) {
    return NextResponse.json({ order, result: "not_paid" });
  }

  const { error: fulfillError } = await admin.rpc("fulfill_order", {
    p_order_id: order.id,
    p_provider_trade_no: providerTradeNo ?? "",
  });

  if (fulfillError) {
    console.error(`[billing] admin fulfill failed order=${order.id}: ${fulfillError.message}`);
    return NextResponse.json({ error: "fulfill_failed" }, { status: 500 });
  }

  const { data: refreshed } = await admin.from("orders").select(ORDER_COLUMNS).eq("id", order.id).maybeSingle();
  console.log(`[billing] admin query fulfilled order=${order.id}`);

  return NextResponse.json({ order: refreshed ?? order, result: "fulfilled" });
}
