import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/orders/[id]/route";
import type { BillingProvider, QueryOrderInput, QueryOrderResult } from "@/lib/billing/providers/types";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

type MockOrderRow = {
  id: string;
  user_id: string;
  pack_id: string;
  credits: number;
  amount_fen: number;
  status: "pending" | "paid" | "expired" | "failed" | "flagged";
  channel: "wechat" | "alipay";
  provider: string;
  provider_trade_no: string | null;
  pay_url: string | null;
  last_checked_at: string | null;
  expires_at: string;
  created_at: string;
};

const state = vi.hoisted(() => ({
  user: { id: "user-1", email: "user@example.com" } as { id: string; email: string } | null,
  order: null as MockOrderRow | null,
  refreshedOrder: null as MockOrderRow | null,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  updateCalls: [] as Array<Record<string, unknown>>,
}));

const providerMocks = vi.hoisted(() => ({
  stripeQueryOrder: vi.fn<(input: QueryOrderInput) => Promise<QueryOrderResult>>(),
  lantuQueryOrder: vi.fn<(input: QueryOrderInput) => Promise<QueryOrderResult>>(),
  getBillingProviderById: vi.fn<(providerId: string) => BillingProvider | undefined>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.order, error: null }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/billing/provider", () => ({
  getBillingProviderById: (providerId: string) => providerMocks.getBillingProviderById(providerId),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: state.refreshedOrder ?? state.order, error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        state.updateCalls.push(values);
        const eqChain = {
          eq: () => eqChain,
          select: () => ({
            single: async () => ({
              data: state.order ? { ...state.order, ...values } : null,
              error: null,
            }),
          }),
          then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
        };
        return eqChain;
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (state.order && fn === "fulfill_order") {
        state.refreshedOrder = {
          ...state.order,
          status: "paid",
          provider_trade_no: String(args.p_provider_trade_no || state.order.provider_trade_no || ""),
        };
      }
      return { data: null, error: null };
    },
  })),
}));

function makeOrder(overrides: Partial<MockOrderRow> = {}): MockOrderRow {
  const now = Date.now();
  return {
    id: ORDER_ID,
    user_id: "user-1",
    pack_id: "std-month",
    credits: 100,
    amount_fen: 1990,
    status: "pending",
    channel: "wechat",
    provider: "stripe",
    provider_trade_no: "cs_test_stored_1",
    pay_url: "https://checkout.stripe.com/c/pay/cs_test_stored_1",
    last_checked_at: null,
    expires_at: new Date(now + 30 * 60 * 1000).toISOString(),
    created_at: new Date(now - 5 * 1000).toISOString(),
    ...overrides,
  };
}

function getOrder(id = ORDER_ID, query = "") {
  return GET(new Request(`http://localhost/api/orders/${id}${query}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "user-1", email: "user@example.com" };
  state.order = makeOrder();
  state.refreshedOrder = null;
  state.rpcCalls = [];
  state.updateCalls = [];

  providerMocks.stripeQueryOrder.mockResolvedValue({
    paid: true,
    providerTradeNo: "cs_test_stored_1",
    raw: {},
  });
  providerMocks.lantuQueryOrder.mockResolvedValue({
    paid: false,
    providerTradeNo: null,
    raw: {},
  });
  providerMocks.getBillingProviderById.mockImplementation((providerId: string) => {
    if (providerId === "stripe") {
      return {
        id: "stripe",
        queryOrder: providerMocks.stripeQueryOrder,
      } as unknown as BillingProvider;
    }
    if (providerId === "lantu") {
      return {
        id: "lantu",
        queryOrder: providerMocks.lantuQueryOrder,
      } as unknown as BillingProvider;
    }
    return undefined;
  });
});

describe("GET /api/orders/[id]", () => {
  it("validates order id format, authentication, and ownership via RLS", async () => {
    const badIdRes = await getOrder("not-a-uuid");
    expect(badIdRes.status).toBe(400);

    state.user = null;
    const unauthRes = await getOrder();
    expect(unauthRes.status).toBe(401);

    state.user = { id: "user-2", email: "other@example.com" };
    state.order = null;
    const missingRes = await getOrder();
    expect(missingRes.status).toBe(404);
  });

  it("includes provider in response and skips reconcile for fresh pending order without stripe_session_id", async () => {
    const response = await getOrder();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order).toMatchObject({
      id: ORDER_ID,
      status: "pending",
      provider: "stripe",
      amountFen: 1990,
    });
    expect(providerMocks.stripeQueryOrder).not.toHaveBeenCalled();
  });

  it("immediately reconciles and fulfills a fresh Stripe order when matching ?stripe_session_id is provided", async () => {
    const response = await getOrder(ORDER_ID, "?stripe_session_id=cs_test_stored_1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order.status).toBe("paid");
    expect(providerMocks.getBillingProviderById).toHaveBeenCalledWith("stripe");
    expect(providerMocks.stripeQueryOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        amountFen: 1990,
        providerTradeNo: "cs_test_stored_1",
        stripeSessionId: "cs_test_stored_1",
      }),
    );
    expect(state.rpcCalls).toEqual([
      {
        fn: "fulfill_order",
        args: {
          p_order_id: ORDER_ID,
          p_provider_trade_no: "cs_test_stored_1",
        },
      },
    ]);
    expect(state.updateCalls.some((u) => "last_checked_at" in u)).toBe(true);
  });

  it("recovers and fulfills a Stripe order that expired right before redirect back", async () => {
    state.order = makeOrder({
      status: "pending",
      expires_at: new Date(Date.now() - 2000).toISOString(),
    });

    const response = await getOrder(ORDER_ID, "?stripe_session_id=cs_test_stored_1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order.status).toBe("paid");
    expect(providerMocks.stripeQueryOrder).toHaveBeenCalledTimes(1);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("throttles repeated immediate Stripe return lookups within 3 seconds", async () => {
    state.order = makeOrder({
      last_checked_at: new Date(Date.now() - 1000).toISOString(),
    });

    const response = await getOrder(ORDER_ID, "?stripe_session_id=cs_test_stored_1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order.status).toBe("pending");
    expect(providerMocks.stripeQueryOrder).not.toHaveBeenCalled();
  });

  it("ignores malformed or mismatched ?stripe_session_id and never skips the 30s wait", async () => {
    for (const query of ["?stripe_session_id=../evil", "?stripe_session_id=cs_test_other_999"]) {
      const response = await getOrder(ORDER_ID, query);
      expect(response.status).toBe(200);
    }

    expect(providerMocks.stripeQueryOrder).not.toHaveBeenCalled();
  });

  it("uses only stored provider_trade_no during scheduled >30s reconcile when query stripe_session_id mismatches", async () => {
    state.order = makeOrder({
      created_at: new Date(Date.now() - 45 * 1000).toISOString(),
    });

    const response = await getOrder(ORDER_ID, "?stripe_session_id=cs_test_other_999");

    expect(response.status).toBe(200);
    expect(providerMocks.stripeQueryOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTradeNo: "cs_test_stored_1",
        stripeSessionId: null,
      }),
    );
  });

  it("does not allow ?stripe_session_id to bypass 30s wait for non-Stripe orders and resolves provider by order.provider", async () => {
    state.order = makeOrder({
      provider: "lantu",
      provider_trade_no: null,
      created_at: new Date(Date.now() - 5 * 1000).toISOString(),
    });

    await getOrder(ORDER_ID, "?stripe_session_id=cs_test_123");
    expect(providerMocks.lantuQueryOrder).not.toHaveBeenCalled();

    state.order = makeOrder({
      provider: "lantu",
      provider_trade_no: null,
      created_at: new Date(Date.now() - 45 * 1000).toISOString(),
    });

    await getOrder(ORDER_ID, "?stripe_session_id=cs_test_123");
    expect(providerMocks.getBillingProviderById).toHaveBeenCalledWith("lantu");
    expect(providerMocks.lantuQueryOrder).toHaveBeenCalledTimes(1);
  });

  it("handles production mock guard throw from getBillingProviderById without crashing the endpoint", async () => {
    state.order = makeOrder({
      provider: "mock",
      created_at: new Date(Date.now() - 45 * 1000).toISOString(),
    });
    providerMocks.getBillingProviderById.mockImplementationOnce(() => {
      throw new Error("mock_billing_provider_forbidden_in_production");
    });

    const response = await getOrder();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order.provider).toBe("mock");
    expect(state.rpcCalls).toHaveLength(0);
  });
});
