export type MembershipPlan = {
  id: string;
  name: string;
  /** Credits granted per 30-day period. */
  quotaPerTranche: number;
  /** Total periods: 1 for monthly cards, 12 for yearly cards. */
  tranches: number;
  /** Membership window length in days: 30 or 365. */
  periodDays: number;
  amountFen: number;
  description: string;
};

export const membershipPlans: readonly MembershipPlan[] = [
  {
    id: "std-month",
    name: "标准月卡",
    quotaPerTranche: 100,
    tranches: 1,
    periodDays: 30,
    amountFen: 1990,
    description: "每期 100 张，会员期 30 天",
  },
  {
    id: "std-year",
    name: "标准年卡",
    quotaPerTranche: 100,
    tranches: 12,
    periodDays: 365,
    amountFen: 19900,
    description: "每 30 天发放 100 张，共 12 期",
  },
  {
    id: "pro-month",
    name: "Pro 月卡",
    quotaPerTranche: 300,
    tranches: 1,
    periodDays: 30,
    amountFen: 4990,
    description: "每期 300 张，会员期 30 天",
  },
  {
    id: "pro-year",
    name: "Pro 年卡",
    quotaPerTranche: 300,
    tranches: 12,
    periodDays: 365,
    amountFen: 49900,
    description: "每 30 天发放 300 张，共 12 期",
  },
];

export function getMembershipPlan(planId: string): MembershipPlan | undefined {
  return membershipPlans.find((plan) => plan.id === planId);
}

/** Yearly billing saves ~17% versus paying monthly twelve times. */
export const YEARLY_DISCOUNT_PERCENT = 17;

/** Savings of a yearly card versus twelve monthly payments; 0 for non-yearly plans. */
export function yearlySavingsPercent(plan: MembershipPlan): number {
  if (plan.periodDays !== 365) {
    return 0;
  }

  const monthly = membershipPlans.find(
    (candidate) =>
      candidate.quotaPerTranche === plan.quotaPerTranche && candidate.periodDays === 30,
  );

  if (!monthly) {
    return 0;
  }

  const fullPrice = monthly.amountFen * 12;

  return Math.round(((fullPrice - plan.amountFen) / fullPrice) * 100);
}
