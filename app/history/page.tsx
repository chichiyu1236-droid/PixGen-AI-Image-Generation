import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth-button";
import { CreditBadge } from "@/components/credit-badge";
import { HistoryGrid } from "@/components/history-grid";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { EMPTY_BALANCE, getCreditBalance } from "@/lib/auth/balance";
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

  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("generations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false }),
    supabase.from("generations").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "succeeded"),
  ]);

  const generations = (data ?? []) as Generation[];

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-6 text-[var(--ink)]">
      <header className="mx-auto mb-8 flex max-w-6xl flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p className="font-display text-2xl tracking-[0.12em] text-black/40">HISTORY</p>
          <h1 className="mt-2 text-4xl font-light tracking-[0.02em] text-black md:text-5xl">我的图片</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/58">这里会保存你生成过的图片、提示词和反馈，方便下载、复制和再次生成。</p>
        </div>
        <nav className="flex flex-wrap items-center gap-3">
          <CreditBadge balance={balance} />
          <Link className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:border-black/20" href="/generate">
            返回生成页
          </Link>
          <Link className="rounded-full border border-black/10 bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/90" href="/">
            回到首页
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <section className="mx-auto mb-8 grid max-w-6xl gap-4 md:grid-cols-3">
        <StatCard label="已保存图片" value={String(count ?? generations.length)} detail="成功生成并保存的图片" />
        <StatCard label="默认排序" value="最新" detail="最近生成的图片排在前面" />
        <StatCard label="可用操作" value="4" detail="下载、复制、重新生成和反馈" />
      </section>

      <div className="mx-auto max-w-6xl">
        <HistoryGrid generations={generations} />
      </div>
    </main>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.5rem] border border-black/10 bg-white p-5 shadow-[0_18px_50px_rgba(0,0,0,0.04)]">
      <p className="font-display text-xl tracking-[0.12em] text-black/40">{label}</p>
      <div className="mt-4 text-4xl font-light text-black">{value}</div>
      <p className="mt-2 text-sm leading-6 text-black/58">{detail}</p>
    </div>
  );
}
