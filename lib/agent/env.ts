import "server-only";

import { z } from "zod";

/** Env booleans arrive as strings; only "true" (or literal true) is truthy. */
const envBoolean = z.preprocess((value) => value === "true" || value === true, z.boolean());

const agentEnvSchema = z.object({
  AGENT_PROVIDER: z.enum(["real", "mock"]).default("mock"),
  AGENT_LLM_BASE_URL: z.string().url().default("https://open.bigmodel.cn/api/paas/v4"),
  AGENT_LLM_API_KEY: z.string().default(""),
  AGENT_LLM_MODEL: z.string().default("glm-4.6"),
  AGENT_MAX_ITERATIONS: z.coerce.number().int().min(1).max(10).default(5),
  ALLOW_MOCK_IN_PRODUCTION: envBoolean.default(false),
});

export type AgentEnv = z.infer<typeof agentEnvSchema>;

export function getAgentEnv(): AgentEnv {
  return agentEnvSchema.parse(process.env);
}

/** Resolves the brain provider id, enforcing the mock guard in production. */
export function resolveBrainProvider(): "real" | "mock" {
  const env = getAgentEnv();

  if (env.AGENT_PROVIDER === "mock" && process.env.NODE_ENV === "production" && !env.ALLOW_MOCK_IN_PRODUCTION) {
    throw new Error("mock_agent_brain_forbidden_in_production");
  }

  if (env.AGENT_PROVIDER === "real" && !env.AGENT_LLM_API_KEY) {
    throw new Error("real_agent_brain_not_configured: set AGENT_LLM_API_KEY");
  }

  return env.AGENT_PROVIDER;
}
