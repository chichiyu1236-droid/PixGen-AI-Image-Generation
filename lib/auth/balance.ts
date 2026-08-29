export type CreditBalance = {
  permanentCredits: number;
  subCredits: number;
  subCreditsExpiresAt: string | null;
  planId: string | null;
  paidUntil: string | null;
  membershipActive: boolean;
  totalCredits: number;
};

/** Fallback for read failures so pages still render a zeroed badge. */
export const EMPTY_BALANCE: CreditBalance = {
  permanentCredits: 0,
  subCredits: 0,
  subCreditsExpiresAt: null,
  planId: null,
  paidUntil: null,
  membershipActive: false,
  totalCredits: 0,
};

type BalanceRow = {
  permanentCredits?: number;
  subCredits?: number;
  subCreditsExpiresAt?: string | null;
  planId?: string | null;
  paidUntil?: string | null;
  membershipActive?: boolean;
  totalCredits?: number;
};

type BalanceClient = {
  rpc: (fn: "evaluate_membership", args: { p_user_id: string }) => {
    data: BalanceRow | BalanceRow[] | null;
    error: { message: string } | null;
  };
};

/**
 * Reads the dual-pool balance through the lazy membership engine RPC: every
 * call also drives period expiry, skipped-period forfeits and due tranche
 * grants, so all balance reads keep the membership state fresh without cron.
 */
export async function getCreditBalance(supabase: unknown, userId: string): Promise<CreditBalance> {
  const client = supabase as BalanceClient;
  const { data, error } = await client.rpc("evaluate_membership", { p_user_id: userId });

  if (error) {
    throw new Error(`Unable to evaluate membership: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error("Unable to evaluate membership: empty result");
  }

  const permanentCredits = row.permanentCredits ?? 0;
  const subCredits = row.subCredits ?? 0;

  return {
    permanentCredits,
    subCredits,
    subCreditsExpiresAt: row.subCreditsExpiresAt ?? null,
    planId: row.planId ?? null,
    paidUntil: row.paidUntil ?? null,
    membershipActive: row.membershipActive ?? false,
    totalCredits: row.totalCredits ?? permanentCredits + subCredits,
  };
}
