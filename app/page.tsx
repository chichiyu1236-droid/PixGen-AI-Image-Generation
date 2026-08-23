import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  // When the auth redirect URL is not on the project allowlist, Supabase falls
  // back to delivering the OAuth code to the Site URL root. Forward it to the
  // real callback so the PKCE exchange still completes (cookies are domain-wide).
  const code = resolvedSearchParams.code;

  if (typeof code === "string" && code !== "") {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <LandingPage isAuthenticated={Boolean(user)} />;
}
