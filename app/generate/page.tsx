import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentWorkbench } from "@/components/agent-workbench";
import { LogoutButton } from "@/components/auth-button";
import { CreditBadge } from "@/components/credit-badge";
import { GenerateModes } from "@/components/generate-modes";
import { GenerationForm } from "@/components/generation-form";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getProfileCredits } from "@/lib/auth/profile";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GenerateRequest } from "@/lib/validation/generate";

type GeneratePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

function isOptionKey<T extends Record<string, unknown>>(options: T, value: string | undefined): value is keyof T & string {
  return Boolean(value && value in options);
}

function getInitialValues(searchParams: Record<string, string | string[] | undefined>, useExample: boolean): Partial<GenerateRequest> {
  const imageType = getSearchValue(searchParams, "imageType");
  const aspectRatio = getSearchValue(searchParams, "aspectRatio");
  const style = getSearchValue(searchParams, "style");
  const scene = getSearchValue(searchParams, "scene");
  const whitespace = getSearchValue(searchParams, "whitespace");

  return {
    ...(isOptionKey(imageTypes, imageType) ? { imageType } : {}),
    ...(isOptionKey(aspectRatios, aspectRatio) ? { aspectRatio } : {}),
    ...(isOptionKey(styles, style) ? { style } : {}),
    ...(isOptionKey(scenes, scene) ? { scene } : {}),
    ...(isOptionKey(whitespaceOptions, whitespace) ? { whitespace } : {}),
    subject: getSearchValue(searchParams, "subject") ?? (useExample ? "一瓶高端护肤精华" : ""),
    extra: getSearchValue(searchParams, "extra") ?? (useExample ? "透明玻璃瓶，银色瓶盖，干净高级的广告背景" : ""),
  };
}

export default async function GeneratePage({ searchParams }: GeneratePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureUserProfile(user).catch(() => undefined);
  const credits = await getProfileCredits(supabase, user.id).catch(() => 0);
  const hasPrefill = Boolean(getSearchValue(resolvedSearchParams, "subject"));
  const { count } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "succeeded");
  const useExample = !hasPrefill && (count ?? 0) === 0;
  const mode = getSearchValue(resolvedSearchParams, "mode") === "agent" ? "agent" : "classic";

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-6 text-[var(--ink)]">
      <header className="mx-auto mb-8 flex max-w-6xl flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p className="font-display text-2xl tracking-[0.12em] text-black/40">STUDIO</p>
          <h1 className="mt-2 text-4xl font-light tracking-[0.02em] text-black md:text-5xl">开始生成图片</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/58">两种方式，取决于你现在处于哪种状态：已经有想法，就从经典生成开始；还没有想法，就交给 Agent 聊出来。</p>
        </div>
        <nav className="flex flex-wrap items-center gap-3">
          <CreditBadge credits={credits} />
          <Link className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:border-black/25" href="/upgrade">
            购买积分
          </Link>
          <Link className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:border-black/20" href="/history">
            历史记录
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <div className="mx-auto max-w-6xl">
        <GenerateModes
          initialMode={mode}
          classicForm={<GenerationForm credits={credits} initialValues={getInitialValues(resolvedSearchParams, useExample)} />}
          agentWorkbench={<AgentWorkbench credits={credits} />}
        />
      </div>
    </main>
  );
}
