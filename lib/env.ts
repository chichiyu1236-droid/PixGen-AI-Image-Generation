import "server-only";

import { z } from "zod";

/** Env booleans arrive as strings; only "true" (or literal true) is truthy. */
const envBoolean = z.preprocess((value) => value === "true" || value === true, z.boolean());

const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image2"),
  IMAGE_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  ALLOW_MOCK_IN_PRODUCTION: envBoolean.default(false),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  ADMIN_EMAILS: z.string().optional().default(""),
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}

/** Resolves the image backend, guarding the mock provider like billing does. */
export function resolveImageProvider(): "openai" | "mock" {
  const env = getServerEnv();

  if (env.IMAGE_PROVIDER === "mock" && process.env.NODE_ENV === "production" && !env.ALLOW_MOCK_IN_PRODUCTION) {
    throw new Error("mock_image_provider_forbidden_in_production");
  }

  return env.IMAGE_PROVIDER;
}
