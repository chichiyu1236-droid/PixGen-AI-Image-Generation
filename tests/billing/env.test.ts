import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBillingEnv, parseStripePaymentMethods } from "@/lib/billing/env";
import { getBillingProvider, getBillingProviderById } from "@/lib/billing/provider";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.BILLING_PROVIDER;
  delete process.env.ALLOW_MOCK_IN_PRODUCTION;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_API_BASE;
  delete process.env.STRIPE_PAYMENT_METHODS;
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...ORIGINAL_ENV };
});

describe("billing env boolean parsing and production mock guard", () => {
  it('parses ALLOW_MOCK_IN_PRODUCTION="false" as false (not truthy string)', () => {
    process.env.ALLOW_MOCK_IN_PRODUCTION = "false";

    expect(getBillingEnv().ALLOW_MOCK_IN_PRODUCTION).toBe(false);
  });

  it("parses empty, undefined, and non-true strings as false and only literal true as true", () => {
    expect(getBillingEnv().ALLOW_MOCK_IN_PRODUCTION).toBe(false);

    process.env.ALLOW_MOCK_IN_PRODUCTION = "";
    expect(getBillingEnv().ALLOW_MOCK_IN_PRODUCTION).toBe(false);

    process.env.ALLOW_MOCK_IN_PRODUCTION = "1";
    expect(getBillingEnv().ALLOW_MOCK_IN_PRODUCTION).toBe(false);

    process.env.ALLOW_MOCK_IN_PRODUCTION = "yes";
    expect(getBillingEnv().ALLOW_MOCK_IN_PRODUCTION).toBe(false);

    process.env.ALLOW_MOCK_IN_PRODUCTION = "true";
    expect(getBillingEnv().ALLOW_MOCK_IN_PRODUCTION).toBe(true);
  });

  it('forbids mock billing provider in production when ALLOW_MOCK_IN_PRODUCTION="false"', () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.BILLING_PROVIDER = "mock";
    process.env.ALLOW_MOCK_IN_PRODUCTION = "false";

    expect(() => getBillingProvider()).toThrow("mock_billing_provider_forbidden_in_production");
    expect(() => getBillingProviderById("mock")).toThrow("mock_billing_provider_forbidden_in_production");
  });

  it('allows mock billing provider in production only when ALLOW_MOCK_IN_PRODUCTION="true"', () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.BILLING_PROVIDER = "mock";
    process.env.ALLOW_MOCK_IN_PRODUCTION = "true";

    expect(getBillingProvider().id).toBe("mock");
    expect(getBillingProviderById("mock")?.id).toBe("mock");
  });
});

describe("Stripe billing env config and provider lookup", () => {
  it("supports BILLING_PROVIDER=stripe with expected defaults and empty STRIPE_API_BASE fallback", () => {
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_API_BASE = "   ";

    const env = getBillingEnv();
    expect(env.BILLING_PROVIDER).toBe("stripe");
    expect(env.STRIPE_API_BASE).toBe("https://api.stripe.com");
    expect(env.STRIPE_PAYMENT_METHODS).toBe("card,alipay,wechat_pay");
    expect(env.STRIPE_SECRET_KEY).toBe("");
    expect(env.STRIPE_WEBHOOK_SECRET).toBe("");
    expect(getBillingProvider().id).toBe("stripe");
  });

  it("looks up registered providers by id and returns undefined for unknown or prototype keys", () => {
    expect(getBillingProviderById("stripe")?.id).toBe("stripe");
    expect(getBillingProviderById("lantu")?.id).toBe("lantu");
    expect(getBillingProviderById("xunhupay")?.id).toBe("xunhupay");
    expect(getBillingProviderById("unknown")).toBeUndefined();
    expect(getBillingProviderById("toString")).toBeUndefined();
  });

  it("trims, lowercases, and deduplicates STRIPE_PAYMENT_METHODS allowlist", () => {
    expect(parseStripePaymentMethods(" card , ALIPAY , card , wechat_pay , ")).toEqual([
      "card",
      "alipay",
      "wechat_pay",
    ]);
    expect(parseStripePaymentMethods("alipay")).toEqual(["alipay"]);
  });

  it("throws stripe_invalid_payment_methods for empty or unsupported payment methods", () => {
    expect(() => parseStripePaymentMethods("")).toThrow("stripe_invalid_payment_methods");
    expect(() => parseStripePaymentMethods(" , , ")).toThrow("stripe_invalid_payment_methods");
    expect(() => parseStripePaymentMethods("card,paypal")).toThrow("stripe_invalid_payment_methods");
  });
});
