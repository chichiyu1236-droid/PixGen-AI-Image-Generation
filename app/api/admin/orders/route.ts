import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const listQuerySchema = z.object({
  status: z.enum(["pending", "paid", "expired", "failed", "flagged"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    page: url.searchParams.get("page") ?? 1,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("orders")
    .select("id,user_id,pack_id,credits,amount_fen,status,channel,provider,provider_trade_no,pay_url,expires_at,created_at,paid_at,notified_at,profiles(email)")
    .order("created_at", { ascending: false })
    .range((parsed.data.page - 1) * PAGE_SIZE, parsed.data.page * PAGE_SIZE - 1);

  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "order_list_failed" }, { status: 500 });
  }

  return NextResponse.json({ orders: orders ?? [], page: parsed.data.page });
}
