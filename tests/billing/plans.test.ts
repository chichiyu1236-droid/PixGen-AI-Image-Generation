import { describe, expect, it } from "vitest";
import { getMembershipPlan, membershipPlans, yearlySavingsPercent } from "@/lib/billing/plans";

describe("membership plan catalog", () => {
  it("exposes the four launch SKUs with the agreed pricing", () => {
    expect(membershipPlans.map((plan) => plan.id)).toEqual(["std-month", "std-year", "pro-month", "pro-year"]);
    expect(getMembershipPlan("std-month")).toMatchObject({
      quotaPerTranche: 100,
      tranches: 1,
      periodDays: 30,
      amountFen: 1990,
    });
    expect(getMembershipPlan("std-year")).toMatchObject({
      quotaPerTranche: 100,
      tranches: 12,
      periodDays: 365,
      amountFen: 19900,
    });
    expect(getMembershipPlan("pro-month")).toMatchObject({
      quotaPerTranche: 300,
      tranches: 1,
      periodDays: 30,
      amountFen: 4990,
    });
    expect(getMembershipPlan("pro-year")).toMatchObject({
      quotaPerTranche: 300,
      tranches: 12,
      periodDays: 365,
      amountFen: 49900,
    });
  });

  it("returns undefined for unknown plan ids", () => {
    expect(getMembershipPlan("mega-9999")).toBeUndefined();
  });

  it("computes yearly savings against the same tier's monthly card", () => {
    expect(yearlySavingsPercent(getMembershipPlan("std-year")!)).toBe(17);
    expect(yearlySavingsPercent(getMembershipPlan("pro-year")!)).toBe(17);
    expect(yearlySavingsPercent(getMembershipPlan("std-month")!)).toBe(0);
  });
});
