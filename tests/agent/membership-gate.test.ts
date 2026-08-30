import { beforeEach, describe, expect, it, vi } from "vitest";

const balanceState = vi.hoisted(() => ({
  result: null as { data: unknown; error: { message: string } | null } | null,
  throws: false,
}));

vi.mock("@/lib/auth/balance", () => ({
  getCreditBalance: vi.fn(async () => {
    if (balanceState.throws) {
      throw new Error("rpc unavailable");
    }

    if (balanceState.result?.error) {
      throw new Error(balanceState.result.error.message);
    }

    const row = balanceState.result?.data;
    const value = Array.isArray(row) ? row[0] : row;

    return {
      permanentCredits: value?.permanentCredits ?? 0,
      subCredits: value?.subCredits ?? 0,
      subCreditsExpiresAt: value?.subCreditsExpiresAt ?? null,
      planId: value?.planId ?? null,
      paidUntil: value?.paidUntil ?? null,
      membershipActive: value?.membershipActive ?? false,
      totalCredits: (value?.permanentCredits ?? 0) + (value?.subCredits ?? 0),
    };
  }),
}));

import { AGENT_MEMBERSHIP_REQUIRED, requireAgentMembership } from "@/lib/agent/membership-gate";

const USER_ID = "44444444-4444-4444-4444-444444444444";

function memberBalance(overrides: Record<string, unknown> = {}) {
  return {
    result: {
      data: { permanentCredits: 0, subCredits: 100, membershipActive: true, totalCredits: 100, ...overrides },
      error: null,
    },
  };
}

beforeEach(() => {
  balanceState.result = null;
  balanceState.throws = false;
});

describe("requireAgentMembership", () => {
  it("allows active members and returns the evaluated balance", async () => {
    balanceState.result = memberBalance().result;

    const gate = await requireAgentMembership({}, USER_ID);

    expect(gate.allowed).toBe(true);

    if (gate.allowed) {
      expect(gate.balance.totalCredits).toBe(100);
      expect(gate.balance.membershipActive).toBe(true);
    }
  });

  it("denies non-members even when they hold permanent credits", async () => {
    balanceState.result = {
      data: { permanentCredits: 5, subCredits: 0, membershipActive: false, totalCredits: 5 },
      error: null,
    };

    const gate = await requireAgentMembership({}, USER_ID);

    expect(gate).toEqual({ allowed: false });
    expect(AGENT_MEMBERSHIP_REQUIRED).toBe("agent_membership_required");
  });

  it("fails closed when the balance read errors", async () => {
    balanceState.throws = true;

    const gate = await requireAgentMembership({}, USER_ID);

    expect(gate).toEqual({ allowed: false });
  });
});
