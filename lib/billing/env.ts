import "server-only";

import { z } from "zod";

/** Env booleans arrive as strings; only "true" (or literal true) is truthy. */
const envBoolean = z.preprocess((value) => value === "true" || value === true, z.boolean());

export const ALLOWED_STRIPE_PAYMENT_METHODS = ["card", "alipay", "wechat_pay"] as const;
export type StripePaymentMethod = (typeof ALLOWED_STRIPE_PAYMENT_METHODS)[number];

const ALLOWED_STRIPE_PAYMENT_METHOD_SET = new Set<string>(ALLOWED_STRIPE_PAYMENT_METHODS);

/** Parses, trims, deduplicates, and validates the Stripe payment method allowlist. */
export function parseStripePaymentMethods(raw: string): StripePaymentMethod[] {
  const methods: StripePaymentMethod[] = [];
  const seen = new Set<string>();

  for (const part of raw.split(",")) {
    const trimmed = part.trim().toLowerCase();

    if (!trimmed) {
      continue;
    }

    if (!ALLOWED_STRIPE_PAYMENT_METHOD_SET.has(trimmed)) {
      throw new Error(`stripe_invalid_payment_methods: unsupported method "${trimmed}"`);
    }

    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      methods.push(trimmed as StripePaymentMethod);
    }
  }

  if (methods.length === 0) {
    throw new Error("stripe_invalid_payment_methods: at least one payment method is required");
  }

  return methods;
}

const billingEnvSchema = z.object({
  BILLING_PROVIDER: z.enum(["mock", "lantu", "xunhupay", "stripe"]).default("mock"),
  LANTU_MCH_ID: z.string().default(""),
  LANTU_APP_SECRET: z.string().default(""),
  LANTU_API_BASE: z.string().url().default("https://api.ltzf.cn"),
  XUNHUPAY_APP_ID: z.string().default(""),
  XUNHUPAY_APP_SECRET: z.string().default(""),
  XUNHUPAY_API_BASE: z.string().url().default("https://api.xunhupay.com"),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_API_BASE: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().default("https://api.stripe.com"),
  ),
  STRIPE_PAYMENT_METHODS: z.string().default("card,alipay,wechat_pay"),
  MOCK_APP_SECRET: z.string().default("mock-secret"),
  ALLOW_MOCK_IN_PRODUCTION: envBoolean.default(false),
  ORDER_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

export type BillingEnv = z.infer<typeof billingEnvSchema>;

export function getBillingEnv(): BillingEnv {
  return billingEnvSchema.parse(process.env);
}
