import Link from "next/link";

export default function UpgradePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <section className="max-w-lg rounded-lg border border-ink/10 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-clay">Credits</p>
        <h1 className="mt-2 text-3xl font-bold">升级入口即将开放</h1>
        <p className="mt-4 leading-7 text-ink/70">当前版本暂不接入真实支付。后续你可以在这里获取更多生成积分。</p>
        <Link className="mt-6 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-white" href="/generate">
          返回生成页
        </Link>
      </section>
    </main>
  );
}
