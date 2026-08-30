import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createBrain } from "@/lib/agent/brain";
import { AGENT_MEMBERSHIP_REQUIRED, requireAgentMembership } from "@/lib/agent/membership-gate";
import { runAgentTurn } from "@/lib/agent/loop";
import { listCanvasItems, type ToolContext } from "@/lib/agent/tools";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getCreditBalance } from "@/lib/auth/balance";
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

  // Agent mode is members-only; enforce before any message or tool work.
  // Gate placement follows the ownership 404 above so probing foreign
  // sessions still reports "not found" regardless of membership.
  const gate = await requireAgentMembership(admin, user.id);

  if (!gate.allowed) {
    return NextResponse.json({ error: AGENT_MEMBERSHIP_REQUIRED }, { status: 403 });
  }

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
    // Evaluated once by the membership gate; the generation RPC stays the
    // authoritative per-image balance enforcement.
    totalCredits: gate.balance.totalCredits,
    lastBuiltPrompt: null,
  };

  let turn: Awaited<ReturnType<typeof runAgentTurn>>;

  try {
    turn = await runAgentTurn({
      brain,
      userText: parsed.data.text,
      history,
      context: { canvas, selectedGenerationId: parsed.data.selectedGenerationId },
      ctx,
    });
  } catch (error) {
    // The user message is already stored; fail the turn without poisoning the
    // transcript - the user can simply retry.
    console.error(error);
    return NextResponse.json({ error: "agent_turn_failed" }, { status: 502 });
  }

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
  // Kept numeric (dual-pool total) to preserve the workbench contract.
  let remainingCredits: number | null = null;

  try {
    remainingCredits = (await getCreditBalance(admin, user.id)).totalCredits;
  } catch {
    remainingCredits = null;
  }

  return NextResponse.json({
    userMessage: { id: userMessageId, role: "user", content: parsed.data.text, trace: [], created_at: new Date().toISOString() },
    assistantMessage,
    canvas: nextCanvas,
    remainingCredits,
  });
}
