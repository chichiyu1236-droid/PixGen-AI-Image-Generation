import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth-button";
import { CreditBadge } from "@/components/credit-badge";
import { MembershipNotice } from "@/components/membership-notice";
import { PricingPlans } from "@/components/pricing-plans";
import { UpgradePlans } from "@/components/upgrade-plans";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { EMPTY_BALANCE, getCreditBalance } from "@/lib/auth/balance";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { creditPacks } from "@/lib/billing/packs";
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
            一张图一分。会员卡每期发放生成额度，标准与 Pro 随时可续费或升级；积分包积分永久有效，所有人可加购。
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

        <section className="mt-12 border-t border-black/10 pt-8">
          <h2 className="text-2xl font-light">购买积分包（加购）</h2>
          <p className="mt-1 text-sm leading-6 text-black/58">积分包积分进入永久池，永不过期，会员与非会员都可购买，用于补充订阅池之外的长期额度。</p>
          <div className="mt-6">
            <UpgradePlans packs={creditPacks.map((pack) => ({ ...pack }))} />
          </div>
        </section>
      </div>
    </main>
  );
}
