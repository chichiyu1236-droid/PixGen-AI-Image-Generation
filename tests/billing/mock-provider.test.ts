import { describe, expect, it } from "vitest";
import { fenToYuanString, formatFenAsCny, yuanStringToFen } from "@/lib/billing/money";
import { membershipPlans } from "@/lib/billing/plans";
import { buildMockCallbackParams, mockProvider } from "@/lib/billing/providers/mock";
import { signParams } from "@/lib/billing/providers/signature";

describe("money", () => {
  it("converts fen to yuan strings", () => {
    expect(fenToYuanString(990)).toBe("9.90");
    expect(fenToYuanString(1)).toBe("0.01");
  });

  it("parses yuan strings back to fen", () => {
    expect(yuanStringToFen("9.90")).toBe(990);
    expect(yuanStringToFen("0.01")).toBe(1);
  });

  it("rejects malformed yuan strings", () => {
    expect(() => yuanStringToFen("9.999")).toThrow();
    expect(() => yuanStringToFen("-1")).toThrow();
    expect(() => yuanStringToFen("abc")).toThrow();
  });

  it("formats fen as zh-CN currency", () => {
    expect(formatFenAsCny(990)).toContain("9.90");
  });
});

describe("membership plans", () => {
  it("exposes membership plans with server-side pricing", () => {
    expect(membershipPlans).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "std-month", quotaPerTranche: 100, amountFen: 1990 })]),
    );
  });
});

describe("mock provider", () => {
  it("returns a deterministic pay url", async () => {
    const result = await mockProvider.createPayment({
      orderId: "order-1",
      amountFen: 990,
      body: "pack",
      channel: "wechat",
      notifyUrl: "https://example.com/api/webhooks/mock",
      ttlMinutes: 15,
    });

    expect(result.payUrl).toBe("mock://pay/wechat/order-1");
  });

  it("verifies its own signed callbacks", () => {
    const params = buildMockCallbackParams({ orderId: "order-1", amountFen: 990 });

    expect(mockProvider.verifyCallback(params)).toEqual({
      valid: true,
      orderId: "order-1",
      providerTradeNo: `mock-order-order-1`,
      amountFen: 990,
    });
  });

  it("rejects tampered callbacks", () => {
    const params = buildMockCallbackParams({ orderId: "order-1", amountFen: 990 });

    expect(mockProvider.verifyCallback({ ...params, total_fee: "0.01" })).toEqual({ valid: false, reason: "bad_signature" });
    expect(mockProvider.verifyCallback({ code: "0", out_trade_no: "order-1" })).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects signed non-success codes and missing order ids", () => {
    const failed = { code: "1", out_trade_no: "order-1", total_fee: "9.90" };
    const signedFailed = { ...failed, sign: signParams(failed, "mock-secret") };

    expect(mockProvider.verifyCallback(signedFailed)).toEqual({ valid: false, reason: "not_success_code" });

    const missing = { code: "0", total_fee: "9.90" };
    const signedMissing = { ...missing, sign: signParams(missing, "mock-secret") };

    expect(mockProvider.verifyCallback(signedMissing)).toEqual({ valid: false, reason: "missing_out_trade_no" });
  });

  it("rejects a signed callback with a malformed amount", () => {
    const malformed = { code: "0", out_trade_no: "order-1", total_fee: "9.999" };
    const signed = { ...malformed, sign: signParams(malformed, "mock-secret") };

    expect(mockProvider.verifyCallback(signed)).toEqual({ valid: false, reason: "invalid_amount" });
  });

  it("reports unpaid on query since it has no external state", async () => {
    const result = await mockProvider.queryOrder({ orderId: "order-1", amountFen: 990, channel: "wechat" });

    expect(result.paid).toBe(false);
  });
});
