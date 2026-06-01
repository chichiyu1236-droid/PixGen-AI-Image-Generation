import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image2"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}
