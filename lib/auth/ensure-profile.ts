import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

function stringMetadata(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function ensureUserProfile(user: AuthUser) {
  const admin = createSupabaseAdminClient();
  const { data: existing, error: selectError } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();

  if (selectError) {
    throw new Error(`Unable to check profile: ${selectError.message}`);
  }

  if (existing) {
    return false;
  }

  const metadata = user.user_metadata ?? {};
  const displayName = stringMetadata(metadata.full_name) ?? stringMetadata(metadata.name);
  const avatarUrl = stringMetadata(metadata.avatar_url);

  const { error: profileError } = await admin.from("profiles").insert({
    id: user.id,
    email: user.email ?? null,
    display_name: displayName,
    avatar_url: avatarUrl,
    credits: 5,
  });

  if (profileError) {
    throw new Error(`Unable to create profile: ${profileError.message}`);
  }

  const { error: eventError } = await admin.from("credit_events").insert({
    user_id: user.id,
    type: "signup_bonus",
    amount: 5,
    reason: "New user signup bonus",
  });

  if (eventError) {
    throw new Error(`Unable to create signup credit event: ${eventError.message}`);
  }

  return true;
}
