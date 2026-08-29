import Link from "next/link";
import type { CreditBalance } from "@/lib/auth/balance";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Renewal reminder shown during the last 3 days of an active membership. */
export function MembershipNotice({ balance }: { balance: CreditBalance }) {
  if (!balance.membershipActive || !balance.paidUntil) {
    return null;
  }

  const remainingMs = new Date(balance.paidUntil).getTime() - Date.now();

  if (remainingMs > THREE_DAYS_MS) {
    return null;
  }

  const days = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  return (
    <div className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-amber-300/60 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
      <span>
        你的会员将于 {balance.paidUntil.slice(0, 10)} 到期（剩 {days} 天），订阅池积分到期会清零。续费或升级立即发放新一期额度。
      </span>
      <Link
        className="rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:bg-amber-800"
        href="/upgrade"
      >
        去续费
      </Link>
    </div>
  );
}
