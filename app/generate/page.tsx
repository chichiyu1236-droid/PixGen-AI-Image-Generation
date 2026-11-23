import { redirect } from "next/navigation";
import { AgentWorkbench } from "@/components/agent-workbench";
import { AppShell } from "@/components/app-shell";
import { GenerateModes } from "@/components/generate-modes";
import { GenerationForm } from "@/components/generation-form";
import { MembershipNotice } from "@/components/membership-notice";
import { EMPTY_BALANCE, getCreditBalance } from "@/lib/auth/balance";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GenerateRequest } from "@/lib/validation/generate";

type GeneratePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InitialReference = { id: string; url: string };

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
  // evaluate_membership is service-role-only (it writes), so pages must read
  // the balance through the admin client, never the user-scoped one.
  const balance = await getCreditBalance(createSupabaseAdminClient(), user.id).catch(() => EMPTY_BALANCE);
  const hasPrefill = Boolean(getSearchValue(resolvedSearchParams, "subject"));
  const { count } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "succeeded");
  const useExample = !hasPrefill && (count ?? 0) === 0;
  const mode = getSearchValue(resolvedSearchParams, "mode") === "agent" ? "agent" : "classic";

  // Reference prefill from history: foreign or stale refs are silently ignored
  // so the form simply starts empty instead of erroring out.
  const refId = getSearchValue(resolvedSearchParams, "ref");
  let initialReference: InitialReference | undefined;

  if (refId) {
    try {
      const { data } = await supabase
        .from("generations")
        .select("id, image_url")
        .eq("id", refId)
        .eq("user_id", user.id)
        .eq("status", "succeeded")
        .maybeSingle();
      const refData = data as { id: string; image_url: string | null } | null;

      if (refData?.image_url) {
        initialReference = { id: refData.id, url: refData.image_url };
      }
    } catch {
      // An invalid ref id (e.g. non-uuid) makes the query itself fail; ignore it.
    }
  }

  return (
    <AppShell balance={balance} immersive>
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4 lg:overflow-hidden lg:p-5">
        <MembershipNotice balance={balance} compact />
        <GenerateModes
          initialMode={mode}
          membershipActive={balance.membershipActive}
          classicForm={
            <GenerationForm
              credits={balance.totalCredits}
              initialValues={getInitialValues(resolvedSearchParams, useExample)}
              initialReference={initialReference}
            />
          }
          agentWorkbench={
            <AgentWorkbench
              credits={balance.totalCredits}
              membershipActive={balance.membershipActive}
            />
          }
        />
      </main>
    </AppShell>
  );
}
