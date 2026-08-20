import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminOrderActions } from "@/components/admin-order-actions";
import { isAdminEmail } from "@/lib/admin/access";
import { formatFenAsCny } from "@/lib/billing/money";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminOrdersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待支付" },
  { value: "paid", label: "已支付" },
  { value: "expired", label: "已过期" },
  { value: "failed", label: "失败" },
  { value: "flagged", label: "异常" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  expired: "已过期",
  failed: "失败",
  flagged: "异常",
};

const CHANNEL_LABEL: Record<string, string> = {
  wechat: "微信",
  alipay: "支付宝",
};

const PAGE_SIZE = 20;

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const statusFilter = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "";
  const page = Math.max(1, Number.parseInt(typeof resolvedSearchParams.page === "string" ? resolvedSearchParams.page : "1", 10) || 1);

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
          <p className="mt-2 text-sm text-ink/60">请使用管理员账号登录后再访问订单管理。</p>
          <Link className="mt-5 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/generate">
            返回生成页
          </Link>
        </div>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("orders")
    .select("id,user_id,pack_id,credits,amount_fen,status,channel,provider,provider_trade_no,created_at,paid_at,profiles(email)")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (statusFilter && statusFilter in STATUS_LABEL) {
    query = query.eq("status", statusFilter as "pending" | "paid" | "expired" | "failed" | "flagged");
  }

  const { data: orders } = await query;

  return (
    <main className="min-h-screen bg-paper px-6 py-6">
      <header className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">订单管理</h1>
          <p className="mt-1 text-sm text-ink/60">查询订单支付状态、处理“已付款未到账”的工单。手工补发会幂等发货，重复点击安全。</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold" href="/admin/credits">
            积分管理
          </Link>
          <Link className="rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold" href="/generate">
            返回生成页
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl">
        <nav className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => {
            const active = statusFilter === filter.value;
            const href = filter.value ? `/admin/orders?status=${filter.value}` : "/admin/orders";

            return (
              <Link
                key={filter.value || "all"}
                href={href}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${active ? "bg-ink text-white" : "border border-ink/15 bg-white hover:border-ink/35"}`}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>

        <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-ink/50">
                <tr>
                  <th className="border-b border-ink/10 py-2">下单时间</th>
                  <th className="border-b border-ink/10 py-2">用户</th>
                  <th className="border-b border-ink/10 py-2">积分包</th>
                  <th className="border-b border-ink/10 py-2">金额</th>
                  <th className="border-b border-ink/10 py-2">通道</th>
                  <th className="border-b border-ink/10 py-2">状态</th>
                  <th className="border-b border-ink/10 py-2">平台单号</th>
                  <th className="border-b border-ink/10 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {(orders ?? []).map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="border-b border-ink/5 py-2 text-ink/70">{new Date(order.created_at).toLocaleString("zh-CN")}</td>
                    <td className="border-b border-ink/5 py-2">{(order.profiles as { email: string | null } | null)?.email ?? "-"}</td>
                    <td className="border-b border-ink/5 py-2">
                      {order.pack_id}({order.credits} 积分)
                    </td>
                    <td className="border-b border-ink/5 py-2 font-semibold">{formatFenAsCny(order.amount_fen)}</td>
                    <td className="border-b border-ink/5 py-2">{CHANNEL_LABEL[order.channel] ?? order.channel}</td>
                    <td className="border-b border-ink/5 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          order.status === "paid"
                            ? "bg-emerald-50 text-emerald-700"
                            : order.status === "flagged"
                              ? "bg-red-50 text-red-700"
                              : order.status === "pending"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-ink/5 text-ink/60"
                        }`}
                      >
                        {STATUS_LABEL[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="border-b border-ink/5 py-2 font-mono text-xs text-ink/60">{order.provider_trade_no ?? "-"}</td>
                    <td className="border-b border-ink/5 py-2">
                      <AdminOrderActions order={{ id: order.id, status: order.status }} />
                    </td>
                  </tr>
                ))}
                {(orders ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-ink/40">
                      暂无订单
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-ink/60">
            <span>第 {page} 页</span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  className="rounded-md border border-ink/20 px-3 py-1.5 font-medium"
                  href={statusFilter ? `/admin/orders?status=${statusFilter}&page=${page - 1}` : `/admin/orders?page=${page - 1}`}
                >
                  上一页
                </Link>
              ) : null}
              {(orders ?? []).length === PAGE_SIZE ? (
                <Link
                  className="rounded-md border border-ink/20 px-3 py-1.5 font-medium"
                  href={statusFilter ? `/admin/orders?status=${statusFilter}&page=${page + 1}` : `/admin/orders?page=${page + 1}`}
                >
                  下一页
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
