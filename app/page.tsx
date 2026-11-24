import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  // When the auth redirect URL is not on the project allowlist, Supabase falls
  // back to delivering the OAuth code or token_hash to the Site URL root.
  // Forward them (along with optional `next`) to /auth/callback so session
  // exchange still completes cleanly.
  const code = typeof resolvedSearchParams.code === "string" ? resolvedSearchParams.code : "";
  const tokenHash =
    typeof resolvedSearchParams.token_hash === "string" ? resolvedSearchParams.token_hash : "";
  const type = typeof resolvedSearchParams.type === "string" ? resolvedSearchParams.type : "";
  const next = typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : "";

  if (code !== "") {
    const params = new URLSearchParams({ code });
    if (next !== "") {
      params.set("next", next);
    }
    redirect(`/auth/callback?${params.toString()}`);
  }

  if (tokenHash !== "") {
    const params = new URLSearchParams({ token_hash: tokenHash });
    if (type !== "") {
      params.set("type", type);
    }
    if (next !== "") {
      params.set("next", next);
    }
    redirect(`/auth/callback?${params.toString()}`);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <LandingPage isAuthenticated={Boolean(user)} />;
}
