import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const feedbackSchema = z.object({
  feedback: z.enum(["liked", "disliked"]).nullable(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("generations")
    .update({ feedback: parsed.data.feedback })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,feedback")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "feedback_update_failed" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "generation_not_found" }, { status: 404 });
  }

  return NextResponse.json({ generation: data });
}
