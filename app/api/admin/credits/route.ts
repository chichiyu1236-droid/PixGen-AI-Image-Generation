import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const creditAdjustmentSchema = z.object({
  email: z.string().email(),
  amount: z.coerce.number().int().min(1).max(10000),
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
    .select("id,email,credits")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: "profile_lookup_failed" }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const nextCredits = profile.credits + parsed.data.amount;
  const { error: updateError } = await admin
    .from("profiles")
    .update({ credits: nextCredits, updated_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (updateError) {
    return NextResponse.json({ error: "credit_update_failed" }, { status: 500 });
  }

  const { error: eventError } = await admin.from("credit_events").insert({
    user_id: profile.id,
    type: "signup_bonus",
    amount: parsed.data.amount,
    reason: `Admin credit top-up: ${parsed.data.reason}`,
  });

  if (eventError) {
    return NextResponse.json({ error: "credit_event_failed" }, { status: 500 });
  }

  return NextResponse.json({
    profile: {
      email: profile.email,
      credits: nextCredits,
    },
  });
}
