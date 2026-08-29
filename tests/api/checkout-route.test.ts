import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/route";

const state = vi.hoisted(() => ({
  user: { id: "user-1", email: "user@example.com" } as { id: string; email: string } | null,
  reusableOrder: null as { id: string } | null,
  activePendingCount: 0,
  insertError: null as unknown,
  insertCalls: [] as unknown[],
  updateCalls: [] as { values: unknown; eqId: string }[],
  createPaymentError: null as Error | null,
}));

const providerMocks = vi.hoisted(() => ({
  createPayment: vi.fn(async () => ({ payUrl: "mock://pay/wechat/new-order", providerTradeNo: null, raw: {} })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  })),
}));

vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureUserProfile: vi.fn(async () => undefined),
}));

vi.mock("@/lib/billing/provider", () => ({
  getBillingProvider: () => ({ id: "mock", createPayment: providerMocks.createPayment }),
  getWebhookUrl: () => "http://localhost:3000/api/webhooks/mock",
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => {
    const reuseChain = {
      eq: () => reuseChain,
      not: () => reuseChain,
      gt: () => reuseChain,
      order: () => reuseChain,
      limit: () => reuseChain,
      maybeSingle: async () => ({ data: state.reusableOrder, error: null }),
    };
    const countChain = {
      eq: () => countChain,
      gt: async () => ({ count: state.activePendingCount, error: null }),
    };

    return {
      from: () => ({
        select: (_columns: string, options?: { head?: boolean }) => (options?.head ? countChain : reuseChain),
        insert: async (values: unknown) => {
          state.insertCalls.push(values);
          return { error: state.insertError };
        },
        update: (values: unknown) => ({
          eq: async (column: string, id: string) => {
            state.updateCalls.push({ values, eqId: column === "id" ? id : "" });
            return { error: null };
          },
        }),
      }),
    };
  }),
}));

function postCheckout(body: unknown) {
  return POST(new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { id: "user-1", email: "user@example.com" };
    state.reusableOrder = null;
    state.activePendingCount = 0;
    state.insertError = null;
    state.insertCalls = [];
    state.updateCalls = [];
    state.createPaymentError = null;
    providerMocks.createPayment.mockClear();
    providerMocks.createPayment.mockImplementation(
      async () => ({ payUrl: "mock://pay/wechat/new-order", providerTradeNo: null, raw: {} }),
    );
  });

  it("rejects unauthenticated requests", async () => {
    state.user = null;

    const response = await postCheckout({ packId: "starter-20", channel: "wechat" });

    expect(response.status).toBe(401);
  });

  it("rejects unknown packs with server-side pricing only", async () => {
    const response = await postCheckout({ packId: "mega-9999", channel: "wechat" });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("unknown_sku");
    expect(state.insertCalls).toHaveLength(0);
  });

  it("rejects invalid channels", async () => {
    const response = await postCheckout({ packId: "starter-20", channel: "paypal" });

    expect(response.status).toBe(400);
  });

  it("reuses a fresh pending order for the same pack instead of inserting", async () => {
    state.reusableOrder = { id: "existing-order" };

    const response = await postCheckout({ packId: "starter-20", channel: "wechat" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ orderId: "existing-order", reused: true });
    expect(state.insertCalls).toHaveLength(0);
    expect(providerMocks.createPayment).not.toHaveBeenCalled();
  });

  it("refuses to create when three active pending orders exist", async () => {
    state.activePendingCount = 3;

    const response = await postCheckout({ packId: "starter-20", channel: "wechat" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("too_many_pending_orders");
    expect(state.insertCalls).toHaveLength(0);
  });

  it("creates an order with the server-side price snapshot and stores the pay url", async () => {
    const response = await postCheckout({ packId: "starter-20", channel: "alipay" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reused).toBe(false);
    expect(body.orderId).toMatch(/^[0-9a-f-]{36}$/);

    const inserted = state.insertCalls[0] as Record<string, unknown>;
    expect(inserted.pack_id).toBe("starter-20");
    expect(inserted.credits).toBe(20);
    expect(inserted.amount_fen).toBe(990);
    expect(inserted.status).toBe("pending");
    expect(inserted.channel).toBe("alipay");
    expect(inserted.provider).toBe("mock");
    expect(new Date(String(inserted.expires_at)).getTime()).toBeGreaterThan(Date.now());

    expect(providerMocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountFen: 990, channel: "alipay", notifyUrl: "http://localhost:3000/api/webhooks/mock" }),
    );

    const payUrlUpdate = state.updateCalls.find((call) => (call.values as Record<string, unknown>).pay_url);
    expect(payUrlUpdate?.values).toEqual({ pay_url: "mock://pay/wechat/new-order" });
  });

  it("client-side price fields never influence the order", async () => {
    const response = await postCheckout({ packId: "starter-20", channel: "wechat", amountFen: 1, credits: 999999 });

    expect(response.status).toBe(200);
    const inserted = state.insertCalls[0] as Record<string, unknown>;
    expect(inserted.amount_fen).toBe(990);
    expect(inserted.credits).toBe(20);
  });

  it("marks the order failed and reports 502 when the provider rejects the request", async () => {
    providerMocks.createPayment.mockRejectedValueOnce(new Error("lantu_create_order_failed"));

    const response = await postCheckout({ packId: "starter-20", channel: "wechat" });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("provider_unavailable");

    const failedUpdate = state.updateCalls.find((call) => (call.values as Record<string, unknown>).status === "failed");
    expect(failedUpdate).toBeDefined();
  });
  it("creates a membership order with the frozen plan snapshot", async () => {
    const response = await postCheckout({ planId: "std-year", channel: "wechat" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reused).toBe(false);

    const inserted = state.insertCalls[0] as Record<string, unknown>;
    expect(inserted.pack_id).toBe("std-year");
    expect(inserted.kind).toBe("plan");
    expect(inserted.credits).toBe(100);
    expect(inserted.amount_fen).toBe(19900);
    expect(inserted.plan_snapshot).toEqual({
      planId: "std-year",
      quotaPerTranche: 100,
      tranches: 12,
      periodDays: 365,
    });
    expect(providerMocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountFen: 19900, channel: "wechat" }),
    );
  });

  it("ignores client-side plan numbers and snapshot payloads", async () => {
    const response = await postCheckout({
      planId: "std-month",
      channel: "wechat",
      amountFen: 1,
      credits: 999999,
      planSnapshot: { quotaPerTranche: 99999, tranches: 99 },
    });

    expect(response.status).toBe(200);

    const inserted = state.insertCalls[0] as Record<string, unknown>;
    expect(inserted.amount_fen).toBe(1990);
    expect(inserted.credits).toBe(100);
    expect(inserted.plan_snapshot).toEqual({
      planId: "std-month",
      quotaPerTranche: 100,
      tranches: 1,
      periodDays: 30,
    });
  });

  it("rejects a request carrying both packId and planId", async () => {
    const response = await postCheckout({ packId: "starter-20", planId: "std-month", channel: "wechat" });

    expect(response.status).toBe(400);
    expect(state.insertCalls).toHaveLength(0);
  });

  it("rejects a request carrying neither packId nor planId", async () => {
    const response = await postCheckout({ channel: "wechat" });

    expect(response.status).toBe(400);
    expect(state.insertCalls).toHaveLength(0);
  });
});
