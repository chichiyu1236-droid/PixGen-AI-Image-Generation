import { NextResponse } from "next/server";
import { getImageProviderHealth } from "@/lib/openai/provider-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const health = getImageProviderHealth();

  if (!health.ok) {
    return NextResponse.json({ error: "provider_unavailable", ...health }, { status: 503 });
  }

  return NextResponse.json({ status: "ok", ...health });
}
