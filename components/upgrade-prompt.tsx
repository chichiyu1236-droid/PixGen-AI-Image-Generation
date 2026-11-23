import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export function UpgradePrompt() {
  return (
    <div className="mb-4 rounded-2xl border border-[#b48a52]/30 bg-[#f6efe2]/92 p-5 shadow-[0_12px_32px_rgba(23,25,22,0.04)]">
      <p className="font-display text-xs tracking-[0.2em] text-[#8a6a3f]">CREDIT</p>
      <h2 className="mt-1.5 font-display text-xl font-normal text-[#171916]">积分不足</h2>
      <p className="mt-2 text-sm leading-6 text-[#484e45]">
        当前没有可用积分。开通会员卡即可获得每期生成额度，并解锁 Agent 对话工作台。
      </p>
      <Link
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#171916] px-5 py-2 text-xs font-medium text-[#faf7ef] transition hover:bg-[#2c3029]"
        href="/upgrade"
      >
        查看会员方案
        <ArrowUpRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
