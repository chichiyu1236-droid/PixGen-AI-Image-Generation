import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/[provider]/route";
import { getBillingProvider } from "@/lib/billing/provider";
import type { BillingProvider, CallbackVerification } from "@/lib/billing/providers/types";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

type MockOrder = {
  id: string;
  user_id: string;
  credits: number;
  amount_fen: number;
  status: string;
  channel: string;
  provider: string;
};

const state = vi.hoisted(() => ({
  order: null as MockOrder | null,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  updateCalls: [] as Array<{ values: Record<string, unknown>; eqId: string; neqStatus?: string }>,
  verifyCallback: vi.fn<(params: Record<string, string>) => CallbackVerification>(),
}));

vi.mock("@/lib/billing/provider", () => ({
  getBillingProvider: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => ({
            data: state.order && state.order.id === val ? state.order : null,
            error: null,
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (col: string, id: string) => {
          const entry: { values: Record<string, unknown>; eqId: string; neqStatus?: string } = {
            values,
            eqId: col === "id" ? id : "",
          };
          state.updateCalls.push(entry);

          return {
            neq: async (neqCol: string, neqVal: string) => {
              if (neqCol === "status") {
                entry.neqStatus = neqVal;
              }
              return { error: null };
            },
            then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
          };
        },
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return { data: null, error: state.rpcError };
    },
  })),
}));

function makeProvider(id = "mock"): BillingProvider {
  return {
    id,
    createPayment: vi.fn(),
    queryOrder: vi.fn(),
    verifyCallback: state.verifyCallback,
    callbackAck: { success: "success", failure: "fail" },
  };
}

function postWebhook(
  providerParam: string,
  options: { query?: string; body?: string; contentType?: string } = {},
) {
  const url = `http://localhost/api/webhooks/${providerParam}${options.query ? `?${options.query}` : ""}`;
  return POST(
    new Request(url, {
      method: "POST",
      headers: options.contentType ? { "Content-Type": options.contentType } : undefined,
      body: options.body,
    }),
    { params: Promise.resolve({ provider: providerParam }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.order = {
    id: ORDER_ID,
    user_id: "user-1",
    credits: 100,
    amount_fen: 1990,
    status: "pending",
    channel: "wechat",
    provider: "mock",
  };
  state.rpcError = null;
  state.rpcCalls = [];
  state.updateCalls = [];
  state.verifyCallback.mockReturnValue({
    valid: true,
    orderId: ORDER_ID,
    amountFen: 1990,
    providerTradeNo: "trade_001",
  });
  vi.mocked(getBillingProvider).mockReturnValue(makeProvider("mock"));
});

describe("POST /api/webhooks/[provider]", () => {
  it("returns 404 when path provider does not match the active billing provider", async () => {
    const response = await postWebhook("lantu", { body: "out_trade_no=1" });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("unknown_provider");
    expect(state.verifyCallback).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("rejects invalid callbacks with provider failure ack without touching DB", async () => {
    state.verifyCallback.mockReturnValue({ valid: false, reason: "bad_signature" });

    const response = await postWebhook("mock", {
      body: "out_trade_no=abc&sign=bad",
      contentType: "application/x-www-form-urlencoded",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fail");
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("merges query params with form-urlencoded body and fulfills a valid pending order", async () => {
    const response = await postWebhook("mock", {
      query: "source=query&override=old",
      body: `out_trade_no=${ORDER_ID}&total_fee=19.90&override=new`,
      contentType: "application/x-www-form-urlencoded",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("success");
    expect(state.verifyCallback).toHaveBeenCalledWith({
      source: "query",
      override: "new",
      out_trade_no: ORDER_ID,
      total_fee: "19.90",
    });
    expect(state.rpcCalls).toEqual([
      {
        fn: "fulfill_order",
        args: {
          p_order_id: ORDER_ID,
          p_provider_trade_no: "trade_001",
        },
      },
    ]);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].eqId).toBe(ORDER_ID);
    expect(state.updateCalls[0].values).toMatchObject({
      raw_notify: expect.objectContaining({ out_trade_no: ORDER_ID, total_fee: "19.90" }),
      notified_at: expect.any(String),
    });
  });

  it("parses JSON payload bodies and ignores non-primitive JSON values", async () => {
    const response = await postWebhook("mock", {
      body: JSON.stringify({
        out_trade_no: ORDER_ID,
        total_fee: 19.9,
        nested: { ignore: true },
        flag: true,
      }),
      contentType: "application/json",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("success");
    expect(state.verifyCallback).toHaveBeenCalledWith({
      out_trade_no: ORDER_ID,
      total_fee: "19.9",
    });
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("returns failure ack when order does not exist", async () => {
    state.order = null;

    const response = await postWebhook("mock", { body: `out_trade_no=${ORDER_ID}` });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fail");
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("records raw_notify and returns success idempotently for already-paid orders", async () => {
    state.order!.status = "paid";

    const response = await postWebhook("mock", { body: `out_trade_no=${ORDER_ID}` });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("success");
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].values).toHaveProperty("raw_notify");
    expect(state.updateCalls[0].values).toHaveProperty("notified_at");
  });

  it("flags non-paid orders on amount mismatch and acknowledges success to halt retries", async () => {
    state.verifyCallback.mockReturnValue({
      valid: true,
      orderId: ORDER_ID,
      amountFen: 100,
      providerTradeNo: "trade_bad_amt",
    });

    const response = await postWebhook("mock", { body: `out_trade_no=${ORDER_ID}&total_fee=1.00` });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("success");
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].eqId).toBe(ORDER_ID);
    expect(state.updateCalls[0].neqStatus).toBe("paid");
    expect(state.updateCalls[0].values).toMatchObject({
      status: "flagged",
      raw_notify: expect.objectContaining({ out_trade_no: ORDER_ID }),
      notified_at: expect.any(String),
    });
  });

  it("returns 500 with failure ack on transient fulfill_order RPC failure so provider retries", async () => {
    state.rpcError = { message: "deadlock detected" };

    const response = await postWebhook("mock", { body: `out_trade_no=${ORDER_ID}` });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("fail");
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.updateCalls).toHaveLength(0);
  });
});
