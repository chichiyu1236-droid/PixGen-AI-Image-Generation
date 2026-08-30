import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn } from "@/lib/agent/loop";
import type { ToolContext } from "@/lib/agent/tools";
import type { AgentBrain, BrainTurnResponse, ToolResult } from "@/lib/agent/types";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/agent/tools", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/agent/tools")>();

  return {
    ...original,
    runAgentTool: vi.fn(),
  };
});

vi.mock("@/lib/agent/env", () => ({
  getAgentEnv: () => ({ AGENT_MAX_ITERATIONS: 3, AGENT_PROVIDER: "mock" }),
}));

import { runAgentTool } from "@/lib/agent/tools";

/** Brain that replays scripted responses in order. */
function scriptedBrain(responses: BrainTurnResponse[]): AgentBrain {
  let index = 0;

  return {
    async respond() {
      const response = responses[index];
      index += 1;
      return response ?? { kind: "text", text: "（结束）" };
    },
  };
}

function toolResult(overrides: Partial<ToolResult> = {}): ToolResult {
  return { ok: true, data: {}, ...overrides } as ToolResult;
}

function turnInput(brain: AgentBrain) {
  return {
    brain,
    userText: "做一张海报",
    history: [],
    context: { canvas: [], selectedGenerationId: null },
    ctx: {
      userId: "user-1",
      sessionId: "session-1",
      admin: {} as SupabaseClient<Database>,
      totalCredits: 5,
      lastBuiltPrompt: null,
    } satisfies ToolContext,
  };
}

beforeEach(() => {
  vi.mocked(runAgentTool).mockReset();
});

describe("runAgentTurn", () => {
  it("runs tool calls in order and returns the final text with a full trace", async () => {
    vi.mocked(runAgentTool)
      .mockResolvedValueOnce(toolResult({ data: { prompt: "p", costCredits: 0 } }))
      .mockResolvedValueOnce(
        toolResult({ data: { generationId: "gen-1", imageUrl: "https://example.test/1.png", origin: "agent", costCredits: 1 } }),
      );

    const result = await runAgentTurn(
      turnInput(
        scriptedBrain([
          { kind: "tool_call", toolName: "build_prompt", args: { subject: "海报" } },
          { kind: "tool_call", toolName: "generate_image", args: {} },
          { kind: "text", text: "生成好了（消耗 1 积分）。" },
        ]),
      ),
    );

    expect(result.replyText).toBe("生成好了（消耗 1 积分）。");
    expect(result.toolCalls.map((call) => call.name)).toEqual(["build_prompt", "generate_image"]);
    expect(result.trace).toEqual([
      { type: "step", name: "组装专业提示词", status: "done" },
      { type: "tool", name: "build_prompt", argsSummary: "subject: 海报", costCredits: 0, status: "done" },
      { type: "step", name: "生成图片", status: "done" },
      { type: "tool", name: "generate_image", argsSummary: "", costCredits: 1, status: "done" },
      { type: "image", generationId: "gen-1", imageUrl: "https://example.test/1.png", version: "", origin: "agent" },
    ]);
  });

  it("marks failed steps in the trace and feeds the failure back to the brain", async () => {
    vi.mocked(runAgentTool).mockResolvedValueOnce({ ok: false, error: "provider_unavailable", retryable: true });

    const seenResults: ToolResult[] = [];
    let calls = 0;
    const brain: AgentBrain = {
      async respond(request) {
        calls += 1;

        if (calls === 1) {
          return { kind: "tool_call", toolName: "generate_image", args: {} };
        }

        const last = request.messages.at(-1);
        if (last && last.role === "tool") seenResults.push(last.result);
        return { kind: "text", text: "失败了，稍后再试。" };
      },
    };

    const result = await runAgentTurn(turnInput(brain));

    expect(seenResults).toEqual([{ ok: false, error: "provider_unavailable", retryable: true }]);
    expect(result.trace).toEqual([
      { type: "step", name: "生成图片", status: "failed" },
      { type: "tool", name: "generate_image", argsSummary: "", costCredits: 0, status: "failed", detail: "provider_unavailable" },
    ]);
  });

  it("stops at the iteration cap with an honest fallback reply", async () => {
    vi.mocked(runAgentTool).mockResolvedValue(toolResult());

    const result = await runAgentTurn(
      turnInput(
        scriptedBrain([
          { kind: "tool_call", toolName: "list_canvas", args: {} },
          { kind: "tool_call", toolName: "list_canvas", args: {} },
          { kind: "tool_call", toolName: "list_canvas", args: {} },
          { kind: "tool_call", toolName: "list_canvas", args: {} },
        ]),
      ),
    );

    expect(vi.mocked(runAgentTool)).toHaveBeenCalledTimes(3);
    expect(result.replyText).toContain("先停在这里");
  });

  it("returns text-only turns with an empty trace", async () => {
    const result = await runAgentTurn(turnInput(scriptedBrain([{ kind: "text", text: "先聊聊你想做什么。" }])));

    expect(result.replyText).toBe("先聊聊你想做什么。");
    expect(result.trace).toEqual([]);
    expect(result.toolCalls).toEqual([]);
  });
});
