import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listAdminOrders } from "@/app/api/admin/orders/route";
import { POST as fulfillAdminOrder } from "@/app/api/admin/orders/[id]/fulfill/route";
import { POST as queryAdminOrder } from "@/app/api/admin/orders/[id]/query/route";
import { isAdminEmail } from "@/lib/admin/access";
import { getBillingProvider } from "@/lib/billing/provider";
import type { BillingProvider } from "@/lib/billing/providers/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

type MockAdminOrder = {
  id: string;
  user_id: string;
  pack_id: string;
  credits: number;
  amount_fen: number;
  status: string;
  channel: "wechat" | "alipay" | "stripe";
  provider: string;
  provider_trade_no: string | null;
  pay_url: string | null;
  expires_at: string;
  created_at: string;
  paid_at: string | null;
  notified_at: string | null;
  profiles: { email: string } | null;
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/access", () => ({
  isAdminEmail: vi.fn(),
}));

vi.mock("@/lib/billing/provider", () => ({
  getBillingProvider: vi.fn(),
}));

function makeOrder(overrides: Partial<MockAdminOrder> = {}): MockAdminOrder {
  return {
    id: ORDER_ID,
    user_id: "user-1",
    pack_id: "std-month",
    credits: 100,
    amount_fen: 1990,
    status: "pending",
    channel: "stripe",
    provider: "stripe",
    provider_trade_no: "cs_test_123",
    pay_url: "https://checkout.stripe.com/c/pay/cs_test_123",
    expires_at: "2026-12-01T00:00:00.000Z",
    created_at: "2026-11-27T00:00:00.000Z",
    paid_at: null,
    notified_at: null,
    profiles: { email: "buyer@example.com" },
    ...overrides,
  };
}

function mockAuthUser(user: { id: string; email?: string | null } | null) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUser({ id: "admin-1", email: "admin@example.com" });
  vi.mocked(isAdminEmail).mockReturnValue(true);
});

describe("GET /api/admin/orders", () => {
  it("returns 403 for unauthenticated visitors and non-admin users", async () => {
    mockAuthUser(null);
    vi.mocked(isAdminEmail).mockReturnValue(false);

    const unauthRes = await listAdminOrders(new Request("http://localhost/api/admin/orders"));
    expect(unauthRes.status).toBe(403);
    expect(await unauthRes.json()).toEqual({ error: "forbidden" });

    mockAuthUser({ id: "user-2", email: "member@example.com" });
    const nonAdminRes = await listAdminOrders(new Request("http://localhost/api/admin/orders"));
    expect(nonAdminRes.status).toBe(403);
    expect(await nonAdminRes.json()).toEqual({ error: "forbidden" });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid status or page parameters", async () => {
    const res1 = await listAdminOrders(new Request("http://localhost/api/admin/orders?status=unknown"));
    expect(res1.status).toBe(400);
    expect((await res1.json()).error).toBe("invalid_request");

    const res2 = await listAdminOrders(new Request("http://localhost/api/admin/orders?page=0"));
    expect(res2.status).toBe(400);
    expect((await res2.json()).error).toBe("invalid_request");
  });

  it("lists paginated orders and applies optional status filtering", async () => {
    const eqMock = vi.fn();
    const rangeMock = vi.fn();
    const sampleOrders = [makeOrder({ status: "flagged" })];

    const queryChain = {
      order: vi.fn(() => queryChain),
      range: vi.fn((from: number, to: number) => {
        rangeMock(from, to);
        return queryChain;
      }),
      eq: vi.fn((col: string, val: string) => {
        eqMock(col, val);
        return queryChain;
      }),
      then: (resolve: (val: { data: MockAdminOrder[]; error: null }) => unknown) =>
        Promise.resolve({ data: sampleOrders, error: null }).then(resolve),
    };

    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => queryChain),
      })),
    } as never);

    const response = await listAdminOrders(new Request("http://localhost/api/admin/orders?status=flagged&page=2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ orders: sampleOrders, page: 2 });
    expect(rangeMock).toHaveBeenCalledWith(20, 39);
    expect(eqMock).toHaveBeenCalledWith("status", "flagged");
  });

  it("returns 500 when database query fails", async () => {
    const queryChain = {
      order: vi.fn(() => queryChain),
      range: vi.fn(() => queryChain),
      eq: vi.fn(() => queryChain),
      then: (resolve: (val: { data: null; error: { message: string } }) => unknown) =>
        Promise.resolve({ data: null, error: { message: "relation error" } }).then(resolve),
    };

    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => queryChain),
      })),
    } as never);

    const response = await listAdminOrders(new Request("http://localhost/api/admin/orders"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "order_list_failed" });
  });
});

describe("POST /api/admin/orders/[id]/fulfill", () => {
  function setupFulfillAdmin(options: {
    initialOrder: MockAdminOrder | null;
    refreshedOrder?: MockAdminOrder | null;
    clearFlagError?: { message: string } | null;
    rpcError?: { message: string } | null;
  }) {
    let selectCount = 0;
    const updateCalls: Array<{ values: Record<string, unknown>; eqs: Array<[string, unknown]> }> = [];
    const rpc = vi.fn(async () => ({ data: null, error: options.rpcError ?? null }));

    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              selectCount += 1;
              if (selectCount === 1) {
                return { data: options.initialOrder, error: null };
              }
              return { data: options.refreshedOrder ?? options.initialOrder, error: null };
            }),
          })),
        })),
        update: vi.fn((values: Record<string, unknown>) => {
          const entry = { values, eqs: [] as Array<[string, unknown]> };
          updateCalls.push(entry);
          const chain = {
            eq: vi.fn((col: string, val: unknown) => {
              entry.eqs.push([col, val]);
              return chain;
            }),
            then: (resolve: (val: { error: { message: string } | null }) => unknown) =>
              Promise.resolve({ error: options.clearFlagError ?? null }).then(resolve),
          };
          return chain;
        }),
      })),
      rpc,
    };

    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
    return { rpc, updateCalls };
  }

  it("returns 403 for unauthenticated or non-admin callers", async () => {
    mockAuthUser(null);
    vi.mocked(isAdminEmail).mockReturnValue(false);

    const res = await fulfillAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/fulfill`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("returns 404 when order does not exist", async () => {
    setupFulfillAdmin({ initialOrder: null });

    const res = await fulfillAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/fulfill`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "order_not_found" });
  });

  it("returns already_paid without calling RPC when order is already paid", async () => {
    const paidOrder = makeOrder({ status: "paid" });
    const { rpc } = setupFulfillAdmin({ initialOrder: paidOrder });

    const res = await fulfillAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/fulfill`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ order: paidOrder, result: "already_paid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("clears flagged status before fulfilling flagged orders", async () => {
    const flaggedOrder = makeOrder({ status: "flagged" });
    const paidOrder = makeOrder({ status: "paid" });
    const { rpc, updateCalls } = setupFulfillAdmin({
      initialOrder: flaggedOrder,
      refreshedOrder: paidOrder,
    });

    const res = await fulfillAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/fulfill`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ order: paidOrder, result: "fulfilled" });
    expect(updateCalls).toEqual([
      {
        values: { status: "pending" },
        eqs: [
          ["id", ORDER_ID],
          ["status", "flagged"],
        ],
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("fulfill_order", {
      p_order_id: ORDER_ID,
      p_provider_trade_no: "cs_test_123",
    });
  });

  it("returns 500 when clearing flagged status fails or fulfill_order RPC fails", async () => {
    const { rpc } = setupFulfillAdmin({
      initialOrder: makeOrder({ status: "flagged" }),
      clearFlagError: { message: "db write error" },
    });

    const clearErrRes = await fulfillAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/fulfill`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );
    expect(clearErrRes.status).toBe(500);
    expect(await clearErrRes.json()).toEqual({ error: "fulfill_failed" });
    expect(rpc).not.toHaveBeenCalled();

    setupFulfillAdmin({
      initialOrder: makeOrder({ status: "pending" }),
      rpcError: { message: "rpc boom" },
    });
    const rpcErrRes = await fulfillAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/fulfill`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );
    expect(rpcErrRes.status).toBe(500);
    expect(await rpcErrRes.json()).toEqual({ error: "fulfill_failed" });
  });
});

describe("POST /api/admin/orders/[id]/query", () => {
  function setupQueryAdmin(options: {
    initialOrder: MockAdminOrder | null;
    refreshedOrder?: MockAdminOrder | null;
    rpcError?: { message: string } | null;
  }) {
    let selectCount = 0;
    const updateCalls: Array<Record<string, unknown>> = [];
    const rpc = vi.fn(async () => ({ data: null, error: options.rpcError ?? null }));

    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              selectCount += 1;
              if (selectCount === 1) {
                return { data: options.initialOrder, error: null };
              }
              return { data: options.refreshedOrder ?? options.initialOrder, error: null };
            }),
          })),
        })),
        update: vi.fn((values: Record<string, unknown>) => {
          updateCalls.push(values);
          return {
            eq: vi.fn(async () => ({ error: null })),
          };
        }),
      })),
      rpc,
    };

    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
    return { rpc, updateCalls };
  }

  function makeBillingProvider(
    id: string,
    queryOrderImpl: BillingProvider["queryOrder"],
  ): BillingProvider {
    return {
      id,
      createPayment: vi.fn(),
      queryOrder: queryOrderImpl,
      verifyCallback: vi.fn(),
      callbackAck: { success: "success", failure: "fail" },
    };
  }

  it("returns 403 for unauthenticated or non-admin callers", async () => {
    mockAuthUser(null);
    vi.mocked(isAdminEmail).mockReturnValue(false);

    const res = await queryAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/query`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("returns 404 when order does not exist and already_paid when paid", async () => {
    setupQueryAdmin({ initialOrder: null });
    const notFoundRes = await queryAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/query`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );
    expect(notFoundRes.status).toBe(404);
    expect(await notFoundRes.json()).toEqual({ error: "order_not_found" });

    const paidOrder = makeOrder({ status: "paid" });
    setupQueryAdmin({ initialOrder: paidOrder });
    const paidRes = await queryAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/query`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );
    expect(paidRes.status).toBe(200);
    expect(await paidRes.json()).toEqual({ order: paidOrder, result: "already_paid" });
  });

  it("returns 409 provider_mismatch when order provider differs from active provider", async () => {
    setupQueryAdmin({ initialOrder: makeOrder({ provider: "stripe" }) });
    vi.mocked(getBillingProvider).mockReturnValue(
      makeBillingProvider("mock", vi.fn()),
    );

    const res = await queryAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/query`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("provider_mismatch");
    expect(body.message).toContain("stripe");
    expect(body.message).toContain("mock");
  });

  it("returns 502 when provider.queryOrder throws", async () => {
    setupQueryAdmin({ initialOrder: makeOrder({ provider: "stripe" }) });
    vi.mocked(getBillingProvider).mockReturnValue(
      makeBillingProvider(
        "stripe",
        vi.fn(async () => {
          throw new Error("upstream timeout");
        }),
      ),
    );

    const res = await queryAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/query`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "provider_query_failed" });
  });

  it("updates last_checked_at and returns not_paid when provider reports unpaid", async () => {
    const order = makeOrder({ provider: "stripe", provider_trade_no: "cs_test_123" });
    const { rpc, updateCalls } = setupQueryAdmin({ initialOrder: order });
    const queryOrderMock = vi.fn(async () => ({
      paid: false,
      providerTradeNo: null,
      raw: {},
    }));
    vi.mocked(getBillingProvider).mockReturnValue(makeBillingProvider("stripe", queryOrderMock));

    const res = await queryAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/query`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order, result: "not_paid" });
    expect(queryOrderMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      amountFen: 1990,
      channel: "stripe",
      providerTradeNo: "cs_test_123",
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toHaveProperty("last_checked_at");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fulfills order and returns refreshed order when provider confirms paid", async () => {
    const pendingOrder = makeOrder({ provider: "stripe", provider_trade_no: "cs_test_123" });
    const paidOrder = makeOrder({ status: "paid", provider: "stripe", provider_trade_no: "cs_test_123" });
    const { rpc } = setupQueryAdmin({
      initialOrder: pendingOrder,
      refreshedOrder: paidOrder,
    });
    vi.mocked(getBillingProvider).mockReturnValue(
      makeBillingProvider(
        "stripe",
        vi.fn(async () => ({
          paid: true,
          providerTradeNo: "cs_test_123",
          raw: {},
        })),
      ),
    );

    const res = await queryAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/query`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order: paidOrder, result: "fulfilled" });
    expect(rpc).toHaveBeenCalledWith("fulfill_order", {
      p_order_id: ORDER_ID,
      p_provider_trade_no: "cs_test_123",
    });
  });

  it("returns 500 when fulfill_order RPC fails after provider confirms paid", async () => {
    setupQueryAdmin({
      initialOrder: makeOrder({ provider: "stripe" }),
      rpcError: { message: "rpc unavailable" },
    });
    vi.mocked(getBillingProvider).mockReturnValue(
      makeBillingProvider(
        "stripe",
        vi.fn(async () => ({
          paid: true,
          providerTradeNo: "cs_test_123",
          raw: {},
        })),
      ),
    );

    const res = await queryAdminOrder(
      new Request(`http://localhost/api/admin/orders/${ORDER_ID}/query`, { method: "POST" }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "fulfill_failed" });
  });
});
