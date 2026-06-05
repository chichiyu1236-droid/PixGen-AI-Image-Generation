import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminCreditForm } from "@/components/admin-credit-form";
import { isAdminEmail } from "@/lib/admin/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminCreditsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!isAdminEmail(user.email)) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="rounded-lg border border-ink/10 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">无权限访问</h1>
          <p className="mt-2 text-sm text-ink/60">请使用管理员账号登录后再访问积分管理。</p>
          <Link className="mt-5 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/generate">
            返回生成页
          </Link>
        </div>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: profiles } = await admin.from("profiles").select("id,email,display_name,credits,updated_at").order("updated_at", { ascending: false }).limit(20);
  const { data: events } = await admin
    .from("credit_events")
    .select("id,user_id,type,amount,reason,created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="min-h-screen bg-paper px-6 py-6">
      <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">积分管理</h1>
          <p className="mt-1 text-sm text-ink/60">给测试用户补发积分，查看最近的积分流水。</p>
        </div>
        <Link className="rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold" href="/generate">
          返回生成页
        </Link>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[360px_1fr]">
        <AdminCreditForm />
        <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">最近用户</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-ink/50">
                <tr>
                  <th className="border-b border-ink/10 py-2">邮箱</th>
                  <th className="border-b border-ink/10 py-2">名称</th>
                  <th className="border-b border-ink/10 py-2">积分</th>
                  <th className="border-b border-ink/10 py-2">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {(profiles ?? []).map((profile) => (
                  <tr key={profile.id}>
                    <td className="border-b border-ink/5 py-2">{profile.email}</td>
                    <td className="border-b border-ink/5 py-2">{profile.display_name ?? "-"}</td>
                    <td className="border-b border-ink/5 py-2 font-semibold">{profile.credits}</td>
                    <td className="border-b border-ink/5 py-2 text-ink/60">{new Date(profile.updated_at).toLocaleString("zh-CN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 text-lg font-bold">最近积分流水</h2>
          <div className="mt-4 grid gap-2">
            {(events ?? []).map((event) => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper px-3 py-2 text-sm">
                <span className="font-semibold">{event.amount > 0 ? `+${event.amount}` : event.amount} 积分</span>
                <span className="text-ink/65">{event.reason}</span>
                <span className="text-ink/45">{new Date(event.created_at).toLocaleString("zh-CN")}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
