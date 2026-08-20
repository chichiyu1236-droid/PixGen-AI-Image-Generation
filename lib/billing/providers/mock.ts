import "server-only";

import { getBillingEnv } from "@/lib/billing/env";
import { fenToYuanString, yuanStringToFen } from "@/lib/billing/money";
import { signParams, verifySignature } from "@/lib/billing/providers/signature";
import type { BillingProvider, CallbackVerification, CreatePaymentInput, CreatePaymentResult, QueryOrderInput, QueryOrderResult } from "@/lib/billing/providers/types";

function mockSecret(): string {
  return getBillingEnv().MOCK_APP_SECRET;
}

async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  return {
    payUrl: `mock://pay/${input.channel}/${input.orderId}`,
    providerTradeNo: null,
    raw: { provider: "mock", orderId: input.orderId, channel: input.channel },
  };
}

async function queryOrder(_input: QueryOrderInput): Promise<QueryOrderResult> {
  // The mock provider has no external state; simulated payment arrives through
  // the webhook route, exactly like a real provider.
  return { paid: false, providerTradeNo: null, raw: { provider: "mock", note: "no external state" } };
}

function verifyCallback(params: Record<string, string>): CallbackVerification {
  if (!verifySignature(params, mockSecret())) {
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

/** Builds a correctly signed payment-success callback for tests and local play. */
export function buildMockCallbackParams(input: { orderId: string; amountFen: number; providerTradeNo?: string }): Record<string, string> {
  const params: Record<string, string> = {
    code: "0",
    timestamp: String(Math.floor(Date.now() / 1000)),
    mch_id: "mock-mch",
    order_no: input.providerTradeNo ?? `mock-order-${input.orderId}`,
    out_trade_no: input.orderId,
    pay_no: `mock-pay-${input.orderId}`,
    total_fee: fenToYuanString(input.amountFen),
  };

  return { ...params, sign: signParams(params, mockSecret()) };
}

export const mockProvider: BillingProvider = {
  id: "mock",
  createPayment,
  queryOrder,
  verifyCallback,
  callbackAck: { success: "success", failure: "fail" },
};
