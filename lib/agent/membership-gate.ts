import "server-only";

import { getCreditBalance, type CreditBalance } from "@/lib/auth/balance";

/** Error code returned to clients when a non-member touches agent endpoints. */
export const AGENT_MEMBERSHIP_REQUIRED = "agent_membership_required";

export type AgentMembershipGate =
  | { allowed: true; balance: CreditBalance }
  | { allowed: false };

/**
 * Agent mode is members-only. The gate reads the balance through the lazy
 * membership engine (which also settles expiries and due tranches) and fails
 * closed on read errors: an availability hiccup must never open agent access.
 */
export async function requireAgentMembership(
  supabase: unknown,
  userId: string,
): Promise<AgentMembershipGate> {
  try {
    const balance = await getCreditBalance(supabase, userId);

    if (!balance.membershipActive) {
      return { allowed: false };
    }

    return { allowed: true, balance };
  } catch {
    return { allowed: false };
  }
}
