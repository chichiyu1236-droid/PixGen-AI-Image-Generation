import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getBillingEnv, parseStripePaymentMethods } from "@/lib/billing/env";
import type {
  BillingProvider,
  CallbackVerification,
  CreatePaymentInput,
  CreatePaymentResult,
  QueryOrderInput,
  QueryOrderResult,
} from "@/lib/billing/providers/types";

export const STRIPE_API_VERSION = "2026-09-30.endive";
export const STRIPE_SESSION_ID_REGEX = /^cs_[A-Za-z0-9_]+$/;
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Stripe requires Checkout Session expires_at to be at least 30m from creation; add 1m clock-skew margin. */
export const STRIPE_MIN_TTL_MINUTES = 31;
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export function isValidStripeSessionId(value: string | null | undefined): value is string {
  return typeof value === "string" && STRIPE_SESSION_ID_REGEX.test(value);
}

function normalizeCustomerEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > 320 || !BASIC_EMAIL_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

function stripeBaseConfig() {
  const env = getBillingEnv();
  const secretKey = env.STRIPE_SECRET_KEY.trim();

  if (!secretKey) {
    throw new Error("stripe_provider_not_configured: set STRIPE_SECRET_KEY");
  }

  return {
    env,
    secretKey,
    apiBase: env.STRIPE_API_BASE.replace(/\/$/, ""),
    siteUrl: env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
  };
}

function extractStripeErrorMessage(json: Record<string, unknown> | null): string {
  const errorObj = json?.error;

  if (errorObj && typeof errorObj === "object" && "message" in errorObj && typeof errorObj.message === "string") {
    return errorObj.message;
  }

  return "unknown";
}

/**
 * Verifies a Stripe webhook `Stripe-Signature` header (`t=<unix>,v1=<hex>,...`)
 * against the raw UTF-8 request payload using HMAC-SHA256 and constant-time comparison.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  let timestampStr: string | null = null;
  const v1Signatures: string[] = [];

  for (const part of signatureHeader.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (key === "t") {
      if (!/^\d+$/.test(value)) {
        return false;
      }
      if (timestampStr !== null && timestampStr !== value) {
        return false;
      }
      timestampStr = value;
    } else if (key === "v1" && value) {
      v1Signatures.push(value);
    }
  }

  if (!timestampStr || v1Signatures.length === 0) {
    return false;
  }

  const timestamp = Number(timestampStr);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const expectedHex = createHmac("sha256", webhookSecret).update(`${timestampStr}.${rawBody}`, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  for (const sig of v1Signatures) {
    if (!/^[0-9a-f]{64}$/i.test(sig)) {
      continue;
    }

    const sigBuf = Buffer.from(sig, "hex");
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }

  return false;
}

async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const { env, secretKey, apiBase, siteUrl } = stripeBaseConfig();
  const paymentMethods = parseStripePaymentMethods(env.STRIPE_PAYMENT_METHODS);

  const effectiveTtlMinutes = Math.max(input.ttlMinutes, STRIPE_MIN_TTL_MINUTES);
  const expiresAtSec = Math.floor(Date.now() / 1000) + effectiveTtlMinutes * 60;

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("locale", "zh");
  params.set("client_reference_id", input.orderId);
  params.set("metadata[order_id]", input.orderId);

  const customerEmail = normalizeCustomerEmail(input.customerEmail);
  if (customerEmail) {
    params.set("customer_email", customerEmail);
  }

  params.set("success_url", `${siteUrl}/pay/${input.orderId}?stripe_session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${siteUrl}/pay/${input.orderId}?canceled=1`);
  params.set("expires_at", String(expiresAtSec));
  params.set("line_items[0][price_data][currency]", "cny");
  params.set("line_items[0][price_data][unit_amount]", String(input.amountFen));
  params.set("line_items[0][price_data][product_data][name]", input.body);
  params.set("line_items[0][quantity]", "1");

  paymentMethods.forEach((method, index) => {
    params.set(`allowed_payment_method_types[${index}]`, method);
  });

  if (paymentMethods.includes("wechat_pay")) {
    params.set("payment_method_options[wechat_pay][client]", "web");
  }

  const response = await fetch(`${apiBase}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `checkout_${input.orderId}`,
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: params.toString(),
  });

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !json) {
    throw new Error(`stripe_create_session_failed: HTTP ${response.status} (${extractStripeErrorMessage(json)})`);
  }

  const sessionId = typeof json.id === "string" && json.id ? json.id : null;
  const sessionUrl = typeof json.url === "string" && json.url ? json.url : null;

  if (!sessionId || !sessionUrl) {
    throw new Error("stripe_create_session_no_pay_url");
  }

  return {
    payUrl: sessionUrl,
    redirectUrl: sessionUrl,
    providerTradeNo: sessionId,
    raw: json,
  };
}

async function queryOrder(input: QueryOrderInput): Promise<QueryOrderResult> {
  const { secretKey, apiBase } = stripeBaseConfig();

  const storedTradeNo = input.providerTradeNo?.trim() || null;
  const requestedSessionId = input.stripeSessionId?.trim() || null;
  const sessionId =
    storedTradeNo && requestedSessionId && storedTradeNo !== requestedSessionId
      ? storedTradeNo
      : requestedSessionId || storedTradeNo;

  if (!isValidStripeSessionId(sessionId)) {
    return {
      paid: false,
      providerTradeNo: null,
      raw: { skipped: true, reason: "invalid_or_missing_session_id" },
    };
  }

  const response = await fetch(`${apiBase}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
    },
  });

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !json) {
    throw new Error(`stripe_query_session_failed: HTTP ${response.status} (${extractStripeErrorMessage(json)})`);
  }

  const metadata =
    json.metadata && typeof json.metadata === "object" && !Array.isArray(json.metadata)
      ? (json.metadata as Record<string, unknown>)
      : null;

  const metadataOrderId = typeof metadata?.order_id === "string" ? metadata.order_id : null;
  const clientReferenceId = typeof json.client_reference_id === "string" ? json.client_reference_id : null;
  const paymentStatus = typeof json.payment_status === "string" ? json.payment_status : null;
  const amountTotal = typeof json.amount_total === "number" ? json.amount_total : null;
  const currency = typeof json.currency === "string" ? json.currency.toLowerCase() : null;

  const paid =
    metadataOrderId === input.orderId &&
    clientReferenceId === input.orderId &&
    paymentStatus === "paid" &&
    amountTotal === input.amountFen &&
    currency === "cny";

  const verifiedSessionId = typeof json.id === "string" && json.id ? json.id : sessionId;

  return {
    paid,
    providerTradeNo: paid ? verifiedSessionId : null,
    raw: json,
  };
}

function verifyCallback(_params: Record<string, string>): CallbackVerification {
  // Stripe webhooks use raw-body HMAC verification at POST /api/webhooks/stripe.
  return { valid: false, reason: "bad_signature" };
}

export const stripeProvider: BillingProvider = {
  id: "stripe",
  createPayment,
  queryOrder,
  verifyCallback,
  callbackAck: { success: "ok", failure: "fail" },
};
