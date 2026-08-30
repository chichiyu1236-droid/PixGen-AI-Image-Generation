import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth-button";
import { CreditBadge } from "@/components/credit-badge";
import { MembershipNotice } from "@/components/membership-notice";
import { PricingPlans } from "@/components/pricing-plans";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { EMPTY_BALANCE, getCreditBalance } from "@/lib/auth/balance";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { membershipPlans } from "@/lib/billing/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function UpgradePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureUserProfile(user).catch(() => undefined);
  // evaluate_membership is service-role-only (it writes), so pages must read
  // the balance through the admin client, never the user-scoped one.
  const balance = await getCreditBalance(createSupabaseAdminClient(), user.id).catch(() => EMPTY_BALANCE);

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-6 text-[var(--ink)]">
      <header className="mx-auto mb-8 flex max-w-6xl flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p className="font-display text-2xl tracking-[0.12em] text-black/40">UPGRADE</p>
          <h1 className="mt-2 text-4xl font-light tracking-[0.02em] md:text-5xl">定价</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/58">
            一张图一分。会员卡每期发放生成额度，含 Agent 对话工作台；免费层为 5 张一次性试用积分，仅限经典模式。
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-3">
          <CreditBadge balance={balance} />
          <Link className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:border-black/20" href="/generate">
            返回生成页
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <MembershipNotice balance={balance} />

      <div className="mx-auto max-w-6xl">
        <PricingPlans plans={membershipPlans.map((plan) => ({ ...plan }))} />
      </div>
    </main>
  );
}
