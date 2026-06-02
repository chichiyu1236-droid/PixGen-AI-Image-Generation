import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseServerFetch } from "@/lib/supabase/fetch";
import type { SetAllCookies } from "@supabase/ssr";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: supabaseServerFetch,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components cannot always set cookies; route handlers can.
          }
        },
      },
    },
  );
}
