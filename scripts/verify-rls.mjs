// Automates the manual checklist in tests/db/rls-notes.md against the
// Supabase project configured in .env.local. Creates two throwaway users,
// runs every check, then deletes both users (profiles/generations/credit_events
// cascade). Exits non-zero if any check fails.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const userA = { email: `rls-check-a-${stamp}@example.com`, password: `Rls!Check-a-${stamp}` };
const userB = { email: `rls-check-b-${stamp}@example.com`, password: `Rls!Check-b-${stamp}` };
const createdUserIds = [];

async function signInClient(user) {
  const client = createClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`signIn failed for ${user.email}: ${error.message}`);
  return client;
}

async function getProfileCredits(userId) {
  const { data, error } = await admin.from("profiles").select("credits").eq("id", userId).single();
  if (error) throw new Error(`admin profile read failed: ${error.message}`);
  return data.credits;
}

try {
  // Arrange: two confirmed users; the handle_new_user trigger bootstraps their profiles.
  for (const user of [userA, userB]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    user.id = data.user.id;
    createdUserIds.push(user.id);
  }

  const clientA = await signInClient(userA);

  // 1. User A can select their own profiles row.
  {
    const { data, error } = await clientA.from("profiles").select("id").eq("id", userA.id);
    check("A can select own profiles row", !error && data.length === 1, error?.message ?? "");
  }

  // 2. User A cannot select User B's profiles row.
  {
    const { data, error } = await clientA.from("profiles").select("id").eq("id", userB.id);
    check("A cannot select B's profiles row", !error && data.length === 0, error?.message ?? "");
  }

  // Bonus: anonymous client sees no profiles at all.
  {
    const anon = createClient(url, anonKey);
    const { data, error } = await anon.from("profiles").select("id");
    check("anonymous client sees no profiles", !error && data.length === 0, error?.message ?? "");
  }

  // 6. record_successful_generation deducts 1 credit and writes one credit_events row.
  //     Run for B so A's later generation reads can prove isolation.
  const creditsBefore = await getProfileCredits(userB.id);
  {
    const { error } = await admin.rpc("record_successful_generation", {
      p_user_id: userB.id,
      p_image_url: "https://example.com/rls-check.png",
      p_storage_path: `${userB.id}/rls-check.png`,
      p_final_prompt: "RLS checklist verification prompt",
      p_input_subject: "rls check",
      p_input_extra: "",
      p_options_json: { imageType: "social_post", aspectRatio: "square" },
      p_aspect_ratio: "square",
    });
    const creditsAfter = error ? creditsBefore : await getProfileCredits(userB.id);
    const { count } = await admin
      .from("credit_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userB.id)
      .eq("type", "generation_charge");

    const deducted = !error && creditsBefore - creditsAfter === 1;
    check(
      "record_successful_generation deducts 1 credit and writes one charge event",
      deducted && count === 1,
      error ? error.message : `${creditsBefore} -> ${creditsAfter}, charge events: ${count}`,
    );
  }

  // 3. User A can select their own generations rows (A has none yet, plus B's must be hidden).
  {
    const { data: ownRows, error: ownError } = await clientA
      .from("generations")
      .select("id")
      .eq("user_id", userA.id);
    const { data: bRows, error: bError } = await clientA
      .from("generations")
      .select("id")
      .eq("user_id", userB.id);
    check(
      "A sees only own generations (none), never B's",
      !ownError && !bError && ownRows.length === 0 && bRows.length === 0,
      ownError?.message ?? bError?.message ?? "",
    );
  }

  // 4. User A can select own credit_events rows (signup bonus from the trigger).
  {
    const { data, error } = await clientA.from("credit_events").select("type").eq("user_id", userA.id);
    check("A can select own credit_events rows", !error && data.length === 1 && data[0].type === "signup_bonus", error?.message ?? "");
  }

  // 5. User A cannot read B's credit_events rows.
  {
    const { data, error } = await clientA.from("credit_events").select("id").eq("user_id", userB.id);
    check("A cannot select B's credit_events rows", !error && data.length === 0, error?.message ?? "");
  }

  // 7. User A cannot insert or update profiles.credits from the browser client.
  {
    const { error: updateError } = await clientA.from("profiles").update({ credits: 999 }).eq("id", userA.id);
    const { error: insertError } = await clientA
      .from("profiles")
      .insert({ id: userA.id, email: userA.email, credits: 999 });
    check(
      "A cannot insert or update profiles.credits",
      Boolean(updateError) && Boolean(insertError),
      `update: ${updateError ? updateError.message : "ALLOWED"} / insert: ${insertError ? insertError.message : "ALLOWED"}`,
    );
  }

  // 8. record_successful_generation raises insufficient_credits at 0 credits.
  {
    const { error: setZeroError } = await admin.from("profiles").update({ credits: 0 }).eq("id", userB.id);
    const { error } = await admin.rpc("record_successful_generation", {
      p_user_id: userB.id,
      p_image_url: "https://example.com/rls-check.png",
      p_storage_path: `${userB.id}/rls-check-2.png`,
      p_final_prompt: "RLS checklist verification prompt",
      p_input_subject: "rls check",
      p_input_extra: "",
      p_options_json: { imageType: "social_post", aspectRatio: "square" },
      p_aspect_ratio: "square",
    });
    check(
      "record_successful_generation raises insufficient_credits at 0",
      !setZeroError && Boolean(error) && error.message.includes("insufficient_credits"),
      error ? error.message : setZeroError?.message ?? "no error raised",
    );
  }
} catch (error) {
  console.error(`\nAborted: ${error.message}`);
} finally {
  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`Cleanup failed for ${id}: ${error.message} — delete manually in Supabase`);
  }
  const { count: leftover, error: leftoverError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .in("id", createdUserIds);
  const message =
    leftoverError
      ? `\nCleanup: could not verify leftovers (${leftoverError.message}).`
      : leftover === 0
        ? "\nCleanup: test users removed, no leftover profiles."
        : `\nCleanup: WARNING — ${leftover} test profiles still present.`;
  console.log(message);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length > 0 ? 1 : 0);
