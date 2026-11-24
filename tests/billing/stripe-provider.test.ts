import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isValidStripeSessionId,
  STRIPE_MIN_TTL_MINUTES,
  stripeProvider,
  verifyStripeWebhookSignature,
} from "@/lib/billing/providers/stripe";

const ORIGINAL_ENV = { ...process.env };
const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function signStripePayload(rawBody: string, secret: string, timestamp: number): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function lastFetchBody(): URLSearchParams {
  const call = vi.mocked(fetch).mock.calls[0];
  return new URLSearchParams(String(call[1]?.body));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_test_123456",
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
    STRIPE_API_BASE: "https://api.stripe.test",
    STRIPE_PAYMENT_METHODS: "card,alipay,wechat_pay",
    NEXT_PUBLIC_SITE_URL: "https://pixgen.example.com/",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "cs_test_session_1",
            url: "https://checkout.stripe.com/c/pay/cs_test_session_1",
          }),
          { status: 200 },
        ),
    ),
  );
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("stripeProvider.createPayment", () => {
  it("creates a CNY Checkout Session with form encoding, wechat_pay web option, 31m minimum TTL, and Idempotency-Key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const nowSec = Math.floor(Date.now() / 1000);

    const result = await stripeProvider.createPayment({
      orderId: ORDER_ID,
      amountFen: 1990,
      body: "标准月卡: 每期 100 张",
      channel: "stripe",
      notifyUrl: "https://pixgen.example.com/api/webhooks/stripe",
      ttlMinutes: 15,
    });

    expect(result).toEqual({
      payUrl: "https://checkout.stripe.com/c/pay/cs_test_session_1",
      redirectUrl: "https://checkout.stripe.com/c/pay/cs_test_session_1",
      providerTradeNo: "cs_test_session_1",
      raw: {
        id: "cs_test_session_1",
        url: "https://checkout.stripe.com/c/pay/cs_test_session_1",
      },
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("https://api.stripe.test/v1/checkout/sessions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer sk_test_123456",
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `checkout_${ORDER_ID}`,
    });

    const body = lastFetchBody();
    expect(body.get("mode")).toBe("payment");
    expect(body.get("locale")).toBe("zh");
    expect(body.get("client_reference_id")).toBe(ORDER_ID);
    expect(body.get("metadata[order_id]")).toBe(ORDER_ID);
    expect(body.get("success_url")).toBe(
      `https://pixgen.example.com/pay/${ORDER_ID}?stripe_session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(body.get("cancel_url")).toBe(`https://pixgen.example.com/pay/${ORDER_ID}?canceled=1`);
    expect(body.get("expires_at")).toBe(String(nowSec + STRIPE_MIN_TTL_MINUTES * 60));
    expect(body.get("line_items[0][price_data][currency]")).toBe("cny");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("1990");
    expect(body.get("line_items[0][price_data][product_data][name]")).toBe("标准月卡: 每期 100 张");
    expect(body.get("line_items[0][quantity]")).toBe("1");
    expect(body.get("payment_method_types[0]")).toBe("card");
    expect(body.get("payment_method_types[1]")).toBe("alipay");
    expect(body.get("payment_method_types[2]")).toBe("wechat_pay");
    expect(body.get("payment_method_options[wechat_pay][client]")).toBe("web");
  });

  it("omits wechat_pay client option when wechat_pay is excluded and preserves ttlMinutes > 31", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const nowSec = Math.floor(Date.now() / 1000);
    process.env.STRIPE_PAYMENT_METHODS = " card , ALIPAY , card ";

    await stripeProvider.createPayment({
      orderId: ORDER_ID,
      amountFen: 4990,
      body: "Pro 月卡",
      channel: "stripe",
      notifyUrl: "https://pixgen.example.com/api/webhooks/stripe",
      ttlMinutes: 60,
    });

    const body = lastFetchBody();
    expect(body.get("payment_method_types[0]")).toBe("card");
    expect(body.get("payment_method_types[1]")).toBe("alipay");
    expect(body.get("payment_method_types[2]")).toBeNull();
    expect(body.get("payment_method_options[wechat_pay][client]")).toBeNull();
    expect(body.get("expires_at")).toBe(String(nowSec + 60 * 60));
  });

  it("throws stripe_provider_not_configured when STRIPE_SECRET_KEY is missing", async () => {
    process.env.STRIPE_SECRET_KEY = "   ";

    await expect(
      stripeProvider.createPayment({
        orderId: ORDER_ID,
        amountFen: 1990,
        body: "标准月卡",
        channel: "stripe",
        notifyUrl: "https://pixgen.example.com/api/webhooks/stripe",
        ttlMinutes: 15,
      }),
    ).rejects.toThrow("stripe_provider_not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws stripe_invalid_payment_methods when STRIPE_PAYMENT_METHODS is invalid or empty", async () => {
    process.env.STRIPE_PAYMENT_METHODS = "card,crypto";

    await expect(
      stripeProvider.createPayment({
        orderId: ORDER_ID,
        amountFen: 1990,
        body: "标准月卡",
        channel: "stripe",
        notifyUrl: "https://pixgen.example.com/api/webhooks/stripe",
        ttlMinutes: 15,
      }),
    ).rejects.toThrow("stripe_invalid_payment_methods");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws descriptive errors on Stripe HTTP failure or missing session url", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Invalid expires_at" } }), { status: 400 }),
    );

    await expect(
      stripeProvider.createPayment({
        orderId: ORDER_ID,
        amountFen: 1990,
        body: "标准月卡",
        channel: "stripe",
        notifyUrl: "https://pixgen.example.com/api/webhooks/stripe",
        ttlMinutes: 15,
      }),
    ).rejects.toThrow("stripe_create_session_failed: HTTP 400 (Invalid expires_at)");

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: "cs_test_no_url" }), { status: 200 }));

    await expect(
      stripeProvider.createPayment({
        orderId: ORDER_ID,
        amountFen: 1990,
        body: "标准月卡",
        channel: "stripe",
        notifyUrl: "https://pixgen.example.com/api/webhooks/stripe",
        ttlMinutes: 15,
      }),
    ).rejects.toThrow("stripe_create_session_no_pay_url");
  });
});

describe("stripeProvider.queryOrder", () => {
  const validSessionPayload = {
    id: "cs_test_paid_123",
    payment_status: "paid",
    amount_total: 1990,
    currency: "cny",
    client_reference_id: ORDER_ID,
    metadata: { order_id: ORDER_ID },
  };

  it("returns paid=true only when orderId, client_reference_id, payment_status, amount, and cny currency all match", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(validSessionPayload), { status: 200 }));

    const result = await stripeProvider.queryOrder({
      orderId: ORDER_ID,
      amountFen: 1990,
      channel: "stripe",
      providerTradeNo: "cs_test_paid_123",
      stripeSessionId: "cs_test_paid_123",
    });

    expect(result.paid).toBe(true);
    expect(result.providerTradeNo).toBe("cs_test_paid_123");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "https://api.stripe.test/v1/checkout/sessions/cs_test_paid_123",
    );
  });

  it("rejects mismatched metadata order_id, client_reference_id, amount, currency, or unpaid status", async () => {
    const cases = [
      { ...validSessionPayload, payment_status: "unpaid" },
      { ...validSessionPayload, metadata: { order_id: "22222222-2222-4222-8222-222222222222" } },
      { ...validSessionPayload, client_reference_id: "22222222-2222-4222-8222-222222222222" },
      { ...validSessionPayload, amount_total: 100 },
      { ...validSessionPayload, currency: "usd" },
    ];

    for (const payload of cases) {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
      const result = await stripeProvider.queryOrder({
        orderId: ORDER_ID,
        amountFen: 1990,
        channel: "stripe",
        providerTradeNo: "cs_test_paid_123",
      });

      expect(result.paid).toBe(false);
      expect(result.providerTradeNo).toBeNull();
    }
  });

  it("skips network requests when session id is missing or fails strict regex (prevents path traversal)", async () => {
    for (const badSessionId of [null, "", "../customers", "cs_test/../../secret", "pi_123456", "cs_bad?x=1"]) {
      const result = await stripeProvider.queryOrder({
        orderId: ORDER_ID,
        amountFen: 1990,
        channel: "stripe",
        providerTradeNo: null,
        stripeSessionId: badSessionId,
      });

      expect(result.paid).toBe(false);
      expect(result.providerTradeNo).toBeNull();
    }

    expect(fetch).not.toHaveBeenCalled();
    expect(isValidStripeSessionId("cs_test_a1B2_3")).toBe(true);
    expect(isValidStripeSessionId("cs_test/evil")).toBe(false);
  });

  it("prefers stored providerTradeNo when stripeSessionId conflicts with it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(validSessionPayload), { status: 200 }));

    await stripeProvider.queryOrder({
      orderId: ORDER_ID,
      amountFen: 1990,
      channel: "stripe",
      providerTradeNo: "cs_test_paid_123",
      stripeSessionId: "cs_test_other_999",
    });

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "https://api.stripe.test/v1/checkout/sessions/cs_test_paid_123",
    );
  });

  it("throws when Stripe session lookup returns non-2xx", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "No such checkout.session" } }), { status: 404 }),
    );

    await expect(
      stripeProvider.queryOrder({
        orderId: ORDER_ID,
        amountFen: 1990,
        channel: "stripe",
        providerTradeNo: "cs_test_missing",
      }),
    ).rejects.toThrow("stripe_query_session_failed: HTTP 404");
  });
});

describe("verifyStripeWebhookSignature and verifyCallback", () => {
  const secret = "whsec_unit_test_secret";
  const rawBody = '{"id":"evt_1","type":"checkout.session.completed"}';
  const now = 1_750_000_000;

  it("accepts a valid signature within the 300s replay window", () => {
    const header = signStripePayload(rawBody, secret, now - 120);
    expect(verifyStripeWebhookSignature(rawBody, header, secret, now)).toBe(true);
  });

  it("supports multiple v1 signatures for webhook secret rotation", () => {
    const validSig = createHmac("sha256", secret).update(`${now}.${rawBody}`, "utf8").digest("hex");
    const fakeSig = "a".repeat(64);
    const header = `t=${now},v1=${fakeSig},v1=${validSig}`;

    expect(verifyStripeWebhookSignature(rawBody, header, secret, now)).toBe(true);
  });

  it("rejects timestamps outside +-300s window, tampered bodies, and wrong secrets", () => {
    expect(verifyStripeWebhookSignature(rawBody, signStripePayload(rawBody, secret, now - 301), secret, now)).toBe(
      false,
    );
    expect(verifyStripeWebhookSignature(rawBody, signStripePayload(rawBody, secret, now + 301), secret, now)).toBe(
      false,
    );
    expect(
      verifyStripeWebhookSignature(`${rawBody} `, signStripePayload(rawBody, secret, now), secret, now),
    ).toBe(false);
    expect(verifyStripeWebhookSignature(rawBody, signStripePayload(rawBody, "wrong_secret", now), secret, now)).toBe(
      false,
    );
  });

  it("returns false without throwing RangeError on malformed, short, or non-hex v1 signatures", () => {
    expect(verifyStripeWebhookSignature(rawBody, null, secret, now)).toBe(false);
    expect(verifyStripeWebhookSignature(rawBody, "", secret, now)).toBe(false);
    expect(verifyStripeWebhookSignature(rawBody, `t=${now},v1=short`, secret, now)).toBe(false);
    expect(verifyStripeWebhookSignature(rawBody, `t=${now},v1=${"z".repeat(64)}`, secret, now)).toBe(false);
    expect(verifyStripeWebhookSignature(rawBody, `t=notanumber,v1=${"a".repeat(64)}`, secret, now)).toBe(false);
    expect(
      verifyStripeWebhookSignature(rawBody, `t=${now},t=${now - 1},v1=${"a".repeat(64)}`, secret, now),
    ).toBe(false);
  });

  it("returns bad_signature from legacy verifyCallback adapter", () => {
    expect(stripeProvider.verifyCallback({})).toEqual({ valid: false, reason: "bad_signature" });
  });
});
