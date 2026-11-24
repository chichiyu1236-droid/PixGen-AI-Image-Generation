import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORDER_ID = "22222222-2222-4222-8222-222222222222";
const WEBHOOK_SECRET = "whsec_route_test_secret";
const ORIGINAL_ENV = { ...process.env };

type MockOrder = {
  id: string;
  user_id: string;
  credits: number;
  amount_fen: number;
  status: string;
  channel: string;
  provider: string;
  provider_trade_no: string | null;
};

const state = vi.hoisted(() => ({
  order: null as MockOrder | null,
  lookupError: null as { message: string } | null,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  updateCalls: [] as Array<{ values: Record<string, unknown>; eqId: string; neqStatus?: string }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => {
        const filters: Array<[string, unknown]> = [];
        const query = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return query;
          },
          maybeSingle: async () => {
            if (state.lookupError) {
              return { data: null, error: state.lookupError };
            }
            const order = state.order;
            if (!order) {
              return { data: null, error: null };
            }
            const matches = filters.every(([col, val]) => (order as Record<string, unknown>)[col] === val);
            return { data: matches ? order : null, error: null };
          },
        };
        return query;
      },
      update: (values: Record<string, unknown>) => ({
        eq: (col: string, id: string) => {
          const entry: { values: Record<string, unknown>; eqId: string; neqStatus?: string } = {
            values,
            eqId: col === "id" ? id : "",
          };
          state.updateCalls.push(entry);

          const chain = {
            neq: async (neqCol: string, neqVal: string) => {
              if (neqCol === "status") {
                entry.neqStatus = neqVal;
              }
              return { error: null };
            },
            then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
          };
          return chain;
        },
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return { data: null, error: state.rpcError };
    },
  })),
}));

function buildSignature(rawBody: string, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function makeCompletedEvent(overrides: Record<string, unknown> = {}, eventType = "checkout.session.completed") {
  return {
    id: "evt_test_1",
    type: eventType,
    data: {
      object: {
        id: "cs_test_12345",
        payment_status: "paid",
        amount_total: 1990,
        currency: "cny",
        client_reference_id: ORDER_ID,
        metadata: { order_id: ORDER_ID },
        ...overrides,
      },
    },
  };
}

function postWebhook(rawBody: string, signatureHeader: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signatureHeader !== null) {
    headers.set("stripe-signature", signatureHeader);
  }
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers,
      body: rawBody,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  };
  state.order = {
    id: ORDER_ID,
    user_id: "user-1",
    credits: 100,
    amount_fen: 1990,
    status: "pending",
    channel: "stripe",
    provider: "stripe",
    provider_trade_no: "cs_test_12345",
  };
  state.lookupError = null;
  state.rpcError = null;
  state.rpcCalls = [];
  state.updateCalls = [];
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/webhooks/stripe", () => {
  it("returns 503 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "";
    const rawBody = JSON.stringify(makeCompletedEvent());

    const response = await postWebhook(rawBody, buildSignature(rawBody));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("stripe_webhook_not_configured");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("returns 400 on missing, forged, malformed-length, or expired signature without touching DB", async () => {
    const rawBody = JSON.stringify(makeCompletedEvent());

    for (const sig of [
      null,
      "t=1700000000,v1=short",
      buildSignature(rawBody, "wrong_secret"),
      buildSignature(rawBody, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 600),
    ]) {
      const response = await postWebhook(rawBody, sig);
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error).toBe("invalid_signature");
    }

    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("fulfills a valid paid checkout.session.completed event, verifying against raw body formatting", async () => {
    // Pretty-printed JSON with extra whitespace proves signature verification runs on raw request text.
    const rawBody = JSON.stringify(makeCompletedEvent(), null, 2);

    const response = await postWebhook(rawBody, buildSignature(rawBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(state.rpcCalls).toEqual([
      {
        fn: "fulfill_order",
        args: {
          p_order_id: ORDER_ID,
          p_provider_trade_no: "cs_test_12345",
        },
      },
    ]);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].eqId).toBe(ORDER_ID);
    expect(state.updateCalls[0].values).toMatchObject({
      raw_notify: expect.objectContaining({ id: "evt_test_1" }),
      notified_at: expect.any(String),
    });
  });

  it("fulfills checkout.session.async_payment_succeeded when metadata.order_id and client_reference_id match", async () => {
    const rawBody = JSON.stringify(
      makeCompletedEvent(
        { metadata: { order_id: ORDER_ID }, client_reference_id: ORDER_ID },
        "checkout.session.async_payment_succeeded",
      ),
    );

    const response = await postWebhook(rawBody, buildSignature(rawBody));

    expect(response.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].args.p_order_id).toBe(ORDER_ID);
    expect(state.rpcCalls[0].args.p_provider_trade_no).toBe("cs_test_12345");
  });

  it("fulfills a valid webhook when the local order has not stored provider_trade_no yet", async () => {
    state.order!.provider_trade_no = null;
    const rawBody = JSON.stringify(makeCompletedEvent());

    const response = await postWebhook(rawBody, buildSignature(rawBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(state.rpcCalls).toEqual([
      {
        fn: "fulfill_order",
        args: {
          p_order_id: ORDER_ID,
          p_provider_trade_no: "cs_test_12345",
        },
      },
    ]);
  });

  it("rejects webhooks with missing or invalid session.id without fulfilling or modifying orders", async () => {
    for (const badSessionId of [undefined, "", "pi_123456", "cs_bad/path", " cs_test_12345 "]) {
      const rawBody = JSON.stringify(makeCompletedEvent({ id: badSessionId }));
      const response = await postWebhook(rawBody, buildSignature(rawBody));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ received: true, ignored: true, reason: "invalid_session_id" });
    }

    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("does not fulfill when metadata.order_id and client_reference_id disagree, ignoring unbound sessions and flagging uniquely bound orders", async () => {
    // Unbound session: must not call fulfill_order and must not touch unrelated local order.
    const unboundBody = JSON.stringify(
      makeCompletedEvent({
        id: "cs_test_unbound",
        metadata: { order_id: ORDER_ID },
        client_reference_id: OTHER_ORDER_ID,
      }),
    );
    const res1 = await postWebhook(unboundBody, buildSignature(unboundBody));
    const body1 = await res1.json();

    expect(res1.status).toBe(200);
    expect(body1).toEqual({ received: true, ignored: true, reason: "order_binding_mismatch" });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);

    // Uniquely bound pending local order (provider='stripe' AND provider_trade_no=session.id): flag without fulfilling.
    const boundBody = JSON.stringify(
      makeCompletedEvent({
        id: "cs_test_12345",
        metadata: { order_id: ORDER_ID },
        client_reference_id: OTHER_ORDER_ID,
      }),
    );
    const res2 = await postWebhook(boundBody, buildSignature(boundBody));
    const body2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(body2).toEqual({ received: true, flagged: true });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].eqId).toBe(ORDER_ID);
    expect(state.updateCalls[0].neqStatus).toBe("paid");
    expect(state.updateCalls[0].values).toMatchObject({
      status: "flagged",
      raw_notify: expect.objectContaining({ id: "evt_test_1" }),
      notified_at: expect.any(String),
    });
    expect(state.updateCalls[0].values).not.toHaveProperty("provider_trade_no");
  });

  it("does not fulfill when client_reference_id or metadata.order_id is missing or non-UUID", async () => {
    const cases = [
      { id: "cs_test_other", metadata: { order_id: ORDER_ID }, client_reference_id: null },
      { id: "cs_test_other", metadata: { order_id: ORDER_ID }, client_reference_id: "" },
      { id: "cs_test_other", metadata: {}, client_reference_id: ORDER_ID },
      { id: "cs_test_other", metadata: { order_id: "not-a-uuid" }, client_reference_id: "not-a-uuid" },
    ];

    for (const overrides of cases) {
      const rawBody = JSON.stringify(makeCompletedEvent(overrides));
      const response = await postWebhook(rawBody, buildSignature(rawBody));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ received: true, ignored: true, reason: "order_binding_mismatch" });
    }

    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("flags the order and preserves existing provider_trade_no without fulfilling when webhook session.id mismatches stored provider_trade_no", async () => {
    state.order!.provider_trade_no = "cs_test_expected";
    const rawBody = JSON.stringify(makeCompletedEvent({ id: "cs_test_other" }));

    const response = await postWebhook(rawBody, buildSignature(rawBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, flagged: true });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].eqId).toBe(ORDER_ID);
    expect(state.updateCalls[0].neqStatus).toBe("paid");
    expect(state.updateCalls[0].values).toMatchObject({
      status: "flagged",
      raw_notify: expect.objectContaining({
        data: expect.objectContaining({
          object: expect.objectContaining({ id: "cs_test_other" }),
        }),
      }),
      notified_at: expect.any(String),
    });
    expect(state.updateCalls[0].values).not.toHaveProperty("provider_trade_no");
    expect(state.order!.provider_trade_no).toBe("cs_test_expected");
  });

  it("acknowledges unrelated event types and unpaid sessions with 200 without fulfilling", async () => {
    const unrelatedBody = JSON.stringify({ id: "evt_2", type: "payment_intent.created", data: { object: {} } });
    const res1 = await postWebhook(unrelatedBody, buildSignature(unrelatedBody));
    expect(res1.status).toBe(200);

    const unpaidBody = JSON.stringify(makeCompletedEvent({ payment_status: "unpaid" }));
    const res2 = await postWebhook(unpaidBody, buildSignature(unpaidBody));
    expect(res2.status).toBe(200);

    expect(state.rpcCalls).toHaveLength(0);
  });

  it("acknowledges unknown orders or non-stripe orders with 200 to avoid infinite Stripe retries", async () => {
    state.order = null;
    const rawBody = JSON.stringify(makeCompletedEvent());
    const res1 = await postWebhook(rawBody, buildSignature(rawBody));
    expect(res1.status).toBe(200);

    state.order = {
      id: ORDER_ID,
      user_id: "user-1",
      credits: 100,
      amount_fen: 1990,
      status: "pending",
      channel: "wechat",
      provider: "lantu",
      provider_trade_no: null,
    };
    const res2 = await postWebhook(rawBody, buildSignature(rawBody));
    expect(res2.status).toBe(200);

    expect(state.rpcCalls).toHaveLength(0);
  });

  it("records notification and returns 200 idempotently when order is already paid", async () => {
    state.order!.status = "paid";
    const rawBody = JSON.stringify(makeCompletedEvent());

    const response = await postWebhook(rawBody, buildSignature(rawBody));

    expect(response.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].values).toHaveProperty("raw_notify");
    expect(state.updateCalls[0].values).toHaveProperty("notified_at");
  });

  it("keeps already-paid orders intact without flagging or overwriting raw_notify on mismatched session or binding", async () => {
    state.order!.status = "paid";
    state.order!.provider_trade_no = "cs_test_expected";

    const mismatchedSessionBody = JSON.stringify(makeCompletedEvent({ id: "cs_test_other" }));
    const res1 = await postWebhook(mismatchedSessionBody, buildSignature(mismatchedSessionBody));
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ received: true });

    const mismatchedBindingBody = JSON.stringify(
      makeCompletedEvent({
        id: "cs_test_expected",
        metadata: { order_id: ORDER_ID },
        client_reference_id: OTHER_ORDER_ID,
      }),
    );
    const res2 = await postWebhook(mismatchedBindingBody, buildSignature(mismatchedBindingBody));
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ received: true, ignored: true, reason: "order_binding_mismatch" });

    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("flags the order and returns 200 when amount_total or currency mismatches", async () => {
    const mismatchAmountBody = JSON.stringify(makeCompletedEvent({ amount_total: 100 }));
    const res1 = await postWebhook(mismatchAmountBody, buildSignature(mismatchAmountBody));
    const body1 = await res1.json();

    expect(res1.status).toBe(200);
    expect(body1).toEqual({ received: true, flagged: true });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls[0].values).toMatchObject({ status: "flagged" });
    expect(state.updateCalls[0].neqStatus).toBe("paid");

    state.updateCalls = [];
    const mismatchCurrencyBody = JSON.stringify(makeCompletedEvent({ currency: "usd" }));
    const res2 = await postWebhook(mismatchCurrencyBody, buildSignature(mismatchCurrencyBody));
    const body2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(body2).toEqual({ received: true, flagged: true });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.updateCalls[0].values).toMatchObject({ status: "flagged" });
  });

  it("returns 200 and records raw_notify when fulfill_order reports order_not_fulfillable", async () => {
    state.rpcError = { message: "order_not_fulfillable: status=failed" };
    const rawBody = JSON.stringify(makeCompletedEvent());

    const response = await postWebhook(rawBody, buildSignature(rawBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].values).toHaveProperty("raw_notify");
  });

  it("returns 500 on transient fulfill_order errors so Stripe retries", async () => {
    state.rpcError = { message: "connection reset by peer" };
    const rawBody = JSON.stringify(makeCompletedEvent());

    const response = await postWebhook(rawBody, buildSignature(rawBody));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("fulfill_failed");
  });
});
