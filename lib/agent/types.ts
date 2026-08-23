/** Shared contracts between the agent loop, brains, and tools. */

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; retryable: boolean };

export type CanvasItem = {
  generationId: string;
  imageUrl: string;
  origin: "agent" | "agent_edit" | "agent_variant" | "classic";
  version: string;
  /** Label of the canvas item this one was derived from, if any. */
  basedOn: string | null;
  promptSummary: string;
  createdAt: string;
};

export type BrainContext = {
  canvas: CanvasItem[];
  selectedGenerationId: string | null;
};

export type BrainTurnMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "tool"; toolName: string; result: ToolResult };

export type BrainTurnRequest = {
  messages: BrainTurnMessage[];
  tools: ToolDefinition[];
  context: BrainContext;
};

export type BrainTurnResponse =
  | { kind: "text"; text: string }
  | { kind: "tool_call"; toolName: string; args: unknown };

export interface AgentBrain {
  respond(input: BrainTurnRequest): Promise<BrainTurnResponse>;
}

/** Ordered, UI-renderable record of one assistant turn. */
export type TraceItem =
  | { type: "step"; name: string; status: "running" | "done" | "failed"; detail?: string }
  | { type: "tool"; name: string; argsSummary: string; costCredits: number; status: "done" | "failed"; detail?: string }
  | { type: "image"; generationId: string; imageUrl: string; version: string; origin: CanvasItem["origin"] };
