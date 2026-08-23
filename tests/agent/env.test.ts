import { afterEach, describe, expect, it, vi } from "vitest";
import { getAgentEnv, resolveBrainProvider } from "@/lib/agent/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAgentEnv", () => {
  it("applies defaults for missing agent variables", () => {
    const env = getAgentEnv();

    expect(env.AGENT_PROVIDER).toBe("mock");
    expect(env.AGENT_LLM_MODEL).toBe("glm-4.6");
    expect(env.AGENT_MAX_ITERATIONS).toBe(5);
    expect(env.ALLOW_MOCK_IN_PRODUCTION).toBe(false);
  });

  it("parses and coerces provided values", () => {
    vi.stubEnv("AGENT_PROVIDER", "real");
    vi.stubEnv("AGENT_LLM_API_KEY", "sk-test");
    vi.stubEnv("AGENT_MAX_ITERATIONS", "3");

    const env = getAgentEnv();

    expect(env.AGENT_PROVIDER).toBe("real");
    expect(env.AGENT_LLM_API_KEY).toBe("sk-test");
    expect(env.AGENT_MAX_ITERATIONS).toBe(3);
  });
});

describe("resolveBrainProvider guard", () => {
  it("returns mock outside production", () => {
    vi.stubEnv("AGENT_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveBrainProvider()).toBe("mock");
  });

  it("rejects mock brain in production unless explicitly allowed", () => {
    vi.stubEnv("AGENT_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_MOCK_IN_PRODUCTION", "false");

    expect(() => resolveBrainProvider()).toThrow("mock_agent_brain_forbidden_in_production");
  });

  it("allows mock brain in production when explicitly allowed", () => {
    vi.stubEnv("AGENT_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_MOCK_IN_PRODUCTION", "true");

    expect(resolveBrainProvider()).toBe("mock");
  });

  it("rejects real brain without an API key", () => {
    vi.stubEnv("AGENT_PROVIDER", "real");
    vi.stubEnv("AGENT_LLM_API_KEY", "");

    expect(() => resolveBrainProvider()).toThrow("real_agent_brain_not_configured");
  });

  it("returns real when configured", () => {
    vi.stubEnv("AGENT_PROVIDER", "real");
    vi.stubEnv("AGENT_LLM_API_KEY", "sk-test");

    expect(resolveBrainProvider()).toBe("real");
  });
});
