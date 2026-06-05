import Link from "next/link";
import { redirect } from "next/navigation";
import { HistoryGrid } from "@/components/history-grid";
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

  const { data } = await supabase
    .from("generations")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });
  const generations = (data ?? []) as Generation[];

  return (
    <main className="min-h-screen bg-paper px-6 py-6">
      <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">生成历史</h1>
          <p className="mt-1 text-sm text-ink/60">查看已保存的图片、提示词和积分消耗。</p>
        </div>
        <Link className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/generate">
          返回生成
        </Link>
      </header>
      <div className="mx-auto max-w-6xl">
        <HistoryGrid generations={generations} />
      </div>
    </main>
  );
}
