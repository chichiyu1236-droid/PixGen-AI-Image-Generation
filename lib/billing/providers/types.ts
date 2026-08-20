export type PayChannel = "wechat" | "alipay";

export interface CreatePaymentInput {
  orderId: string;
  amountFen: number;
  body: string;
  channel: PayChannel;
  notifyUrl: string;
  ttlMinutes: number;
}

export interface CreatePaymentResult {
  payUrl: string;
  providerTradeNo: string | null;
  raw: unknown;
}

export interface QueryOrderInput {
  orderId: string;
  amountFen: number;
  channel: PayChannel;
}

export interface QueryOrderResult {
  paid: boolean;
  providerTradeNo: string | null;
  raw: unknown;
}

export type CallbackVerification =
  | {
      valid: true;
      orderId: string;
      providerTradeNo: string | null;
      amountFen: number;
    }
  | {
      valid: false;
      reason: "bad_signature" | "not_success_code" | "missing_out_trade_no" | "invalid_amount";
    };

export interface BillingProvider {
  id: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  queryOrder(input: QueryOrderInput): Promise<QueryOrderResult>;
  verifyCallback(params: Record<string, string>): CallbackVerification;
  callbackAck: {
    success: string;
    failure: string;
  };
}
