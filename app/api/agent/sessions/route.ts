import { NextResponse } from "next/server";
import { AGENT_MEMBERSHIP_REQUIRED, requireAgentMembership } from "@/lib/agent/membership-gate";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    await ensureUserProfile(user);
  } catch {
    return NextResponse.json({ error: "profile_unavailable" }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();

  // Agent mode is members-only; enforce before any session state is created.
  const gate = await requireAgentMembership(admin, user.id);

  if (!gate.allowed) {
    return NextResponse.json({ error: AGENT_MEMBERSHIP_REQUIRED }, { status: 403 });
  }

  const { data: session, error } = await admin
    .from("agent_sessions")
    .insert({ user_id: user.id })
    .select("id, title, created_at, last_message_at")
    .single();

  if (error || !session) {
    console.error(error);
    return NextResponse.json({ error: "session_create_failed" }, { status: 500 });
  }

  return NextResponse.json({ session });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // RLS confines the listing to the caller's own sessions.
  const { data: sessions, error } = await supabase
    .from("agent_sessions")
    .select("id, title, created_at, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "sessions_unavailable" }, { status: 500 });
  }

  return NextResponse.json({ sessions });
}
