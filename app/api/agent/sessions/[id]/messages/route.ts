import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createBrain } from "@/lib/agent/brain";
import { runAgentTurn } from "@/lib/agent/loop";
import { listCanvasItems, type ToolContext } from "@/lib/agent/tools";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BrainTurnMessage } from "@/lib/agent/types";

const messageRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  selectedGenerationId: z.string().uuid().nullable().default(null),
});

const HISTORY_WINDOW = 12;

type MessagesRouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: MessagesRouteContext) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const parsed = messageRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  // RLS: another user's session id is indistinguishable from a missing one.
  const { data: session } = await supabase.from("agent_sessions").select("id, title").eq("id", id).maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  try {
    await ensureUserProfile(user);
  } catch {
    return NextResponse.json({ error: "profile_unavailable" }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const userMessageId = randomUUID();
  const { error: insertUserError } = await admin.from("agent_messages").insert({
    id: userMessageId,
    session_id: id,
    role: "user",
    content: parsed.data.text,
  });

  if (insertUserError) {
    console.error(insertUserError);
    return NextResponse.json({ error: "message_store_failed" }, { status: 500 });
  }

  const { data: historyRows } = await admin
    .from("agent_messages")
    .select("role, content")
    .eq("session_id", id)
    .neq("id", userMessageId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_WINDOW);

  const history: BrainTurnMessage[] = (historyRows ?? [])
    .slice()
    .reverse()
    .map((row) => ({ role: row.role === "user" ? "user" : "assistant", content: row.content }));

  const canvas = await listCanvasItems(admin, id);

  let brain;

  try {
    brain = createBrain();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "agent_provider_unavailable" }, { status: 500 });
  }

  const ctx: ToolContext = {
    userId: user.id,
    sessionId: id,
    admin,
    lastBuiltPrompt: null,
  };

  const turn = await runAgentTurn({
    brain,
    userText: parsed.data.text,
    history,
    context: { canvas, selectedGenerationId: parsed.data.selectedGenerationId },
    ctx,
  });

  const { data: assistantMessage, error: insertAssistantError } = await admin
    .from("agent_messages")
    .insert({
      session_id: id,
      role: "assistant",
      content: turn.replyText,
      trace: turn.trace,
    })
    .select("id, role, content, trace, created_at")
    .single();

  if (insertAssistantError || !assistantMessage) {
    console.error(insertAssistantError);
    return NextResponse.json({ error: "message_store_failed" }, { status: 500 });
  }

  const isFirstExchange = history.length === 0;
  const { error: sessionError } = await admin
    .from("agent_sessions")
    .update({
      last_message_at: new Date().toISOString(),
      ...(isFirstExchange ? { title: parsed.data.text.slice(0, 30) } : {}),
    })
    .eq("id", id);

  if (sessionError) {
    console.error(sessionError);
  }

  const nextCanvas = await listCanvasItems(admin, id);

  return NextResponse.json({
    userMessage: { id: userMessageId, role: "user", content: parsed.data.text, trace: [], created_at: new Date().toISOString() },
    assistantMessage,
    canvas: nextCanvas,
  });
}
