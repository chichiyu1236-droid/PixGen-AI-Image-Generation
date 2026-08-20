import "server-only";

import { getBillingEnv } from "@/lib/billing/env";
import { fenToYuanString, yuanStringToFen } from "@/lib/billing/money";
import { signParams } from "@/lib/billing/providers/signature";
import type { BillingProvider, CallbackVerification, CreatePaymentInput, CreatePaymentResult, PayChannel, QueryOrderInput, QueryOrderResult } from "@/lib/billing/providers/types";

// Fields the Lantu callback signs; extra fields (attach, pay_channel, ...) do
// not participate, so verify against exactly these.
const CALLBACK_SIGN_FIELDS = ["code", "timestamp", "mch_id", "order_no", "out_trade_no", "pay_no", "total_fee"] as const;

function lantuConfig() {
  const env = getBillingEnv();

  if (!env.LANTU_MCH_ID || !env.LANTU_APP_SECRET) {
    throw new Error("lantu_provider_not_configured: set LANTU_MCH_ID and LANTU_APP_SECRET");
  }

  return { env, mchId: env.LANTU_MCH_ID, secret: env.LANTU_APP_SECRET };
}

function channelPath(channel: PayChannel): string {
  return channel === "wechat" ? "wxpay" : "alipay";
}

async function postForm(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!json) {
    throw new Error(`lantu_invalid_response: HTTP ${response.status}`);
  }

  return json;
}

async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const { env, mchId, secret } = lantuConfig();

  // Only required fields participate in the signature; time_expire is optional.
  const signedParams = {
    mch_id: mchId,
    out_trade_no: input.orderId,
    total_fee: fenToYuanString(input.amountFen),
    body: input.body,
    timestamp: String(Math.floor(Date.now() / 1000)),
    notify_url: input.notifyUrl,
  };
  const sign = signParams(signedParams, secret);

  const json = await postForm(`${env.LANTU_API_BASE}/api/${channelPath(input.channel)}/native`, {
    ...signedParams,
    time_expire: `${input.ttlMinutes}m`,
    sign,
  });

  if (json.code !== 0) {
    throw new Error(`lantu_create_order_failed: ${String(json.msg ?? "unknown")} (request_id: ${String(json.request_id ?? "n/a")})`);
  }

  const data = (json.data ?? {}) as Record<string, unknown>;
  const payUrl = [data.code_url, data.qr_code, data.QRcode_url].find((value): value is string => typeof value === "string" && value !== "");

  if (!payUrl) {
    throw new Error(`lantu_create_order_no_pay_url (request_id: ${String(json.request_id ?? "n/a")})`);
  }

  return { payUrl, providerTradeNo: null, raw: json };
}

async function queryOrder(input: QueryOrderInput): Promise<QueryOrderResult> {
  const { env, mchId, secret } = lantuConfig();

  const signedParams = {
    mch_id: mchId,
    out_trade_no: input.orderId,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };

  const json = await postForm(`${env.LANTU_API_BASE}/api/${channelPath(input.channel)}/get_pay_order`, {
    ...signedParams,
    sign: signParams(signedParams, secret),
  });

  if (json.code !== 0) {
    throw new Error(`lantu_query_order_failed: ${String(json.msg ?? "unknown")} (request_id: ${String(json.request_id ?? "n/a")})`);
  }

  const data = (json.data ?? {}) as Record<string, unknown>;
  const providerTradeNo = [data.pay_no, data.order_no].find((value): value is string => typeof value === "string" && value !== "") ?? null;

  return { paid: String(data.pay_status) === "1", providerTradeNo, raw: json };
}

function verifyCallback(params: Record<string, string>): CallbackVerification {
  const { secret } = lantuConfig();

  const signSource: Record<string, string> = {};
  for (const field of CALLBACK_SIGN_FIELDS) {
    const value = params[field];

    if (value !== undefined && value !== "") {
      signSource[field] = value;
    }
  }

  // Only CALLBACK_SIGN_FIELDS participate in the Lantu signature; compare
  // directly rather than using verifySignature (which expects the sign field
  // inside the same object).
  const expectedSign = signParams(signSource, secret);

  if (!params.sign || expectedSign !== params.sign.toUpperCase()) {
    return { valid: false, reason: "bad_signature" };
  }

  if (params.code !== "0") {
    return { valid: false, reason: "not_success_code" };
  }

  if (!params.out_trade_no) {
    return { valid: false, reason: "missing_out_trade_no" };
  }

  try {
    return {
      valid: true,
      orderId: params.out_trade_no,
      providerTradeNo: params.order_no || params.pay_no || null,
      amountFen: yuanStringToFen(params.total_fee),
    };
  } catch {
    return { valid: false, reason: "invalid_amount" };
  }
}

export const lantuProvider: BillingProvider = {
  id: "lantu",
  createPayment,
  queryOrder,
  verifyCallback,
  callbackAck: { success: "SUCCESS", failure: "FAIL" },
};
