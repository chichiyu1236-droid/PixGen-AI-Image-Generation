import { spawn } from "node:child_process";

const env = {
  ...process.env,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "test-openai-key",
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image2",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-supabase-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key",
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
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
