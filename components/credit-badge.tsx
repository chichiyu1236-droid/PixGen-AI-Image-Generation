export function CreditBadge({ credits }: { credits: number }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-semibold shadow-sm">
      剩余积分：{credits}
    </div>
  );
}
