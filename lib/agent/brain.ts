import "server-only";

import OpenAI from "openai";
import { getAgentEnv, resolveBrainProvider } from "@/lib/agent/env";
import { createMockBrain } from "@/lib/agent/brains/mock";
import type { AgentBrain, BrainTurnRequest, BrainTurnResponse } from "@/lib/agent/types";

export const AGENT_SYSTEM_PROMPT = `你是 PixGen 的图片创作 Agent，服务两类请求：帮没有想法的用户聊出想法，以及为有想法的用户直接生成、修改图片。

工作准则：
1. 先判断用户意图：模糊求助 → 先提 1-2 个澄清问题（可用文字列出选项）再行动；明确的生成/修改/变体请求 → 直接调用工具。
2. 生成图片前必须先调用 build_prompt 把大白话转成结构化画面字段；生成用 generate_image（无参数，使用刚构建的提示词）。
3. 用户要修改图片时，从画布中定位对象：优先使用当前选中的 generationId，否则用 list_canvas 查询后选择最相关的，再调用 edit_image。
4. 变体请求 = 对同一张图调用多次 edit_image，指令中说明保持构图、只换配色或风格方向。
5. 每次图片生成或编辑消耗 1 积分，变体按个数累计。余额不足时工具会返回错误，用自然语言引导用户购买积分，不要重试。
6. 工具失败时不要编造结果，如实告知并建议稍后重试。
7. 最终回复用简洁中文，说明做了什么、消耗了多少积分、结果在画布哪个位置。`;

class RealBrain implements AgentBrain {
  private client: OpenAI;
  private model: string;

  constructor() {
    const env = getAgentEnv();
    this.client = new OpenAI({ apiKey: env.AGENT_LLM_API_KEY, baseURL: env.AGENT_LLM_BASE_URL });
    this.model = env.AGENT_LLM_MODEL;
  }

  async respond(input: BrainTurnRequest): Promise<BrainTurnResponse> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: AGENT_SYSTEM_PROMPT + "\n\n当前画布与选中状态（JSON）：" + JSON.stringify(input.context) },
    ];

    for (const message of input.messages) {
      if (message.role === "tool") {
        messages.push({
          role: "tool",
          content: JSON.stringify(message.result),
          // The SDK requires a tool_call_id; the loop renders each call as its
          // own exchange, so a stable per-tool id keeps the protocol satisfied.
          tool_call_id: `call_${message.toolName}`,
        });
      } else {
        messages.push({ role: message.role, content: message.content });
      }
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: input.tools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    });

    const choice = completion.choices[0];
    const call = choice?.message?.tool_calls?.[0];

    if (call && "function" in call && choice?.finish_reason === "tool_calls") {
      return {
        kind: "tool_call",
        toolName: call.function.name,
        args: safeParseJson(call.function.arguments),
      };
    }

    return { kind: "text", text: choice?.message?.content?.trim() || "（无回复，请重试）" };
  }
}

function safeParseJson(raw: string | null): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function createBrain(): AgentBrain {
  return resolveBrainProvider() === "mock" ? createMockBrain() : new RealBrain();
}
