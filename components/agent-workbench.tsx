"use client";

import { Check, Download, Loader2, RefreshCw, Send } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type TraceItem = {
  type: "step" | "tool" | "image";
  name?: string;
  status?: "running" | "done" | "failed";
  costCredits?: number;
  detail?: string;
  argsSummary?: string;
  generationId?: string;
  imageUrl?: string;
  version?: string;
  origin?: "agent" | "agent_edit" | "agent_variant" | "classic";
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: TraceItem[];
  created_at: string;
};

type CanvasItem = {
  generationId: string;
  imageUrl: string;
  origin: "agent" | "agent_edit" | "agent_variant" | "classic";
  version: string;
  basedOn: string | null;
  promptSummary: string;
  createdAt: string;
};

const ORIGIN_LABEL: Record<CanvasItem["origin"], string> = {
  agent: "生成",
  agent_edit: "改图",
  agent_variant: "变体",
  classic: "经典",
};

const WELCOME_HINTS = [
  "我想发个小红书，但完全没想好要什么图",
  "做一张高端护肤品的电商海报，极简风格",
];

export function AgentWorkbench({ credits }: { credits: number }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [canvas, setCanvas] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    // Resume the most recent session so a refresh keeps the conversation.
    void (async () => {
      try {
        const listResponse = await fetch("/api/agent/sessions", { cache: "no-store" });
        if (!listResponse.ok) return;
        const { sessions } = (await listResponse.json()) as { sessions: { id: string }[] };

        if (!sessions?.length) return;

        const detailResponse = await fetch(`/api/agent/sessions/${sessions[0].id}`, { cache: "no-store" });
        if (!detailResponse.ok) return;
        const detail = (await detailResponse.json()) as { session: { id: string }; messages: ChatMessage[]; canvas: CanvasItem[] };
        setSessionId(detail.session.id);
        setMessages(detail.messages ?? []);
        setCanvas(detail.canvas ?? []);
        scrollToEnd();
      } catch {
        // First visit or transient network issue: start from the welcome state.
      }
    })();
  }, [scrollToEnd]);

  async function send(text: string) {
    const trimmed = text.trim();

    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: trimmed, created_at: new Date().toISOString() },
    ]);
    scrollToEnd();

    try {
      let currentSession = sessionId;

      if (!currentSession) {
        const created = await fetch("/api/agent/sessions", { method: "POST" });
        const createdBody = (await created.json()) as { session?: { id: string }; error?: string };

        if (!created.ok || !createdBody.session) {
          throw new Error(createdBody.error ?? "session_create_failed");
        }

        currentSession = createdBody.session.id;
        setSessionId(currentSession);
      }

      const response = await fetch(`/api/agent/sessions/${currentSession}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, selectedGenerationId: selectedId }),
      });
      const body = (await response.json()) as {
        userMessage?: ChatMessage;
        assistantMessage?: ChatMessage;
        canvas?: CanvasItem[];
        error?: string;
      };

      if (!response.ok || !body.assistantMessage) {
        throw new Error(body.error ?? "message_failed");
      }

      setMessages((prev) => [
        ...prev.filter((message) => message.id !== body.userMessage?.id || message.role !== "user"),
        body.userMessage!,
        body.assistantMessage!,
      ]);
      setCanvas(body.canvas ?? []);
      setSpent((current) => current + (body.assistantMessage?.trace ?? []).reduce((sum, item) => sum + (item.type === "tool" ? item.costCredits ?? 0 : 0), 0));

      const latest = body.canvas?.at(-1);

      if (latest && (latest.origin === "agent" || latest.origin === "agent_edit")) {
        setSelectedId(latest.generationId);
      }

      scrollToEnd();
    } catch (caught) {
      setError(caught instanceof Error && caught.message !== "message_failed" ? caught.message : "发送失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function newSession() {
    if (busy) return;

    try {
      const response = await fetch("/api/agent/sessions", { method: "POST" });
      const body = (await response.json()) as { session?: { id: string } };

      if (!response.ok || !body.session) {
        setError("新会话创建失败，请稍后重试。");
        return;
      }

      setSessionId(body.session.id);
      setMessages([]);
      setCanvas([]);
      setSelectedId(null);
      setError(null);
      setSpent(0);
    } catch {
      setError("网络异常，请稍后重试。");
    }
  }

  const selected = canvas.find((item) => item.generationId === selectedId) ?? null;
  const hasMessages = messages.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[430px_1fr]">
      <section className="flex flex-col rounded-[2rem] border border-black/10 bg-white/88 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.045)] backdrop-blur">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-4">
          <div>
            <p className="font-display text-2xl tracking-[0.12em] text-black/40">DIALOGUE</p>
            <h2 className="mt-1.5 text-3xl font-light text-black">和 Agent 聊</h2>
          </div>
          <button
            type="button"
            onClick={newSession}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm font-medium text-black transition hover:border-black/25"
          >
            <RefreshCw size={14} aria-hidden /> 新会话
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1 lg:max-h-[520px]">
          {!hasMessages ? (
            <div className="rounded-[1.25rem] border border-black/10 bg-[#f8faf7] p-4 text-sm leading-7 text-black/72">
              <p className="font-display text-[13px] tracking-[0.18em] text-black/38">AGENT</p>
              <p className="mt-2">
                不知道想要什么也没关系——哪怕只有一句模糊的感觉也可以。你可以直接说一句想生成什么，或者让我问几个小问题帮你把想法聊清楚。每一步的计划和积分消耗都会展示出来。
              </p>
            </div>
          ) : null}

          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} onSelect={(id) => setSelectedId(id)} />
          ))}

          {busy ? (
            <div className="flex items-center gap-2 text-sm text-black/52">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Agent 正在思考…
            </div>
          ) : null}

          {error ? <p className="rounded-[1.25rem] bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="mt-4 border-t border-black/10 pt-4">
          {selected ? (
            <div className="mb-2.5 flex items-center gap-2 rounded-[1rem] border border-[#47624c]/25 bg-[#eef4ee] px-3 py-2 text-xs text-black/60">
              ✎ 正在编辑 <b className="text-[#47624c]">{selected.version}</b> 的基础上继续修改
              <button type="button" className="ml-auto text-black/40 hover:text-black" onClick={() => setSelectedId(null)} aria-label="取消选择">
                ✕
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-2.5 rounded-[1.25rem] border border-black/10 bg-[#f8faf7] px-4 py-2.5 transition focus-within:border-black/30 focus-within:bg-white">
            <textarea
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              placeholder="不知道想要什么也没关系，随便说一句…"
              className="max-h-26 flex-1 resize-none border-none bg-transparent text-sm leading-6 text-black outline-none placeholder:text-black/42"
            />
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={() => void send(input)}
              className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-full bg-black text-white transition disabled:opacity-35"
              aria-label="发送"
            >
              <Send size={15} aria-hidden />
            </button>
          </div>

          {!hasMessages ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {WELCOME_HINTS.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => void send(hint)}
                  className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-black/55 transition hover:border-black/30 hover:text-black"
                >
                  {hint}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex min-h-[620px] flex-col rounded-[2rem] border border-black/10 bg-white/78 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.045)] backdrop-blur">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-4">
          <div>
            <p className="font-display text-2xl tracking-[0.12em] text-black/40">CANVAS</p>
            <h2 className="mt-1.5 text-3xl font-light text-black">画布</h2>
          </div>
          <p className="text-sm text-black/52">
            {canvas.length} 张作品 · 点击图片选中后，在左侧说怎么改（剩余积分：{Math.max(0, credits - spent)}）
          </p>
        </div>

        {canvas.length === 0 ? (
          <div className="grid min-h-[470px] flex-1 place-items-center rounded-[1.5rem] border border-dashed border-black/15 bg-[#f8faf7] text-center">
            <div className="max-w-sm px-6">
              <p className="font-display text-3xl tracking-[0.12em] text-black/36">EMPTY</p>
              <p className="mt-3.5 text-lg font-light text-black">聊出来的图会出现在这里</p>
              <p className="mt-1.5 text-sm leading-6 text-black/52">每次生成的结果都会钉在画布上，选中任意一张即可继续对话修改。</p>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(215px,1fr))] gap-4 overflow-y-auto">
            {canvas.map((item) => (
              <CanvasCard
                key={item.generationId}
                item={item}
                selected={item.generationId === selectedId}
                onSelect={() => setSelectedId(item.generationId)}
                onVariant={() => void send("给这张图生成两个不同配色的变体")}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ChatBubble({ message, onSelect }: { message: ChatMessage; onSelect: (id: string) => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-[1.25rem_1.25rem_6px_1.25rem] bg-black px-4 py-3 text-sm leading-6 text-[#fffdf8]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="font-display text-[13px] tracking-[0.18em] text-black/38">AGENT</p>
      {message.content ? (
        <div className="max-w-[94%] whitespace-pre-wrap rounded-[6px_1.25rem_1.25rem_1.25rem] border border-black/10 bg-[#f8faf7] px-4 py-3 text-sm leading-7 text-black">
          {message.content}
        </div>
      ) : null}
      {(message.trace ?? []).map((item, index) => (
        <TraceRow key={index} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TraceRow({ item, onSelect }: { item: TraceItem; onSelect: (id: string) => void }) {
  if (item.type === "step") {
    return (
      <div className={`flex items-center gap-2.5 text-[13px] ${item.status === "failed" ? "text-red-700" : "text-black/62"}`}>
        <span
          className={`grid h-4 w-4 place-items-center rounded-full border text-[9px] ${
            item.status === "failed" ? "border-red-500 bg-red-500 text-white" : "border-black bg-black text-white"
          }`}
        >
          {item.status === "failed" ? "✕" : "✓"}
        </span>
        {item.name}
      </div>
    );
  }

  if (item.type === "tool") {
    return (
      <details className="group rounded-[1rem] border border-black/10 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[1rem] bg-[#eef4ee] px-3.5 py-2.5 text-[12px] font-semibold text-[#2f4636]">
          ⚙ {item.name}
          {item.costCredits ? <span className="ml-auto rounded-full border border-black/15 bg-white px-2 py-0.5 text-[11px] text-black/55">−{item.costCredits} 积分</span> : null}
          <span className="text-black/35 transition group-open:rotate-90">▶</span>
        </summary>
        <div className="border-t border-dashed border-black/10 px-3.5 py-3 font-mono text-[11px] leading-6 text-black/55">
          {item.argsSummary ? <p>{item.argsSummary}</p> : null}
          {item.detail ? <p className="text-red-700">error: {item.detail}</p> : null}
        </div>
      </details>
    );
  }

  if (!item.imageUrl) return null;

  return (
    <button
      type="button"
      onClick={() => item.generationId && onSelect(item.generationId)}
      className="relative block w-40 overflow-hidden rounded-[1rem] border border-black/10 transition hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(0,0,0,0.1)]"
    >
      <Image src={item.imageUrl} alt={`生成结果 ${item.version ?? ""}`.trim()} width={160} height={160} unoptimized className="block h-auto w-full" />
      {item.version ? (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9.5px] text-white">{item.version}</span>
      ) : null}
    </button>
  );
}

function CanvasCard({ item, selected, onSelect, onVariant }: { item: CanvasItem; selected: boolean; onSelect: () => void; onVariant: () => void }) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[1.5rem] border bg-white transition ${
        selected ? "border-[#47624c] shadow-[0_0_0_3px_rgba(71,98,76,0.16)]" : "border-black/10 hover:shadow-[0_14px_40px_rgba(0,0,0,0.08)]"
      }`}
    >
      <button type="button" onClick={onSelect} className="relative block bg-[#f8faf7]" aria-label={`选中 ${item.version}`}>
        <Image src={item.imageUrl} alt={`画布作品 ${item.version}`} width={430} height={430} unoptimized className="block h-auto w-full" />
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9.5px] text-white backdrop-blur">{item.version}</span>
        {selected ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#47624c] px-2 py-0.5 text-[10.5px] font-semibold text-white">
            <Check size={10} aria-hidden /> 编辑对象
          </span>
        ) : null}
      </button>
      <div className="flex flex-col gap-1.5 p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <span className="rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[9.5px] font-bold text-black/62">{ORIGIN_LABEL[item.origin]}</span>
          {item.promptSummary.slice(0, 18)}…
        </p>
        {item.basedOn ? <p className="text-[11.5px] leading-4 text-black/48">基于 {item.basedOn} 修改</p> : null}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onSelect}
            className={`flex-1 rounded-full border px-1 py-1.5 text-[11.5px] transition ${
              selected ? "border-[#47624c] bg-[#47624c] text-white" : "border-black bg-black text-white hover:bg-black/90"
            }`}
          >
            选中编辑
          </button>
          <button type="button" onClick={onVariant} className="flex-1 rounded-full border border-black/12 bg-white px-1 py-1.5 text-[11.5px] text-black/66 transition hover:border-black/35 hover:text-black">
            变体
          </button>
          <a
            href={item.imageUrl}
            download
            className="grid flex-1 place-items-center rounded-full border border-black/12 bg-white px-1 py-1.5 text-black/66 transition hover:border-black/35 hover:text-black"
            aria-label="下载图片"
          >
            <Download size={13} aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}
