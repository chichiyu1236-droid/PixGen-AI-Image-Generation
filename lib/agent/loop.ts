import "server-only";

import { getAgentEnv } from "@/lib/agent/env";
import { agentToolDefinitions, runAgentTool, type ToolContext } from "@/lib/agent/tools";
import type { AgentBrain, BrainContext, BrainTurnMessage, CanvasItem, TraceItem } from "@/lib/agent/types";

export type AgentTurnInput = {
  brain: AgentBrain;
  userText: string;
  /** Prior turns, condensed to user/assistant text messages. */
  history: BrainTurnMessage[];
  /** Canvas state the brain uses to resolve edit targets. */
  context: BrainContext;
  ctx: ToolContext;
};

export type AgentTurnResult = {
  replyText: string;
  trace: TraceItem[];
  toolCalls: { name: string; argsSummary: string; ok: boolean }[];
};

const TOOL_LABELS: Record<string, string> = {
  build_prompt: "组装专业提示词",
  generate_image: "生成图片",
  edit_image: "编辑所选图片",
  list_canvas: "查看画布",
};

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const { brain, ctx, context } = input;
  const maxIterations = getAgentEnv().AGENT_MAX_ITERATIONS;
  const messages: BrainTurnMessage[] = [...input.history, { role: "user", content: input.userText }];
  const trace: TraceItem[] = [];
  const toolCalls: AgentTurnResult["toolCalls"] = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const response = await brain.respond({ messages, tools: agentToolDefinitions, context });

    if (response.kind === "text") {
      return { replyText: response.text, trace, toolCalls };
    }

    const argsSummary = summarizeArgs(response.args);
    const label = TOOL_LABELS[response.toolName] ?? response.toolName;
    let step: TraceItem = { type: "step", name: label, status: "running" };
    trace.push(step);

    const result = await runAgentTool(response.toolName, response.args, ctx);
    const costCredits = result.ok ? Number(result.data.costCredits ?? 0) : 0;

    step = { type: "step", name: label, status: result.ok ? "done" : "failed" };
    trace[trace.length - 1] = step;

    trace.push({
      type: "tool",
      name: response.toolName,
      argsSummary,
      costCredits,
      status: result.ok ? "done" : "failed",
      detail: result.ok ? undefined : result.error,
    });
    toolCalls.push({ name: response.toolName, argsSummary, ok: result.ok });

    if (result.ok) {
      const image = result.data as Partial<CanvasItem> & { imageUrl?: string };

      if (image.generationId && image.imageUrl) {
        trace.push({
          type: "image",
          generationId: image.generationId,
          imageUrl: image.imageUrl,
          version: "",
          origin: image.origin ?? "agent",
        });
      }
    }

    messages.push({ role: "tool", toolName: response.toolName, result });
  }

  // Iteration budget exhausted: guarantee an honest final assistant message.
  return {
    replyText: "这一轮的步骤有点多，我先停在这里。可以换个说法再试，或直接告诉我要改哪一步。",
    trace,
    toolCalls,
  };
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";

  const record = args as Record<string, unknown>;

  if (typeof record.instruction === "string") {
    return `instruction: ${record.instruction}`;
  }

  if (typeof record.subject === "string") {
    return `subject: ${record.subject}`;
  }

  return "";
}
