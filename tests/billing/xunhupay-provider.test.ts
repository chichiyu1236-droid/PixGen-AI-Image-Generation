import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fenToYuanString } from "@/lib/billing/money";
import { xunhupayProvider } from "@/lib/billing/providers/xunhupay";
import { signParams } from "@/lib/billing/providers/signature";

const APP_ID = "20146122002";
const SECRET = "xunhupay-secret";

function lastRequestBody(): Record<string, string> {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String(call[1]?.body)) as Record<string, string>;
}

beforeEach(() => {
  process.env.XUNHUPAY_APP_ID = APP_ID;
  process.env.XUNHUPAY_APP_SECRET = SECRET;
  process.env.XUNHUPAY_API_BASE = "https://api.xunhupay.com";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ errcode: 0, errmsg: "success!", hash: "mock" }), { status: 200 })),
  );
});

afterEach(() => {
  delete process.env.XUNHUPAY_APP_ID;
  delete process.env.XUNHUPAY_APP_SECRET;
  delete process.env.XUNHUPAY_API_BASE;
  vi.unstubAllGlobals();
});

describe("xunhupay provider createPayment", () => {
  it("posts signed params and extracts the pay url", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          errcode: 0,
          errmsg: "success!",
          url: "https://api.xunhupay.com/alipay/pay/index.html?id=123",
          url_qrcode: "https://api.xunhupay.com/wxpay/qrcode?id=456",
          hash: "mock",
        }),
        { status: 200 },
      ),
    );

    const result = await xunhupayProvider.createPayment({
      orderId: "order-001",
      amountFen: 990,
      body: "尝鲜包: 20 积分",
      channel: "wechat",
      notifyUrl: "https://example.com/api/webhooks/xunhupay",
      ttlMinutes: 15,
    });

    expect(result.payUrl).toBe("https://api.xunhupay.com/wxpay/qrcode?id=456");

    const body = lastRequestBody();
    expect(body.version).toBe("1.1");
    expect(body.appid).toBe(APP_ID);
    expect(body.trade_order_id).toBe("order-001");
    expect(body.total_fee).toBe("9.90");
    expect(body.notify_url).toBe("https://example.com/api/webhooks/xunhupay");
    expect(body.hash).toBeTruthy();
    expect(body.hash).toMatch(/^[0-9A-Fa-f]{32}$/);
  });

  it("falls back to url when url_qrcode is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errcode: 0, errmsg: "success!", url: "https://pay.example.com/order-002", hash: "mock" }),
        { status: 200 },
      ),
    );

    const result = await xunhupayProvider.createPayment({
      orderId: "order-002",
      amountFen: 990,
      body: "pack",
      channel: "alipay",
      notifyUrl: "https://example.com/api/webhooks/xunhupay",
      ttlMinutes: 15,
    });

    expect(result.payUrl).toBe("https://pay.example.com/order-002");
  });

  it("throws when the platform rejects the order", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ errcode: 500, errmsg: "invalid sign!", hash: "mock" }), { status: 200 }),
    );

    await expect(
      xunhupayProvider.createPayment({
        orderId: "order-x",
        amountFen: 990,
        body: "pack",
        channel: "wechat",
        notifyUrl: "https://example.com/api/webhooks/xunhupay",
        ttlMinutes: 15,
      }),
    ).rejects.toThrow(/xunhupay_create_order_failed/);
  });
});

describe("xunhupay provider queryOrder", () => {
  it("reports paid with the provider trade number", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errcode: 0, data: { status: "OD", open_order_id: "xh-open-1" }, errmsg: "success!", hash: "mock" }),
        { status: 200 },
      ),
    );

    const result = await xunhupayProvider.queryOrder({ orderId: "order-1", amountFen: 990, channel: "wechat" });

    expect(result.paid).toBe(true);
    expect(result.providerTradeNo).toBe("xh-open-1");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("https://api.xunhupay.com/payment/query.html");
  });

  it("reports unpaid when status is WP", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ errcode: 0, data: { status: "WP" }, errmsg: "success!", hash: "mock" }), { status: 200 }),
    );

    const result = await xunhupayProvider.queryOrder({ orderId: "order-1", amountFen: 990, channel: "alipay" });

    expect(result.paid).toBe(false);
  });
});

describe("xunhupay provider verifyCallback", () => {
  function buildCallback(overrides: Record<string, string> = {}) {
    const base: Record<string, string> = {
      trade_order_id: "order-1",
      total_fee: fenToYuanString(990),
      transaction_id: "xh-tx-1",
      open_order_id: "xh-open-1",
      order_title: "积分包购买",
      status: "OD",
      appid: APP_ID,
      time: "1700000000",
      nonce_str: "abc123",
      ...overrides,
    };

    // Sign exactly the CALLBACK_SIGN_FIELDS that are present (matching the provider)
    const CALLBACK_SIGN_FIELDS = ["trade_order_id", "total_fee", "transaction_id", "open_order_id", "order_title", "status", "plugins", "attach", "appid", "time", "nonce_str"] as const;
    const signPayload: Record<string, string> = {};
    for (const field of CALLBACK_SIGN_FIELDS) {
      if (base[field] !== undefined && base[field] !== "") {
        signPayload[field] = base[field];
      }
    }

    return { ...base, hash: signParams(signPayload, SECRET).toLowerCase() };
  }

  it("accepts a genuine paid callback", () => {
    const params = buildCallback();

    expect(xunhupayProvider.verifyCallback(params)).toEqual({
      valid: true,
      orderId: "order-1",
      providerTradeNo: "xh-tx-1",
      amountFen: 990,
    });
  });

  it("accepts callback with extra fields (plugins, attach)", () => {
    const params = buildCallback({ plugins: "my-plugin", attach: "extra-data" });

    expect(xunhupayProvider.verifyCallback(params)).toEqual({
      valid: true,
      orderId: "order-1",
      providerTradeNo: "xh-tx-1",
      amountFen: 990,
    });
  });

  it("rejects a tampered amount", () => {
    const genuine = buildCallback();
    const tampered = { ...genuine, total_fee: "0.01" };

    expect(xunhupayProvider.verifyCallback(tampered)).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects non-paid status and missing order id", () => {
    expect(xunhupayProvider.verifyCallback(buildCallback({ status: "WP" }))).toEqual({ valid: false, reason: "not_success_code" });
    expect(xunhupayProvider.verifyCallback(buildCallback({ trade_order_id: "" }))).toEqual({ valid: false, reason: "missing_out_trade_no" });
  });

  it("rejects a malformed amount", () => {
    const params = buildCallback({ total_fee: "9.999" });

    expect(xunhupayProvider.verifyCallback(params)).toEqual({ valid: false, reason: "invalid_amount" });
  });
});
