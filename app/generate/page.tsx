import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth-button";
import { CreditBadge } from "@/components/credit-badge";
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

function getInitialValues(searchParams: Record<string, string | string[] | undefined>): Partial<GenerateRequest> {
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
    subject: getSearchValue(searchParams, "subject") ?? "",
    extra: getSearchValue(searchParams, "extra") ?? "",
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
        <GenerationForm credits={credits} initialValues={getInitialValues(resolvedSearchParams)} />
      </div>
    </main>
  );
}
