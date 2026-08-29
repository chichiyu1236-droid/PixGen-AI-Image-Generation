// One-off: measure agent workbench panel heights against the local dev server.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `shot-${stamp}@example.com`;
const password = `Shot!${stamp}Aa`;
const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;

const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: { session } } = await anon.auth.signInWithPassword({ email, password });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1234, height: 709 } });
await page.context().addCookies([
  {
    name: `sb-${ref}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    domain: "localhost",
    path: "/",
  },
]);
await page.goto("http://localhost:3000/generate?mode=agent", { waitUntil: "networkidle" });
await page.getByText("DIALOGUE").waitFor({ timeout: 60000 });

const boxes = await page.evaluate(() => {
  const sections = document.querySelectorAll("main section");
  return [...sections].slice(-2).map((s) => {
    const r = s.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
});
console.log("local DIALOGUE/CANVAS sizes:", JSON.stringify(boxes));

await admin.auth.admin.deleteUser(created.user.id);
await browser.close();
console.log("done");
