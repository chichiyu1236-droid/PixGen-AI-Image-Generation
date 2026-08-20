import "server-only";

import { getBillingEnv } from "@/lib/billing/env";
import { fenToYuanString, yuanStringToFen } from "@/lib/billing/money";
import { signParams } from "@/lib/billing/providers/signature";
import type { BillingProvider, CallbackVerification, CreatePaymentInput, CreatePaymentResult, QueryOrderInput, QueryOrderResult } from "@/lib/billing/providers/types";

const CALLBACK_SIGN_FIELDS = ["trade_order_id", "total_fee", "transaction_id", "open_order_id", "order_title", "status", "plugins", "attach", "appid", "time", "nonce_str"] as const;

function xunhupayConfig() {
  const env = getBillingEnv();

  if (!env.XUNHUPAY_APP_ID || !env.XUNHUPAY_APP_SECRET) {
    throw new Error("xunhupay_provider_not_configured: set XUNHUPAY_APP_ID and XUNHUPAY_APP_SECRET");
  }

  return { appId: env.XUNHUPAY_APP_ID, secret: env.XUNHUPAY_APP_SECRET, apiBase: env.XUNHUPAY_API_BASE };
}

function generateNonce(): string {
  return Math.random().toString(36).slice(2, 18);
}

async function postJson(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!json) {
    throw new Error(`xunhupay_invalid_response: HTTP ${response.status}`);
  }

  return json;
}

async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const { appId, secret, apiBase } = xunhupayConfig();

  const params: Record<string, string> = {
    version: "1.1",
    appid: appId,
    trade_order_id: input.orderId,
    total_fee: fenToYuanString(input.amountFen),
    title: input.body.slice(0, 127),
    time: String(Math.floor(Date.now() / 1000)),
    notify_url: input.notifyUrl,
    return_url: input.notifyUrl.replace(/\/api\/webhooks\/.*/, "/upgrade"),
    nonce_str: generateNonce(),
  };

  const hash = signParams(params, secret);

  const json = await postJson(`${apiBase}/payment/do.html`, { ...params, hash });

  if (json.errcode !== 0) {
    throw new Error(`xunhupay_create_order_failed: ${String(json.errmsg ?? "unknown")}`);
  }

  // url is the mobile redirect URL; url_qrcode is the PC QR code URL
  const payUrl = (json.url_qrcode as string) || (json.url as string);

  if (!payUrl) {
    throw new Error("xunhupay_create_order_no_pay_url");
  }

  return { payUrl, providerTradeNo: String(json.openid ?? ""), raw: json };
}

async function queryOrder(input: QueryOrderInput): Promise<QueryOrderResult> {
  const { appId, secret, apiBase } = xunhupayConfig();

  const params: Record<string, string> = {
    appid: appId,
    out_trade_order: input.orderId,
    time: String(Math.floor(Date.now() / 1000)),
    nonce_str: generateNonce(),
  };

  const hash = signParams(params, secret);

  const json = await postJson(`${apiBase}/payment/query.html`, { ...params, hash });

  if (json.errcode !== 0) {
    throw new Error(`xunhupay_query_order_failed: ${String(json.errmsg ?? "unknown")}`);
  }

  const data = (json.data ?? {}) as Record<string, unknown>;

  return {
    paid: String(data.status) === "OD",
    providerTradeNo: String(data.open_order_id ?? ""),
    raw: json,
  };
}

function verifyCallback(params: Record<string, string>): CallbackVerification {
  const { secret } = xunhupayConfig();

  const signSource: Record<string, string> = {};
  for (const field of CALLBACK_SIGN_FIELDS) {
    const value = params[field];

    if (value !== undefined && value !== "") {
      signSource[field] = value;
    }
  }

  // Xunhupay uses MD5 lowercase; signParams produces uppercase, so compare lowercase.
  const expectedSign = signParams(signSource, secret).toLowerCase();

  if (!params.hash || expectedSign !== params.hash.toLowerCase()) {
    return { valid: false, reason: "bad_signature" };
  }

  // status "OD" = paid
  if (params.status !== "OD") {
    return { valid: false, reason: "not_success_code" };
  }

  if (!params.trade_order_id) {
    return { valid: false, reason: "missing_out_trade_no" };
  }

  try {
    return {
      valid: true,
      orderId: params.trade_order_id,
      providerTradeNo: params.transaction_id || params.open_order_id || null,
      amountFen: yuanStringToFen(params.total_fee),
    };
  } catch {
    return { valid: false, reason: "invalid_amount" };
  }
}

/** Builds a correctly signed payment-success callback for tests and local play. */
export function buildXunhupayCallbackParams(input: { orderId: string; amountFen: number }): Record<string, string> {
  const { secret } = xunhupayConfig();

  const params: Record<string, string> = {
    trade_order_id: input.orderId,
    total_fee: fenToYuanString(input.amountFen),
    transaction_id: `xhpay-${input.orderId}`,
    open_order_id: `xh-open-${input.orderId}`,
    order_title: "积分包购买",
    status: "OD",
    appid: xunhupayConfig().appId,
    time: String(Math.floor(Date.now() / 1000)),
    nonce_str: generateNonce(),
  };

  return { ...params, hash: signParams(params, secret).toLowerCase() };
}

export const xunhupayProvider: BillingProvider = {
  id: "xunhupay",
  createPayment,
  queryOrder,
  verifyCallback,
  callbackAck: { success: "success", failure: "fail" },
};
