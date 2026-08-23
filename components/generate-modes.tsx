"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export function GenerateModes({
  initialMode,
  classicForm,
  agentWorkbench,
}: {
  initialMode: "classic" | "agent";
  classicForm: ReactNode;
  agentWorkbench: ReactNode;
}) {
  const [mode, setMode] = useState<"classic" | "agent">(initialMode);

  useEffect(() => {
    // Keep the mode shareable/refreshable without remounting either pane.
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    window.history.replaceState(null, "", url.toString());
  }, [mode]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 grid shrink-0 gap-4 md:grid-cols-2">
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
          onClick={() => setMode("agent")}
          eyebrow="AGENT"
          title="Agent 对话"
          description="哪怕只有一句模糊的感觉也可以。Agent 帮你澄清想法、写好提示词，生成后还能继续对话修改。"
          who="还没想好，聊聊看"
          highlight
        />
      </div>

      <div className={`min-h-0 flex-1 ${mode === "classic" ? "" : "hidden"}`}>{classicForm}</div>
      <div className={`min-h-0 flex-1 ${mode === "agent" ? "" : "hidden"}`}>{agentWorkbench}</div>
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
}: {
  active: boolean;
  onClick: () => void;
  eyebrow: string;
  title: string;
  description: string;
  who: string;
  highlight?: boolean;
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
      {highlight ? (
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
      {active ? (
        <span className="absolute bottom-4 right-5 grid h-5.5 w-5.5 place-items-center rounded-full bg-black text-[11px] text-white">
          ✓
        </span>
      ) : null}
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
