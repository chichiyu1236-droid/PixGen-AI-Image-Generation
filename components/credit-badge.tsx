import type { CreditBalance } from "@/lib/auth/balance";

function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function CreditBadge({ balance }: { balance: CreditBalance }) {
  return (
    <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      {balance.membershipActive ? (
        <span className="flex flex-col items-center leading-5">
          <span>
            会员 {balance.subCredits} 张 · {formatDate(balance.paidUntil)}到期
          </span>
          <span className="text-xs font-medium text-black/50">永久积分 {balance.permanentCredits}</span>
        </span>
      ) : balance.paidUntil ? (
        <span className="flex flex-col items-center leading-5">
          <span className="text-black/45">会员已过期</span>
          <span>永久积分 {balance.permanentCredits}</span>
        </span>
      ) : (
        <span>剩余积分：{balance.permanentCredits}</span>
      )}
    </div>
  );
}
