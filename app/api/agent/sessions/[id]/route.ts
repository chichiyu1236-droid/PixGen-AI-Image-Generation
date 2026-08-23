import { NextResponse } from "next/server";
import { listCanvasItems } from "@/lib/agent/tools";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SessionRouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: SessionRouteContext) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // RLS makes other users' sessions invisible: model that as a 404.
  const { data: session } = await supabase
    .from("agent_sessions")
    .select("id, title, created_at, last_message_at")
    .eq("id", id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  const { data: messages, error } = await supabase
    .from("agent_messages")
    .select("id, role, content, trace, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "messages_unavailable" }, { status: 500 });
  }

  const canvas = await listCanvasItems(createSupabaseAdminClient(), id);

  return NextResponse.json({ session, messages, canvas });
}
