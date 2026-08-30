"use client";

import { Lock, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export function GenerateModes({
  initialMode,
  membershipActive,
  classicForm,
  agentWorkbench,
}: {
  initialMode: "classic" | "agent";
  membershipActive: boolean;
  classicForm: ReactNode;
  agentWorkbench: ReactNode;
}) {
  const [mode, setMode] = useState<"classic" | "agent">(initialMode);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    // Keep the mode shareable/refreshable without remounting either pane.
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    window.history.replaceState(null, "", url.toString());
  }, [mode]);

  return (
    <div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ModeCard
          active={mode === "classic"}
          onClick={() => setMode("classic")}
          eyebrow="CLASSIC"
          title="经典生成"
          description="选好画面方向，写下主体和细节，一步到位出图。适合心里已经有大致画面的用户。"
          who="我有大致想法"
        />
        <ModeCard
          active={mode === "agent"}
          onClick={() => (membershipActive ? setMode("agent") : setShowUpgrade(true))}
          eyebrow="AGENT"
          title="Agent 对话"
          description="哪怕只有一句模糊的感觉也可以。Agent 帮你澄清想法、写好提示词，生成后还能继续对话修改。"
          who="还没想好，聊聊看"
          highlight
          locked={!membershipActive}
        />
      </div>

      <div className={mode === "classic" ? "" : "hidden"}>{classicForm}</div>
      <div className={mode === "agent" ? "" : "hidden"}>{agentWorkbench}</div>

      {showUpgrade ? <AgentUpgradeDialog onClose={() => setShowUpgrade(false)} /> : null}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  eyebrow,
  title,
  description,
  who,
  highlight,
  locked,
}: {
  active: boolean;
  onClick: () => void;
  eyebrow: string;
  title: string;
  description: string;
  who: string;
  highlight?: boolean;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative rounded-[2rem] border p-5 text-left transition ${
        active
          ? "border-black/55 bg-white/92 shadow-[0_24px_70px_rgba(0,0,0,0.045)]"
          : "border-black/10 bg-white/60 hover:border-black/25"
      }`}
    >
      {locked ? (
        <span className="absolute right-5 top-4 inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-black/55">
          <Lock size={11} aria-hidden /> 会员专属
        </span>
      ) : highlight ? (
        <span className="absolute right-5 top-4 rounded-full bg-[#47624c] px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
          NEW
        </span>
      ) : null}
      <p className="font-display text-[15px] tracking-[0.16em] text-black/38">{eyebrow}</p>
      <h2 className="mt-2 text-[22px] font-normal text-black">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-6 text-black/55">{description}</p>
      <span
        className={`mt-2.5 inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
          active ? "border-black bg-black text-[#fffdf8]" : "border-black/15 bg-white text-black/66"
        }`}
      >
        {who}
      </span>
    </button>
  );
}

export function AgentModeHint() {
  return (
    <p className="flex items-center gap-2 text-sm text-black/52">
      <Sparkles size={16} aria-hidden /> Agent 模式由对话驱动，消耗积分与经典模式一致
    </p>
  );
}

function AgentUpgradeDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-6" role="dialog" aria-modal="true" aria-label="升级会员">
      <div className="w-full max-w-md rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.12)]">
        <div className="flex justify-end">
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-black/40 hover:text-black">
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="font-display text-2xl tracking-[0.12em] text-black/40">MEMBER</p>
        <h3 className="mt-2 text-2xl font-light text-black">Agent 对话是会员专属</h3>
        <p className="mt-3 text-sm leading-6 text-black/60">
          开通标准或 Pro 会员卡即可使用 Agent 对话工作台：聊聊想法就能出图，还能继续对话改图。
        </p>
        <Link
          href="/upgrade"
          className="mt-6 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/90"
        >
          查看会员方案
        </Link>
      </div>
    </div>
  );
}
