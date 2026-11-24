import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MembershipNotice } from "@/components/membership-notice";
import { PricingPlans } from "@/components/pricing-plans";
import { EMPTY_BALANCE, getCreditBalance } from "@/lib/auth/balance";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { membershipPlans } from "@/lib/billing/plans";
import { getSupportEmail } from "@/lib/billing/support";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function UpgradePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/upgrade");
  }

  await ensureUserProfile(user).catch(() => undefined);
  // evaluate_membership is service-role-only (it writes), so pages must read
  // the balance through the admin client, never the user-scoped one.
  const balance = await getCreditBalance(createSupabaseAdminClient(), user.id).catch(() => EMPTY_BALANCE);
  const billingProvider = process.env.BILLING_PROVIDER?.trim().toLowerCase() || "mock";
  const supportEmail = getSupportEmail();

  return (
    <AppShell balance={balance}>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <MembershipNotice balance={balance} compact />

        <header className="border-b border-[#171916]/10 pb-6">
          <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">PLANS</p>
          <h1 className="mt-1.5 font-display text-3xl font-normal text-[#171916] sm:text-4xl">会员与积分方案</h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-6 text-[#484e45]">
            1 张图扣 1 积分。会员按期给额度，包含 Agent 对话；免费账号含 5 张一次性试用，仅限经典模式。
          </p>
        </header>

        <PricingPlans
          plans={membershipPlans.map((plan) => ({ ...plan }))}
          billingProvider={billingProvider}
          supportEmail={supportEmail}
        />
      </main>
    </AppShell>
  );
}
