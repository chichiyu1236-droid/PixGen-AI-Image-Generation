import { describe, expect, it } from "vitest";
import { createMockBrain } from "@/lib/agent/brains/mock";
import type { BrainTurnRequest, ToolDefinition } from "@/lib/agent/types";

const tools: ToolDefinition[] = [];
const canvas = [
  { generationId: "gen-1", imageUrl: "https://example.test/1.png", origin: "agent", version: "图 1 · v1", promptSummary: "护肤品主图", createdAt: new Date().toISOString() },
] as BrainTurnRequest["context"]["canvas"];

function request(userText: string, contextOverrides: Partial<BrainTurnRequest["context"]> = {}): BrainTurnRequest {
  return {
    messages: [{ role: "user", content: userText }],
    tools,
    context: { canvas, selectedGenerationId: null, ...contextOverrides },
  };
}

async function drain(userText: string, contextOverrides: Partial<BrainTurnRequest["context"]> = {}) {
  const brain = createMockBrain();
  const actions = [];
  let response = await brain.respond(request(userText, contextOverrides));
  let guard = 0;

  while (response.kind === "tool_call" && guard < 10) {
    actions.push(response);
    response = await brain.respond({
      messages: [
        { role: "user", content: userText },
        { role: "tool", toolName: response.toolName, result: { ok: true, data: { generationId: "gen-new" } } },
      ],
      tools,
      context: { canvas, selectedGenerationId: null, ...contextOverrides },
    });
    guard += 1;
  }

  return { calls: actions, final: response };
}

describe("mock brain intent routing", () => {
  it("asks a clarifying question for fuzzy requests on an empty canvas", async () => {
    const { final } = await drain("我想发个小红书，但完全没想好要什么图", { canvas: [], selectedGenerationId: null });

    expect(final.kind).toBe("text");
    if (final.kind === "text") expect(final.text).toContain("聊出来");
  });

  it("plans build_prompt then generate for a concrete request", async () => {
    const { calls, final } = await drain("做一张高端护肤品的电商海报，极简风格", { canvas: [], selectedGenerationId: null });

    expect(calls.map((call) => call.toolName)).toEqual(["build_prompt", "generate_image"]);

    if (calls[0].kind === "tool_call") {
      expect(calls[0].args).toMatchObject({ imageType: "ecommerce_hero", style: "premium_minimal", subject: "做一张高端护肤品的电商海报，极简风格" });
    }

    expect(final.kind).toBe("text");
  });

  it("edits the selected image when one is selected", async () => {
    const { calls } = await drain("背景换成樱花色调", { selectedGenerationId: "gen-1" });

    expect(calls).toHaveLength(1);

    if (calls[0].kind === "tool_call") {
      expect(calls[0].toolName).toBe("edit_image");
      expect(calls[0].args).toMatchObject({ generationId: "gen-1", instruction: "背景换成樱花色调" });
    }
  });

  it("falls back to the latest canvas image for edit requests without selection", async () => {
    const { calls } = await drain("把背景换成樱花", { selectedGenerationId: null });

    if (calls[0].kind === "tool_call") {
      expect(calls[0].args).toMatchObject({ generationId: "gen-1" });
    }
  });

  it("produces two edit calls for variant requests", async () => {
    const { calls, final } = await drain("给这张图生成两个不同配色的变体", { selectedGenerationId: "gen-1" });

    expect(calls.map((call) => call.toolName)).toEqual(["edit_image", "edit_image"]);
    expect(final.kind).toBe("text");
  });

  it("answers honestly after a tool failure instead of continuing the plan", async () => {
    const brain = createMockBrain();
    const first = await brain.respond(request("做一张海报", { canvas: [], selectedGenerationId: null }));

    expect(first.kind).toBe("tool_call");

    const second = await brain.respond({
      messages: [
        { role: "user", content: "做一张海报" },
        { role: "tool", toolName: "build_prompt", result: { ok: false, error: "provider_unavailable", retryable: true } },
      ],
      tools,
      context: { canvas: [], selectedGenerationId: null },
    });

    expect(second.kind).toBe("text");

    if (second.kind === "text") {
      expect(second.text).toContain("失败");
      expect(second.text).toContain("没有扣积分");
    }
  });

  it("guides to purchase on insufficient credits", async () => {
    const brain = createMockBrain();
    const first = await brain.respond(request("做一张海报", { canvas: [], selectedGenerationId: null }));
    expect(first.kind).toBe("tool_call");

    const second = await brain.respond({
      messages: [
        { role: "user", content: "做一张海报" },
        { role: "tool", toolName: "build_prompt", result: { ok: false, error: "insufficient_credits", retryable: false } },
      ],
      tools,
      context: { canvas: [], selectedGenerationId: null },
    });

    if (second.kind === "text") expect(second.text).toContain("积分");
  });
});
