import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Load .env.local so Playwright exercises the real Supabase project when the
// developer has one; fall back to inert placeholder values otherwise.
function loadEnvFile() {
  const envUrl = new URL("../.env.local", import.meta.url);

  if (!existsSync(envUrl)) {
    return {};
  }

  const env = {};
  for (const rawLine of readFileSync(envUrl, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);

    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }

  return env;
}

const fileEnv = loadEnvFile();

const env = {
  ...process.env,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? fileEnv.OPENAI_API_KEY ?? "test-openai-key",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? fileEnv.OPENAI_BASE_URL,
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL ?? fileEnv.OPENAI_IMAGE_MODEL ?? "gpt-image2",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-supabase-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key",
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? fileEnv.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? fileEnv.ADMIN_EMAILS,
  BILLING_PROVIDER: process.env.BILLING_PROVIDER ?? fileEnv.BILLING_PROVIDER ?? "mock",
  // E2E must not depend on the paid image relay or an external LLM.
  IMAGE_PROVIDER: process.env.IMAGE_PROVIDER ?? fileEnv.IMAGE_PROVIDER ?? "mock",
  AGENT_PROVIDER: process.env.AGENT_PROVIDER ?? fileEnv.AGENT_PROVIDER ?? "mock",
};

const command = process.platform === "win32" ? "cmd.exe" : "npm";
const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run dev"] : ["run", "dev"];
const child = spawn(command, args, {
  env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
