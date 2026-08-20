import { describe, expect, it } from "vitest";
import { signParams, verifySignature } from "@/lib/billing/providers/signature";

describe("signParams", () => {
  it("sorts keys ASCII ascending, appends key, and uppercases the MD5", () => {
    const params = { notify_url: "https://example.com/api/webhooks/lantu", out_trade_no: "order-1", mch_id: "123", total_fee: "9.90" };

    expect(signParams(params, "secret")).toBe(signParams(params, "secret"));
    expect(signParams(params, "secret")).toMatch(/^[0-9A-F]{32}$/);
  });

  it("is order-independent and produces the same signature regardless of object key order", () => {
    const a = signParams({ a: "1", b: "2" }, "secret");
    const b = signParams({ b: "2", a: "1" }, "secret");

    expect(a).toBe(b);
  });

  it("excludes empty values from the signature payload", () => {
    const withEmpty = signParams({ a: "1", b: "" }, "secret");
    const withoutEmpty = signParams({ a: "1" }, "secret");

    expect(withEmpty).toBe(withoutEmpty);
  });
});

describe("verifySignature", () => {
  it("accepts a correctly signed payload", () => {
    const params = { code: "0", out_trade_no: "order-1", total_fee: "9.90" };
    const signed = { ...params, sign: signParams(params, "secret") };

    expect(verifySignature(signed, "secret")).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const params = { code: "0", out_trade_no: "order-1", total_fee: "9.90" };
    const signed = { ...params, sign: signParams(params, "secret") };

    expect(verifySignature({ ...signed, total_fee: "0.01" }, "secret")).toBe(false);
  });

  it("rejects a wrong secret and a missing sign", () => {
    const params = { code: "0" };

    expect(verifySignature({ ...params, sign: signParams(params, "secret") }, "other")).toBe(false);
    expect(verifySignature({ code: "0" }, "secret")).toBe(false);
  });
});
