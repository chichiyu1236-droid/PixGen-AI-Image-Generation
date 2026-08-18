import Link from "next/link";

export function UpgradePrompt() {
  return (
    <div className="rounded-[1.5rem] border border-black/10 bg-white p-5 shadow-[0_18px_50px_rgba(0,0,0,0.04)]">
      <p className="font-display text-2xl tracking-[0.08em] text-black/40">CREDIT</p>
      <h2 className="mt-3 text-2xl font-light text-black">积分不足</h2>
      <p className="mt-3 text-sm leading-6 text-black/60">当前没有可用积分。你可以稍后再试，或联系管理员补发测试积分。</p>
      <Link className="mt-5 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/90" href="/upgrade">
        查看积分入口
      </Link>
    </div>
  );
}
