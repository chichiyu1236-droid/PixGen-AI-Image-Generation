import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth-button";
import { CreditBadge } from "@/components/credit-badge";
import { GenerationForm } from "@/components/generation-form";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getProfileCredits } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GeneratePage() {
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
    <main className="min-h-screen bg-paper px-6 py-6">
      <header className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">AI 图片生成</h1>
          <p className="mt-1 text-sm text-ink/60">用结构化选项生成专业 GPT Image 提示词。</p>
        </div>
        <nav className="flex flex-wrap items-center gap-3">
          <CreditBadge credits={credits} />
          <Link className="rounded-md border border-ink/20 px-3 py-2 text-sm" href="/history">
            历史
          </Link>
          <LogoutButton />
        </nav>
      </header>
      <div className="mx-auto max-w-6xl">
        <GenerationForm credits={credits} />
      </div>
    </main>
  );
}
