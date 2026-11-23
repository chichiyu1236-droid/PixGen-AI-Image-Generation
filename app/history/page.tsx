import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HistoryGrid } from "@/components/history-grid";
import { MembershipNotice } from "@/components/membership-notice";
import { EMPTY_BALANCE, getCreditBalance } from "@/lib/auth/balance";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Generation = Database["public"]["Tables"]["generations"]["Row"];

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureUserProfile(user).catch(() => undefined);
  const balance = await getCreditBalance(createSupabaseAdminClient(), user.id).catch(() => EMPTY_BALANCE);

  const { data } = await supabase
    .from("generations")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  const generations = (data ?? []) as Generation[];

  return (
    <AppShell balance={balance}>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <MembershipNotice balance={balance} compact />
        <HistoryGrid generations={generations} />
      </main>
    </AppShell>
  );
}
