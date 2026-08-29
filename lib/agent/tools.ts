import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getCreditBalance } from "@/lib/auth/balance";
import { editImageBase64, generateImageBase64 } from "@/lib/openai/images";
import { getImageProviderErrorReason, getImageProviderHealth, markImageProviderFailure } from "@/lib/openai/provider-health";
import { buildImagePrompt } from "@/lib/prompts/builder";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";
import { GENERATED_IMAGES_BUCKET, ensureGeneratedImagesBucket, uploadGeneratedImage } from "@/lib/storage/images";
import { generateRequestSchema } from "@/lib/validation/generate";
import type { ToolDefinition, ToolResult } from "@/lib/agent/types";

export type ToolContext = {
  userId: string;
  sessionId: string;
  admin: SupabaseClient<Database>;
  /** Prompt produced by build_prompt in the current run, consumed by generate_image. */
  lastBuiltPrompt: { prompt: string; options: z.infer<typeof generateRequestSchema> } | null;
};

const editImageArgsSchema = z.object({
  generationId: z.string().uuid(),
  instruction: z.string().trim().min(2).max(500),
  kind: z.enum(["edit", "variant"]).default("edit"),
});

const listCanvasArgsSchema = z.object({}).strict();

/** Enum field schema listing allowed keys with their Chinese labels. */
function enumField(label: string, options: Record<string, { label: string }>) {
  const keys = Object.keys(options);

  return {
    type: "string",
    enum: keys,
    description: `${label}，只能取以下值之一：${keys.map((key) => `${key}（${options[key].label}）`).join("、")}`,
  };
}

export const agentToolDefinitions: ToolDefinition[] = [
  {
    name: "build_prompt",
    description: "把用户的自然语言转成结构化画面字段并产出专业提示词。必须在 generate_image 之前调用。所有枚举字段只能取 description 里列出的值。",
    parameters: {
      type: "object",
      properties: {
        imageType: enumField("图片用途", imageTypes),
        aspectRatio: enumField("画面比例", aspectRatios),
        style: enumField("画面质感", styles),
        scene: enumField("场景", scenes),
        whitespace: enumField("留白", whitespaceOptions),
        subject: { type: "string", description: "主体描述（必填，至少 2 字）" },
        extra: { type: "string", description: "补充说明，可留空" },
      },
      required: ["subject"],
    },
  },
  {
    name: "generate_image",
    description: "使用最近一次 build_prompt 的结果生成图片，消耗 1 积分。无参数。",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "edit_image",
    description: "基于画布上已有图片执行指令式编辑（或生成保持构图的变体），消耗 1 积分。",
    parameters: {
      type: "object",
      properties: {
        generationId: { type: "string", description: "要编辑的画布图片 id" },
        instruction: { type: "string", description: "编辑指令：只描述要改的部分" },
        kind: { type: "string", description: "edit（默认）或 variant" },
      },
      required: ["generationId", "instruction"],
    },
  },
  {
    name: "list_canvas",
    description: "列出当前会话画布上的图片（id、版本、提示词摘要），用于定位编辑对象。无参数。",
    parameters: { type: "object", properties: {} },
  },
];

export async function runAgentTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "build_prompt":
      return runBuildPrompt(args, ctx);
    case "generate_image":
      return runGenerateImage(ctx);
    case "edit_image":
      return runEditImage(args, ctx);
    case "list_canvas":
      return runListCanvas(args, ctx);
    default:
      return { ok: false, error: `unknown_tool:${name}`, retryable: false };
  }
}

async function runBuildPrompt(args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = generateRequestSchema.safeParse(args);

  if (!parsed.success) {
    return { ok: false, error: `invalid_arguments:${parsed.error.issues[0]?.path.join(".") ?? "root"}`, retryable: true };
  }

  const prompt = buildImagePrompt(parsed.data);
  ctx.lastBuiltPrompt = { prompt, options: parsed.data };

  return {
    ok: true,
    data: {
      prompt,
      options: parsed.data,
      costCredits: 0,
    },
  };
}

/** Shared pre-flight for paid image tools: credits + provider health + bucket. */
async function preflightPaidTool(ctx: ToolContext): Promise<ToolResult | null> {
  let totalCredits: number;

  // evaluate_membership also settles pool expiry and due tranche grants.
  try {
    const balance = await getCreditBalance(ctx.admin, ctx.userId);
    totalCredits = balance.totalCredits;
  } catch {
    return { ok: false, error: "profile_unavailable", retryable: true };
  }

  if (totalCredits < 1) {
    return { ok: false, error: "insufficient_credits", retryable: false };
  }

  const health = getImageProviderHealth();

  if (!health.ok) {
    return { ok: false, error: "provider_unavailable", retryable: true };
  }

  try {
    await ensureGeneratedImagesBucket(ctx.admin);
  } catch {
    return { ok: false, error: "storage_unavailable", retryable: true };
  }

  return null;
}

function providerFailure(error: unknown): ToolResult {
  const reason = getImageProviderErrorReason(error);

  if (reason) {
    markImageProviderFailure(reason);
    return { ok: false, error: "provider_unavailable", retryable: true };
  }

  return { ok: false, error: "image_generation_failed", retryable: true };
}

async function runGenerateImage(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.lastBuiltPrompt) {
    return { ok: false, error: "no_prompt_built: call build_prompt first", retryable: true };
  }

  const blocked = await preflightPaidTool(ctx);

  if (blocked) {
    return blocked;
  }

  const { prompt, options } = ctx.lastBuiltPrompt;
  let base64Image: string;

  try {
    base64Image = await generateImageBase64({ prompt, size: aspectRatios[options.aspectRatio].size });
  } catch (error) {
    return providerFailure(error);
  }

  let uploaded: Awaited<ReturnType<typeof uploadGeneratedImage>>;

  try {
    uploaded = await uploadGeneratedImage(ctx.admin, { userId: ctx.userId, base64Image });
  } catch {
    return { ok: false, error: "storage_unavailable", retryable: true };
  }

  const { data: generation, error } = await ctx.admin.rpc("record_successful_generation", {
    p_user_id: ctx.userId,
    p_image_url: uploaded.imageUrl,
    p_storage_path: uploaded.storagePath,
    p_final_prompt: prompt,
    p_input_subject: options.subject,
    p_input_extra: options.extra,
    p_options_json: options,
    p_aspect_ratio: options.aspectRatio,
    p_agent_session_id: ctx.sessionId,
    p_origin: "agent",
  });

  if (error) {
    return { ok: false, error: rpcErrorKind(error), retryable: true };
  }

  return {
    ok: true,
    data: {
      generationId: generation.id,
      imageUrl: generation.image_url,
      origin: "agent",
      costCredits: 1,
    },
  };
}

async function runEditImage(args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = editImageArgsSchema.safeParse(args);

  if (!parsed.success) {
    return { ok: false, error: `invalid_arguments:${parsed.error.issues[0]?.path.join(".") ?? "root"}`, retryable: true };
  }

  const blocked = await preflightPaidTool(ctx);

  if (blocked) {
    return blocked;
  }

  const { data: source } = await ctx.admin
    .from("generations")
    .select("id, user_id, storage_path, final_prompt")
    .eq("id", parsed.data.generationId)
    .maybeSingle();

  if (!source || source.user_id !== ctx.userId) {
    return { ok: false, error: "generation_not_found", retryable: false };
  }

  if (!source.storage_path) {
    return { ok: false, error: "source_image_unavailable", retryable: true };
  }

  const { data: blob, error: downloadError } = await ctx.admin.storage
    .from(GENERATED_IMAGES_BUCKET)
    .download(source.storage_path);

  if (downloadError || !blob) {
    return { ok: false, error: "source_image_unavailable", retryable: true };
  }

  const sourceBase64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const editPrompt = `${source.final_prompt}\nEdit instruction (apply only this change, keep everything else): ${parsed.data.instruction}`;
  let base64Image: string;

  try {
    base64Image = await editImageBase64({ prompt: editPrompt, images: [sourceBase64] });
  } catch (error) {
    return providerFailure(error);
  }

  let uploaded: Awaited<ReturnType<typeof uploadGeneratedImage>>;

  try {
    uploaded = await uploadGeneratedImage(ctx.admin, { userId: ctx.userId, base64Image });
  } catch {
    return { ok: false, error: "storage_unavailable", retryable: true };
  }

  const origin = parsed.data.kind === "variant" ? "agent_variant" : "agent_edit";
  const { data: generation, error } = await ctx.admin.rpc("record_successful_generation", {
    p_user_id: ctx.userId,
    p_image_url: uploaded.imageUrl,
    p_storage_path: uploaded.storagePath,
    p_final_prompt: editPrompt,
    p_input_subject: parsed.data.instruction,
    p_input_extra: "",
    p_options_json: { editOf: source.id, kind: parsed.data.kind },
    p_aspect_ratio: "square",
    p_agent_session_id: ctx.sessionId,
    p_parent_generation_id: source.id,
    p_origin: origin,
    p_edit_instruction: parsed.data.instruction,
  });

  if (error) {
    return { ok: false, error: rpcErrorKind(error), retryable: true };
  }

  return {
    ok: true,
    data: {
      generationId: generation.id,
      imageUrl: generation.image_url,
      parentId: source.id,
      origin,
      costCredits: 1,
    },
  };
}

async function runListCanvas(args: unknown, ctx: ToolContext): Promise<ToolResult> {
  if (!listCanvasArgsSchema.safeParse(args).success) {
    return { ok: false, error: "invalid_arguments:list_canvas", retryable: false };
  }

  const items = await listCanvasItems(ctx.admin, ctx.sessionId);

  return { ok: true, data: { items, costCredits: 0 } };
}

/** Canvas of a session, oldest first, with lineage-derived version labels. */
export async function listCanvasItems(admin: SupabaseClient<Database>, sessionId: string) {
  const { data: rows } = await admin
    .from("generations")
    .select("id, image_url, origin, created_at, final_prompt, parent_generation_id")
    .eq("agent_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (!rows) {
    return [];
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const indexOf = new Map(rows.map((row, index) => [row.id, index]));
  const depthOf = (id: string): number => {
    let depth = 1;
    let current = byId.get(id);

    while (current?.parent_generation_id && byId.has(current.parent_generation_id)) {
      depth += 1;
      current = byId.get(current.parent_generation_id);
    }

    return depth;
  };
  const labelOf = (id: string): string => {
    const index = indexOf.get(id);

    return `图 ${(index ?? 0) + 1} · v${depthOf(id)}`;
  };

  return rows.map((row) => {
    const parent = row.parent_generation_id && byId.has(row.parent_generation_id) ? byId.get(row.parent_generation_id) : null;

    return {
      generationId: row.id,
      imageUrl: row.image_url ?? "",
      origin: row.origin as "agent" | "agent_edit" | "agent_variant" | "classic",
      version: labelOf(row.id),
      basedOn: parent ? labelOf(parent.id) : null,
      promptSummary: row.final_prompt.slice(0, 80),
      createdAt: row.created_at,
    };
  });
}

function rpcErrorKind(error: { message: string }): string {
  if (error.message.includes("insufficient_credits")) {
    return "insufficient_credits";
  }

  if (error.message.includes("profile_not_found")) {
    return "profile_unavailable";
  }

  return "generation_record_failed";
}
