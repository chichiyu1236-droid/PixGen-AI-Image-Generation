export function CreditBadge({ credits }: { credits: number }) {
  return (
    <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      剩余积分：{credits}
    </div>
  );
}
