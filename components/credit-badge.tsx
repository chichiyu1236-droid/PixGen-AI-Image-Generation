import type { CreditBalance } from "@/lib/auth/balance";

function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function CreditBadge({ balance, compact = false }: { balance: CreditBalance; compact?: boolean }) {
  return (
    <div
      className={[
        "rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/92 text-[#171916] shadow-[0_8px_24px_rgba(23,25,22,0.04)] tabular-nums",
        compact ? "px-3 py-2 text-[11px]" : "px-4 py-2.5 text-sm",
      ].join(" ")}
    >
      {balance.membershipActive ? (
        <div className="flex flex-col gap-0.5 leading-snug">
          <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-[#171916]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#566c58]" aria-hidden />
            <span>
              会员 {balance.subCredits} 张 · {formatDate(balance.paidUntil)}到期
            </span>
          </span>
          <span className="pl-3 text-[11px] font-medium text-[#6d7368]">永久积分 {balance.permanentCredits}</span>
        </div>
      ) : balance.paidUntil ? (
        <div className="flex flex-col gap-0.5 leading-snug">
          <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-[#8a6a3f]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#b48a52]" aria-hidden />
            <span>会员已过期</span>
          </span>
          <span className="pl-3 font-semibold text-[#171916]">永久积分 {balance.permanentCredits}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-[#171916]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#596e7c]" aria-hidden />
          <span>剩余积分：{balance.permanentCredits}</span>
        </div>
      )}
    </div>
  );
}
