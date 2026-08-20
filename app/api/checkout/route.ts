import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getBillingEnv } from "@/lib/billing/env";
import { getCreditPack } from "@/lib/billing/packs";
import { getBillingProvider, getWebhookUrl } from "@/lib/billing/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const checkoutRequestSchema = z.object({
  packId: z.string().min(1),
  channel: z.enum(["wechat", "alipay"]),
});

const REUSE_WINDOW_MS = 2 * 60 * 1000;
const MAX_ACTIVE_PENDING_ORDERS = 3;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const parsed = checkoutRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const pack = getCreditPack(parsed.data.packId);

  if (!pack) {
    return NextResponse.json({ error: "unknown_pack" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();

  try {
    await ensureUserProfile(user);
  } catch {
    return NextResponse.json({ error: "profile_unavailable" }, { status: 500 });
  }

  const now = new Date();
  const reuseCutoff = new Date(now.getTime() - REUSE_WINDOW_MS).toISOString();

  // Reuse a fresh, still-payable order for the same pack and channel instead of
  // stacking duplicates on double clicks.
  const { data: reusable } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .eq("pack_id", pack.id)
    .eq("channel", parsed.data.channel)
    .eq("status", "pending")
    .not("pay_url", "is", null)
    .gt("created_at", reuseCutoff)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reusable) {
    return NextResponse.json({ orderId: reusable.id, reused: true });
  }

  const { count: activePending } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", now.toISOString());

  if ((activePending ?? 0) >= MAX_ACTIVE_PENDING_ORDERS) {
    return NextResponse.json({ error: "too_many_pending_orders" }, { status: 409 });
  }

  const provider = getBillingProvider();
  const orderId = randomUUID();
  const expiresAt = new Date(now.getTime() + getBillingEnv().ORDER_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await admin.from("orders").insert({
    id: orderId,
    user_id: user.id,
    pack_id: pack.id,
    credits: pack.credits,
    amount_fen: pack.amountFen,
    status: "pending",
    channel: parsed.data.channel,
    provider: provider.id,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error(insertError);
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  let payUrl: string;

  try {
    const payment = await provider.createPayment({
      orderId,
      amountFen: pack.amountFen,
      body: `${pack.name}: ${pack.credits} 积分`,
      channel: parsed.data.channel,
      notifyUrl: getWebhookUrl(provider.id),
      ttlMinutes: getBillingEnv().ORDER_TTL_MINUTES,
    });
    payUrl = payment.payUrl;
  } catch (error) {
    console.error(error);
    await admin.from("orders").update({ status: "failed" }).eq("id", orderId);
    return NextResponse.json({ error: "provider_unavailable" }, { status: 502 });
  }

  const { error: updateError } = await admin.from("orders").update({ pay_url: payUrl }).eq("id", orderId);

  if (updateError) {
    console.error(updateError);
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  console.log(`[billing] checkout order=${orderId} pack=${pack.id} channel=${parsed.data.channel} provider=${provider.id}`);

  return NextResponse.json({ orderId, reused: false });
}
