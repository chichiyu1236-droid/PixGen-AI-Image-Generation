import { AlertCircle } from "lucide-react";
import Link from "next/link";
import type { CreditBalance } from "@/lib/auth/balance";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Renewal reminder shown during the last 3 days of an active membership. */
export function MembershipNotice({
  balance,
  compact = false,
}: {
  balance: CreditBalance;
  compact?: boolean;
}) {
  if (!balance.membershipActive || !balance.paidUntil) {
    return null;
  }

  const remainingMs = new Date(balance.paidUntil).getTime() - Date.now();

  if (remainingMs > THREE_DAYS_MS) {
    return null;
  }

  const days = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  return (
    <div
      className={[
        "flex flex-wrap items-center justify-between gap-3 border border-[#b48a52]/30 bg-[#f6ebd9]/90 text-[#5a411e] tabular-nums",
        compact
          ? "rounded-2xl px-4 py-2.5 text-xs leading-5"
          : "mx-auto mb-5 max-w-6xl rounded-2xl px-5 py-3.5 text-sm leading-6",
      ].join(" ")}
    >
      <span className="flex items-center gap-2">
        <AlertCircle size={15} className="shrink-0 text-[#9c7239]" aria-hidden />
        <span>
          你的会员将于 {balance.paidUntil.slice(0, 10)} 到期（剩 {days} 天），订阅池积分到期会清零。续费或升级立即发放新一期额度。
        </span>
      </span>
      <Link
        className="shrink-0 rounded-full bg-[#171916] px-4 py-1.5 text-xs font-medium text-[#faf7ef] transition hover:bg-[#2c3029]"
        href="/upgrade"
      >
        去续费
      </Link>
    </div>
  );
}
