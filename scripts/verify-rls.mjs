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
  //    RLS silently turns a policy-less UPDATE into a no-op (0 rows), so assert
  //    on the persisted value, not on an error being raised.
  {
    const creditsBefore = await getProfileCredits(userA.id);
    const { error: updateError } = await clientA.from("profiles").update({ credits: 999 }).eq("id", userA.id);
    const creditsAfter = await getProfileCredits(userA.id);
    const { error: insertError } = await clientA
      .from("profiles")
      .insert({ id: userA.id, email: userA.email, credits: 999 });
    check(
      "A cannot insert or update profiles.credits",
      !updateError && creditsAfter === creditsBefore && Boolean(insertError),
      `credits: ${creditsBefore} -> ${creditsAfter} (update must be a no-op) / insert: ${insertError ? insertError.message : "ALLOWED"}`,
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
  // 9. Billing: orders RLS. A sees own orders only; anon sees none; A cannot insert.
  {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: orderA, error: insertAError } = await admin
      .from("orders")
      .insert({
        user_id: userA.id,
        pack_id: "starter-20",
        credits: 20,
        amount_fen: 990,
        channel: "wechat",
        provider: "rls-check",
        expires_at: expiresAt,
      })
      .select()
      .single();
    const { data: orderB } = await admin
      .from("orders")
      .insert({
        user_id: userB.id,
        pack_id: "starter-20",
        credits: 20,
        amount_fen: 990,
        channel: "alipay",
        provider: "rls-check",
        expires_at: expiresAt,
      })
      .select()
      .single();

    const { data: ownRows, error: ownError } = await clientA.from("orders").select("id").eq("user_id", userA.id);
    const { data: bRows, error: bError } = await clientA.from("orders").select("id").eq("user_id", userB.id);
    check(
      "A sees only own orders",
      !insertAError && Boolean(orderA) && Boolean(orderB) && !ownError && !bError && ownRows.length === 1 && bRows.length === 0,
      insertAError?.message ?? ownError?.message ?? bError?.message ?? "",
    );

    {
      const anon = createClient(url, anonKey);
      const { data, error } = await anon.from("orders").select("id");
      check("anonymous client sees no orders", !error && data.length === 0, error?.message ?? "");
    }

    {
      const { error: userInsertError } = await clientA.from("orders").insert({
        user_id: userA.id,
        pack_id: "starter-20",
        credits: 20,
        amount_fen: 990,
        channel: "wechat",
        provider: "rls-check",
        expires_at: expiresAt,
      });
      check("A cannot insert orders", Boolean(userInsertError), userInsertError ? "" : "INSERT ALLOWED");
    }

    // 10. fulfill_order is idempotent: two calls grant credits exactly once.
    {
      const creditsBefore = await getProfileCredits(userA.id);
      const first = await admin.rpc("fulfill_order", { p_order_id: orderA.id, p_provider_trade_no: "rls-trade-a" });
      const second = await admin.rpc("fulfill_order", { p_order_id: orderA.id, p_provider_trade_no: "rls-trade-a" });
      const creditsAfter = await getProfileCredits(userA.id);
      const { count } = await admin
        .from("credit_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userA.id)
        .eq("type", "purchase");
      check(
        "fulfill_order double call grants credits once",
        !first.error && !second.error && creditsAfter - creditsBefore === orderA.credits && count === 1,
        `${first.error?.message ?? ""} ${second.error?.message ?? ""} ${creditsBefore} -> ${creditsAfter}, purchase events: ${count}`,
      );
    }

    // 11. fulfill_order covers money-first expiry: expired -> paid still delivers.
    {
      const { error: expireError } = await admin.from("orders").update({ status: "expired" }).eq("id", orderB.id);
      const creditsBefore = await getProfileCredits(userB.id);
      const fulfilled = await admin.rpc("fulfill_order", { p_order_id: orderB.id, p_provider_trade_no: "rls-trade-b" });
      const creditsAfter = await getProfileCredits(userB.id);
      check(
        "fulfill_order delivers on expired order (money in, credits out)",
        !expireError && !fulfilled.error && creditsAfter - creditsBefore === orderB.credits,
        fulfilled.error?.message ?? expireError?.message ?? `${creditsBefore} -> ${creditsAfter}`,
      );
    }

    // 12. adjust_credits: atomic add/deduct, admin_adjustment event, overdraft refused.
    {
      const creditsBefore = await getProfileCredits(userB.id);
      const add = await admin.rpc("adjust_credits", {
        p_user_id: userB.id,
        p_amount: 5,
        p_reason: "RLS verify add",
        p_type: "admin_adjustment",
      });
      const deduct = await admin.rpc("adjust_credits", {
        p_user_id: userB.id,
        p_amount: -3,
        p_reason: "RLS verify deduct",
        p_type: "admin_adjustment",
      });
      const overdraft = await admin.rpc("adjust_credits", {
        p_user_id: userB.id,
        p_amount: -99999,
        p_reason: "RLS verify overdraft",
        p_type: "admin_adjustment",
      });
      const creditsAfter = await getProfileCredits(userB.id);
      const { count } = await admin
        .from("credit_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userB.id)
        .eq("type", "admin_adjustment");
      check(
        "adjust_credits adds/deducts atomically and refuses overdraft",
        !add.error && !deduct.error && Boolean(overdraft.error) && overdraft.error.message.includes("insufficient_credits")
          && creditsAfter - creditsBefore === 2 && count === 2,
        `${add.error?.message ?? ""} ${deduct.error?.message ?? ""} ${overdraft.error?.message ?? "no overdraft error"}`,
      );
    }

    // 13. Non-service callers cannot execute the billing RPCs.
    {
      const { error: fulfillError } = await clientA.rpc("fulfill_order", { p_order_id: orderA.id, p_provider_trade_no: "x" });
      const { error: adjustError } = await clientA.rpc("adjust_credits", {
        p_user_id: userA.id,
        p_amount: 100,
        p_reason: "escalation attempt",
        p_type: "admin_adjustment",
      });
      check(
        "anon/user client cannot call fulfill_order or adjust_credits",
        Boolean(fulfillError) && Boolean(adjustError),
        `fulfill: ${fulfillError ? fulfillError.message : "ALLOWED"} / adjust: ${adjustError ? adjustError.message : "ALLOWED"}`,
      );
    }
  }

  // 14. Agent workbench: session/message isolation and lineage RPC.
  {
    const { data: sessionA } = await admin
      .from("agent_sessions")
      .insert({ user_id: userA.id, title: "A 的会话" })
      .select()
      .single();
    const { data: sessionB } = await admin
      .from("agent_sessions")
      .insert({ user_id: userB.id, title: "B 的会话" })
      .select()
      .single();
    await admin.from("agent_messages").insert([
      { session_id: sessionA.id, role: "user", content: "A: 做张海报" },
      { session_id: sessionB.id, role: "user", content: "B: 做张海报" },
    ]);

    const { data: ownSessions, error: ownSessionsError } = await clientA
      .from("agent_sessions")
      .select("id")
      .eq("id", sessionA.id);
    const { data: foreignSessions, error: foreignError } = await clientA
      .from("agent_sessions")
      .select("id")
      .eq("id", sessionB.id);
    const { data: ownMessages, error: ownMessagesError } = await clientA
      .from("agent_messages")
      .select("id")
      .eq("session_id", sessionA.id);
    const { data: foreignMessages, error: foreignMessagesError } = await clientA
      .from("agent_messages")
      .select("id")
      .eq("session_id", sessionB.id);
    const { error: insertError } = await clientA
      .from("agent_sessions")
      .insert({ user_id: userA.id });
    const anon = createClient(url, anonKey);
    const { data: anonSessions, error: anonError } = await anon.from("agent_sessions").select("id");

    check(
      "agent sessions/messages isolated per owner; writes service-role only",
      Boolean(sessionA) && Boolean(sessionB)
        && !ownSessionsError && ownSessions.length === 1
        && !foreignError && foreignSessions.length === 0
        && !ownMessagesError && ownMessages.length === 1
        && !foreignMessagesError && foreignMessages.length === 0
        && Boolean(insertError)
        && !anonError && anonSessions.length === 0,
      ownSessionsError?.message ?? foreignError?.message ?? ownMessagesError?.message ?? foreignMessagesError?.message
        ?? insertError?.message ?? "",
    );

    // Lineage RPC: agent-scoped generation plus an edit child, both linked to A's session.
    const { data: parent, error: parentError } = await admin.rpc("record_successful_generation", {
      p_user_id: userA.id,
      p_image_url: "https://example.com/agent-1.png",
      p_storage_path: `${userA.id}/agent-1.png`,
      p_final_prompt: "agent prompt",
      p_input_subject: "海报",
      p_input_extra: "",
      p_options_json: { subject: "海报" },
      p_aspect_ratio: "square",
      p_agent_session_id: sessionA.id,
      p_origin: "agent",
    });
    const { data: child, error: childError } = await admin.rpc("record_successful_generation", {
      p_user_id: userA.id,
      p_image_url: "https://example.com/agent-2.png",
      p_storage_path: `${userA.id}/agent-2.png`,
      p_final_prompt: "agent prompt + edit",
      p_input_subject: "背景换成樱花",
      p_input_extra: "",
      p_options_json: { editOf: parent?.id },
      p_aspect_ratio: "square",
      p_agent_session_id: sessionA.id,
      p_parent_generation_id: parent?.id ?? null,
      p_origin: "agent_edit",
      p_edit_instruction: "背景换成樱花",
    });

    check(
      "record_successful_generation stores agent lineage",
      !parentError && !childError
        && parent?.agent_session_id === sessionA.id && parent?.origin === "agent"
        && child?.parent_generation_id === parent.id
        && child?.origin === "agent_edit"
        && child?.edit_instruction === "背景换成樱花",
      parentError?.message ?? childError?.message ?? "",
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
