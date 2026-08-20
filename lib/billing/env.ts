import "server-only";

import { z } from "zod";

const billingEnvSchema = z.object({
  BILLING_PROVIDER: z.enum(["mock", "lantu", "xunhupay"]).default("mock"),
  LANTU_MCH_ID: z.string().default(""),
  LANTU_APP_SECRET: z.string().default(""),
  LANTU_API_BASE: z.string().url().default("https://api.ltzf.cn"),
  XUNHUPAY_APP_ID: z.string().default(""),
  XUNHUPAY_APP_SECRET: z.string().default(""),
  XUNHUPAY_API_BASE: z.string().url().default("https://api.xunhupay.com"),
  MOCK_APP_SECRET: z.string().default("mock-secret"),
  ALLOW_MOCK_IN_PRODUCTION: z.coerce.boolean().default(false),
  ORDER_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

export type BillingEnv = z.infer<typeof billingEnvSchema>;

export function getBillingEnv(): BillingEnv {
  return billingEnvSchema.parse(process.env);
}
