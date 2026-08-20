import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin/access";
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

  // A flagged order failed the amount check; fulfilling it is an explicit admin
  // confirmation that real payment arrived, so clear the flag first.
  if (order.status === "flagged") {
    const { error: clearError } = await admin
      .from("orders")
      .update({ status: "pending" })
      .eq("id", order.id)
      .eq("status", "flagged");

    if (clearError) {
      console.error(`[billing] admin fulfill clear-flag failed order=${order.id}: ${clearError.message}`);
      return NextResponse.json({ error: "fulfill_failed" }, { status: 500 });
    }
  }

  const { error: fulfillError } = await admin.rpc("fulfill_order", {
    p_order_id: order.id,
    p_provider_trade_no: order.provider_trade_no ?? "",
  });

  if (fulfillError) {
    console.error(`[billing] admin fulfill failed order=${order.id}: ${fulfillError.message}`);
    return NextResponse.json({ error: "fulfill_failed" }, { status: 500 });
  }

  const { data: refreshed } = await admin.from("orders").select(ORDER_COLUMNS).eq("id", order.id).maybeSingle();
  console.log(`[billing] admin manual fulfill order=${order.id}`);

  return NextResponse.json({ order: refreshed ?? order, result: "fulfilled" });
}
