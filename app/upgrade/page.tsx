import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth-button";
import { CreditBadge } from "@/components/credit-badge";
import { UpgradePlans } from "@/components/upgrade-plans";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getProfileCredits } from "@/lib/auth/profile";
import { creditPacks } from "@/lib/billing/packs";
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
  const credits = await getProfileCredits(supabase, user.id).catch(() => 0);

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-6 text-[var(--ink)]">
      <header className="mx-auto mb-8 flex max-w-6xl flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p className="font-display text-2xl tracking-[0.12em] text-black/40">UPGRADE</p>
          <h1 className="mt-2 text-4xl font-light tracking-[0.02em] md:text-5xl">购买积分</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/58">选择积分包,支持微信和支付宝支付。支付成功后积分立即到账。</p>
        </div>
        <nav className="flex flex-wrap items-center gap-3">
          <CreditBadge credits={credits} />
          <Link className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:border-black/20" href="/generate">
            返回生成页
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <div className="mx-auto max-w-6xl">
        <UpgradePlans packs={creditPacks.map((pack) => ({ ...pack }))} />
      </div>
    </main>
  );
}
