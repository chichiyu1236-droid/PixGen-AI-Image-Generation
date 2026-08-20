import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fenToYuanString } from "@/lib/billing/money";
import { lantuProvider } from "@/lib/billing/providers/lantu";
import { signParams } from "@/lib/billing/providers/signature";

const MCH_ID = "1230000109";
const SECRET = "lantu-secret";

function lastRequestBody(): URLSearchParams {
  const call = vi.mocked(fetch).mock.calls[0];
  return new URLSearchParams(String(call[1]?.body));
}

beforeEach(() => {
  process.env.LANTU_MCH_ID = MCH_ID;
  process.env.LANTU_APP_SECRET = SECRET;
  process.env.LANTU_API_BASE = "https://api.ltzf.cn";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ code: 0, msg: "ok", request_id: "req-1" }), { status: 200 })),
  );
});

afterEach(() => {
  delete process.env.LANTU_MCH_ID;
  delete process.env.LANTU_APP_SECRET;
  delete process.env.LANTU_API_BASE;
  vi.unstubAllGlobals();
});

describe("lantu provider createPayment", () => {
  it("posts signed required params and extracts the pay url", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, msg: "ok", data: { code_url: "weixin://wxpay/example" } }), { status: 200 }),
    );

    const result = await lantuProvider.createPayment({
      orderId: "0a1b2c3d-0000-4000-8000-000000000001",
      amountFen: 990,
      body: "尝鲜包: 20 积分",
      channel: "wechat",
      notifyUrl: "https://example.com/api/webhooks/lantu",
      ttlMinutes: 15,
    });

    expect(result.payUrl).toBe("weixin://wxpay/example");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("https://api.ltzf.cn/api/wxpay/native");

    const body = lastRequestBody();
    expect(body.get("mch_id")).toBe(MCH_ID);
    expect(body.get("out_trade_no")).toBe("0a1b2c3d-0000-4000-8000-000000000001");
    expect(body.get("total_fee")).toBe("9.90");
    expect(body.get("notify_url")).toBe("https://example.com/api/webhooks/lantu");
    expect(body.get("time_expire")).toBe("15m");

    const expectedSign = signParams(
      {
        mch_id: MCH_ID,
        out_trade_no: "0a1b2c3d-0000-4000-8000-000000000001",
        total_fee: "9.90",
        body: "尝鲜包: 20 积分",
        timestamp: String(body.get("timestamp")),
        notify_url: "https://example.com/api/webhooks/lantu",
      },
      SECRET,
    );
    expect(body.get("sign")).toBe(expectedSign);
  });

  it("targets the alipay endpoint for alipay channel", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, msg: "ok", data: { code_url: "alipay://pay/example" } }), { status: 200 }),
    );

    await lantuProvider.createPayment({
      orderId: "0a1b2c3d-0000-4000-8000-000000000002",
      amountFen: 990,
      body: "pack",
      channel: "alipay",
      notifyUrl: "https://example.com/api/webhooks/lantu",
      ttlMinutes: 15,
    });

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("https://api.ltzf.cn/api/alipay/native");
  });

  it("throws when the platform rejects the order", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 1, msg: "签名错误", request_id: "req-2" }), { status: 200 }),
    );

    await expect(
      lantuProvider.createPayment({
        orderId: "order-x",
        amountFen: 990,
        body: "pack",
        channel: "wechat",
        notifyUrl: "https://example.com/api/webhooks/lantu",
        ttlMinutes: 15,
      }),
    ).rejects.toThrow(/lantu_create_order_failed/);
  });
});

describe("lantu provider queryOrder", () => {
  it("reports paid with the provider trade number", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 0, msg: "ok", data: { pay_status: 1, pay_no: "wx-pay-1", order_no: "lantu-1" } }),
        { status: 200 },
      ),
    );

    const result = await lantuProvider.queryOrder({ orderId: "order-1", amountFen: 990, channel: "wechat" });

    expect(result.paid).toBe(true);
    expect(result.providerTradeNo).toBe("wx-pay-1");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("https://api.ltzf.cn/api/wxpay/get_pay_order");
  });

  it("reports unpaid when pay_status is 0", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, msg: "ok", data: { pay_status: 0 } }), { status: 200 }),
    );

    const result = await lantuProvider.queryOrder({ orderId: "order-1", amountFen: 990, channel: "alipay" });

    expect(result.paid).toBe(false);
  });
});

describe("lantu provider verifyCallback", () => {
  const CALLBACK_SIGN_FIELDS = ["code", "timestamp", "mch_id", "order_no", "out_trade_no", "pay_no", "total_fee"] as const;

  function buildCallback(overrides: Record<string, string> = {}) {
    const base: Record<string, string> = {
      code: "0",
      timestamp: "1700000000",
      mch_id: MCH_ID,
      order_no: "lantu-order-1",
      out_trade_no: "order-1",
      pay_no: "wx-pay-1",
      total_fee: fenToYuanString(990),
      ...overrides,
    };

    // Only CALLBACK_SIGN_FIELDS participate in the Lantu signature; extra
    // fields (pay_channel, attach, ...) are added unsigned.
    const signPayload: Record<string, string> = {};
    for (const field of CALLBACK_SIGN_FIELDS) {
      if (base[field] !== undefined && base[field] !== "") {
        signPayload[field] = base[field];
      }
    }

    return { ...base, sign: signParams(signPayload, SECRET) };
  }

  it("accepts a genuine callback even with extra non-signing fields", () => {
    const params = { ...buildCallback(), pay_channel: "wechat", attach: "extra" };

    expect(lantuProvider.verifyCallback(params)).toEqual({
      valid: true,
      orderId: "order-1",
      providerTradeNo: "lantu-order-1",
      amountFen: 990,
    });
  });

  it("rejects a tampered amount", () => {
    const genuine = buildCallback();
    const tampered = { ...genuine, total_fee: "0.01" };

    expect(lantuProvider.verifyCallback(tampered)).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects non-success codes and missing order ids", () => {
    expect(lantuProvider.verifyCallback(buildCallback({ code: "1" }))).toEqual({ valid: false, reason: "not_success_code" });
    expect(lantuProvider.verifyCallback(buildCallback({ out_trade_no: "" }))).toEqual({ valid: false, reason: "missing_out_trade_no" });
  });

  it("rejects a malformed amount", () => {
    const params = buildCallback({ total_fee: "9.999" });

    expect(lantuProvider.verifyCallback(params)).toEqual({ valid: false, reason: "invalid_amount" });
  });
});
