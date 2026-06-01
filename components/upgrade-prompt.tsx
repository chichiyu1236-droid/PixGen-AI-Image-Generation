import Link from "next/link";

export function UpgradePrompt() {
  return (
    <div className="border-l-4 border-clay bg-clay/10 p-4">
      <h2 className="font-semibold">积分不足</h2>
      <p className="mt-2 text-sm leading-6 text-ink/70">你当前没有可用积分。升级入口已预留，支付功能将在后续版本开放。</p>
      <Link className="mt-4 inline-block rounded-md bg-clay px-4 py-2 text-sm font-semibold text-white" href="/upgrade">
        查看升级入口
      </Link>
    </div>
  );
}
