import type { AgentBrain, BrainTurnRequest, BrainTurnResponse, BrainTurnMessage } from "@/lib/agent/types";

type QueuedAction = BrainTurnResponse;

const FUZZY_PATTERN = /没想好|没想法|不知道|帮我想|没头绪|纠结/;
const EDIT_PATTERN = /改|换|调|去掉|删除|加上|背景|颜色|配色|留白|文字/;
const VARIANT_PATTERN = /变体|几个版本|不同配色/;

/**
 * Scripted intent router for dev/test. Emits the same tool-call sequences a
 * well-behaved real brain would produce; all credits, persistence, and image
 * work still run through the real tool implementations.
 */
class MockBrain implements AgentBrain {
  private queue: QueuedAction[] = [];
  private lastUserText: string | null = null;

  async respond(input: BrainTurnRequest): Promise<BrainTurnResponse> {
    // A hard tool failure short-circuits the remaining plan with an honest reply.
    const failure = latestFailure(input.messages);

    if (failure) {
      this.queue = [];

      if (failure.error === "insufficient_credits") {
        return { kind: "text", text: "积分余额不足，无法继续。可以到「会员方案」开通会员卡后回来继续，我们接着改。" };
      }

      return { kind: "text", text: `刚才的工具调用失败了（${failure.error}），本次没有扣积分。可以稍后再试一次。` };
    }

    const userText = latestUserText(input.messages);

    if (userText !== null && userText !== this.lastUserText) {
      this.lastUserText = userText;
      this.queue = this.plan(userText, input);
    }

    return this.queue.shift() ?? { kind: "text", text: "（继续说你想怎么调整就好。）" };
  }

  private plan(userText: string, input: BrainTurnRequest): QueuedAction[] {
    const { canvas, selectedGenerationId } = input.context;
    const target = selectedGenerationId ?? canvas.at(-1)?.generationId ?? null;

    if (VARIANT_PATTERN.test(userText)) {
      if (!target) {
        return [{ kind: "text", text: "画布上还没有图片，先说一句想生成什么，我再帮你出变体。" }];
      }

      return [
        { kind: "tool_call", toolName: "edit_image", args: { generationId: target, instruction: "保持主体构图与产品形态不变，整体配色换为海洋蓝方向", kind: "variant" } },
        { kind: "tool_call", toolName: "edit_image", args: { generationId: target, instruction: "保持主体构图与产品形态不变，整体配色换为森林绿方向", kind: "variant" } },
        { kind: "text", text: "两个配色变体已经放上画布（共消耗 2 积分）。选中喜欢的那个可以继续改。" },
      ];
    }

    const wantsEdit = Boolean(target) && (selectedGenerationId !== null || EDIT_PATTERN.test(userText));

    if (wantsEdit) {
      return [
        { kind: "tool_call", toolName: "edit_image", args: { generationId: target, instruction: userText } },
        { kind: "text", text: "改好了，新版本已经放上画布并标注了来源（消耗 1 积分）。继续说要调哪里就行。" },
      ];
    }

    if (FUZZY_PATTERN.test(userText) || (!userText.trim() && canvas.length === 0)) {
      return [
        { kind: "text", text: "没关系，想法是聊出来的。先说两个小事：\n1. 这张图主要给谁看？（小红书 / 朋友圈 / 商品页…）\n2. 喜欢什么氛围？（干净、温暖、酷、浪漫…）\n也可以直接回我一句「你直接给我个方案」。" },
      ];
    }

    return [
      {
        kind: "tool_call",
        toolName: "build_prompt",
        args: {
          imageType: "ecommerce_hero",
          aspectRatio: "square",
          style: "premium_minimal",
          scene: "studio",
          whitespace: "balanced",
          subject: userText,
          extra: "",
        },
      },
      { kind: "tool_call", toolName: "generate_image", args: {} },
      { kind: "text", text: "生成好了（消耗 1 积分），已经放上画布。选中它之后直接说要怎么改——比如「背景换成樱花色调」。" },
    ];
  }
}

function latestUserText(messages: BrainTurnMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];

    if (message.role === "user") {
      return message.content;
    }
  }

  return null;
}

function latestFailure(messages: BrainTurnMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];

    if (message.role === "tool" && !message.result.ok) {
      return message.result;
    }
  }

  return null;
}

/** The mock brain keeps per-turn state; every run must get a fresh instance. */
export function createMockBrain(): AgentBrain {
  return new MockBrain();
}
