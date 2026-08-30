import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getBillingEnv } from "@/lib/billing/env";
import { getMembershipPlan } from "@/lib/billing/plans";
import { getBillingProvider, getWebhookUrl } from "@/lib/billing/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const checkoutRequestSchema = z
  .object({
    packId: z.string().min(1).optional(),
    planId: z.string().min(1).optional(),
    channel: z.enum(["wechat", "alipay"]),
  })
  .refine((value) => Boolean(value.packId) !== Boolean(value.planId), {
    message: "exactly one of packId or planId is required",
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

  // Credit packs are delisted: membership cards are the only purchasable SKU,
  // so any packId-bearing request is answered with a clean "no such product".
  if (parsed.data.packId) {
    return NextResponse.json({ error: "unknown_sku" }, { status: 404 });
  }

  const plan = parsed.data.planId ? getMembershipPlan(parsed.data.planId) : undefined;

  if (!plan) {
    return NextResponse.json({ error: "unknown_sku" }, { status: 404 });
  }

  const skuId = plan.id;
  const amountFen = plan.amountFen;
  const credits = plan.quotaPerTranche;
  const bodyText = `${plan.name}: 每期 ${plan.quotaPerTranche} 张`;
  const planSnapshot = {
    planId: plan.id,
    quotaPerTranche: plan.quotaPerTranche,
    tranches: plan.tranches,
    periodDays: plan.periodDays,
  };

  const admin = createSupabaseAdminClient();

  try {
    await ensureUserProfile(user);
  } catch {
    return NextResponse.json({ error: "profile_unavailable" }, { status: 500 });
  }

  const now = new Date();
  const reuseCutoff = new Date(now.getTime() - REUSE_WINDOW_MS).toISOString();

  // Reuse a fresh, still-payable order for the same SKU and channel instead of
  // stacking duplicates on double clicks.
  const { data: reusable } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .eq("pack_id", skuId)
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
    pack_id: skuId,
    credits,
    amount_fen: amountFen,
    status: "pending",
    channel: parsed.data.channel,
    provider: provider.id,
    kind: "plan",
    plan_snapshot: planSnapshot,
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
      amountFen,
      body: bodyText,
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

  console.log(
    `[billing] checkout order=${orderId} sku=${skuId} kind=plan channel=${parsed.data.channel} provider=${provider.id}`,
  );

  return NextResponse.json({ orderId, reused: false });
}
