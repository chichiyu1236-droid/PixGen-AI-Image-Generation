import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { supabaseServerFetch } from "@/lib/supabase/fetch";
import type { Database } from "@/types/database";

export function createSupabaseAdminClient() {
  const env = getServerEnv();

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      fetch: supabaseServerFetch,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
