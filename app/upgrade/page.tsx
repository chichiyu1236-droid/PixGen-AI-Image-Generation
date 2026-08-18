import Link from "next/link";

export default function UpgradePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--page-bg)] px-6 text-[var(--ink)]">
      <section className="w-full max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.06)]">
        <p className="font-display text-2xl tracking-[0.12em] text-black/40">UPGRADE</p>
        <h1 className="mt-2 text-3xl font-bold">更多积分入口即将开放</h1>
        <p className="mt-4 leading-7 text-black/70">更多积分获取方式还在准备中。测试期间可以联系管理员补发积分。</p>
        <Link className="mt-6 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/90" href="/generate">
          返回生成页
        </Link>
      </section>
    </main>
  );
}
