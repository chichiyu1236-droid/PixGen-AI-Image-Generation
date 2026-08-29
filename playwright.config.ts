import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

// The specs need real Supabase credentials to create/delete test users, but
// `next dev` loads .env.local only for the server process. Load it for the
// test runner too so `npm run e2e` works from a clean shell.
function loadEnvFile() {
  if (!existsSync(".env.local")) {
    return;
  }

  for (const rawLine of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);

    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile();

// The agent spec asserts scripted mock-brain replies and real image
// generation is too slow/flaky for tests - never leak local provider config.
process.env.AGENT_PROVIDER = "mock";
process.env.IMAGE_PROVIDER = "mock";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node scripts/start-dev-for-playwright.mjs",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      AGENT_PROVIDER: "mock",
      IMAGE_PROVIDER: "mock",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
