import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const creditAdjustmentSchema = z.object({
  email: z.string().email(),
  amount: z.coerce
    .number()
    .int()
    .refine((value) => value !== 0, "Amount must not be zero")
    .refine((value) => Math.abs(value) <= 10000, "Amount out of range"),
  reason: z.string().trim().min(2).max(200).default("Admin credit top-up"),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = creditAdjustmentSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: "profile_lookup_failed" }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const { data: credits, error: adjustError } = await admin.rpc("adjust_credits", {
    p_user_id: profile.id,
    p_amount: parsed.data.amount,
    p_reason: `Admin adjustment: ${parsed.data.reason}`,
    p_type: "admin_adjustment",
  });

  if (adjustError) {
    const message = adjustError.message.includes("insufficient_credits")
      ? "insufficient_credits"
      : "credit_update_failed";
    return NextResponse.json({ error: message }, { status: adjustError.message.includes("insufficient_credits") ? 409 : 500 });
  }

  return NextResponse.json({
    profile: {
      email: profile.email,
      credits,
    },
  });
}
