"use client";

import { Lock, MessageSquareText, SlidersHorizontal, Sparkles, X } from "lucide-react";
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Compact studio mode switcher bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/86 px-3.5 py-2.5 shadow-[0_10px_28px_rgba(23,25,22,0.035)] backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="创作模式切换">
          <button
            type="button"
            onClick={() => setMode("classic")}
            aria-pressed={mode === "classic"}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-left text-xs transition sm:text-sm",
              mode === "classic"
                ? "bg-[#171916] font-medium text-[#faf7ef] shadow-[0_8px_20px_rgba(23,25,22,0.14)]"
                : "border border-[#171916]/10 bg-[#f4f0e5]/75 text-[#484e45] hover:border-[#171916]/25 hover:text-[#171916]",
            ].join(" ")}
          >
            <SlidersHorizontal size={14} aria-hidden />
            <span>经典生成</span>
            <span
              className={`hidden rounded-full px-2 py-0.5 text-[10px] sm:inline-block ${
                mode === "classic" ? "bg-white/15 text-[#faf7ef]/85" : "bg-[#fbf9f3] text-[#6d7368]"
              }`}
            >
              我有大致想法
            </span>
          </button>

          <button
            type="button"
            onClick={() => (membershipActive ? setMode("agent") : setShowUpgrade(true))}
            aria-pressed={mode === "agent"}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-left text-xs transition sm:text-sm",
              mode === "agent"
                ? "bg-[#171916] font-medium text-[#faf7ef] shadow-[0_8px_20px_rgba(23,25,22,0.14)]"
                : "border border-[#171916]/10 bg-[#f4f0e5]/75 text-[#484e45] hover:border-[#171916]/25 hover:text-[#171916]",
            ].join(" ")}
          >
            <MessageSquareText size={14} aria-hidden />
            <span>Agent 对话</span>
            <span
              className={`hidden rounded-full px-2 py-0.5 text-[10px] sm:inline-block ${
                mode === "agent" ? "bg-white/15 text-[#faf7ef]/85" : "bg-[#fbf9f3] text-[#6d7368]"
              }`}
            >
              还没想好，聊聊看
            </span>
            {!membershipActive ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#b48a52]/35 bg-[#f4ead8] px-2 py-0.5 text-[10px] font-semibold text-[#7b5827]">
                <Lock size={10} aria-hidden /> 会员专属
              </span>
            ) : (
              <span className="rounded-full bg-[#384a3a] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#faf7ef]">
                AI
              </span>
            )}
          </button>
        </div>

        <p className="hidden text-xs text-[#6d7368] xl:block">
          {mode === "classic"
            ? "选择比例、风格与参考图，精准生成单张商业视觉"
            : "用自然语言聊出画面方向，选中画布任意版本多轮迭代"}
        </p>
      </div>

      {/* Both panes stay mounted in DOM; inactive wrapper uses exact "hidden" class */}
      <div className={mode === "classic" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>{classicForm}</div>
      <div className={mode === "agent" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>{agentWorkbench}</div>

      {showUpgrade ? <AgentUpgradeDialog onClose={() => setShowUpgrade(false)} /> : null}
    </div>
  );
}

export function AgentModeHint() {
  return (
    <p className="flex items-center gap-2 text-sm text-[#6d7368]">
      <Sparkles size={15} aria-hidden /> Agent 模式由对话驱动，消耗积分与经典模式一致
    </p>
  );
}

function AgentUpgradeDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#171916]/45 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="升级会员"
    >
      <div className="w-full max-w-md rounded-[2rem] border border-[#171916]/12 bg-[#fbf9f3] p-8 text-center shadow-[0_28px_72px_rgba(23,25,22,0.18)]">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-1.5 text-[#6d7368] transition hover:bg-[#eee9dc] hover:text-[#171916]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">MEMBER ATELIER</p>
        <h3 className="mt-2 font-display text-2xl font-normal text-[#171916]">Agent 对话是会员专属</h3>
        <p className="mt-3 text-sm leading-6 text-[#484e45]">
          开通标准或 Pro 会员卡即可使用 Agent 对话工作台：聊聊想法就能出图，还能选中画布作品继续对话改图与批量变体。
        </p>
        <Link
          href="/upgrade"
          className="mt-6 inline-flex rounded-full bg-[#171916] px-6 py-2.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
        >
          查看会员方案
        </Link>
      </div>
    </div>
  );
}
