"use client";

import {
  ChevronDown,
  Download,
  History,
  Loader2,
  Lock,
  Maximize2,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
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

type SessionSummary = {
  id: string;
  title?: string | null;
  created_at?: string;
  last_message_at?: string;
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

function formatSessionTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function AgentWorkbench({ credits, membershipActive }: { credits: number; membershipActive: boolean }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [canvas, setCanvas] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [membershipRequired, setMembershipRequired] = useState(!membershipActive);
  const [lightboxItem, setLightboxItem] = useState<CanvasItem | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const container = chatScrollRef.current;
      if (!container) return;
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    if (canvas.length > 0) {
      setViewIndex(canvas.length - 1);
    }
  }, [canvas.length]);

  useEffect(() => {
    if (!lightboxItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxItem]);

  /** Silently fetches session list; degrades to [] on error without blocking dialogue. */
  const fetchSessionList = useCallback(async (): Promise<SessionSummary[]> => {
    try {
      const response = await fetch("/api/agent/sessions", { cache: "no-store" });
      if (!response.ok) return [];
      const data = (await response.json()) as { sessions?: SessionSummary[] };
      const list = Array.isArray(data?.sessions) ? data.sessions : [];
      setSessions(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const loadSessionById = useCallback(
    async (id: string) => {
      setLoadingSessionId(id);
      try {
        const detailResponse = await fetch(`/api/agent/sessions/${id}`, { cache: "no-store" });
        if (!detailResponse.ok) return;
        const detail = (await detailResponse.json()) as {
          session?: { id: string };
          messages?: ChatMessage[];
          canvas?: CanvasItem[];
        };
        if (!detail.session?.id) return;
        setSessionId(detail.session.id);
        setMessages(detail.messages ?? []);
        setCanvas(detail.canvas ?? []);
        setSelectedId(null);
        setError(null);
        setHistoryOpen(false);
        scrollToEnd();
      } catch {
        // Silent fallback: keep current dialogue usable.
      } finally {
        setLoadingSessionId(null);
      }
    },
    [scrollToEnd],
  );

  useEffect(() => {
    // Resume the most recent session on load; silently fall back to empty welcome state.
    void (async () => {
      const list = await fetchSessionList();
      if (list.length > 0) {
        await loadSessionById(list[0].id);
      }
    })();
  }, [fetchSessionList, loadSessionById]);

  async function toggleHistoryDrawer() {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (nextOpen) {
      void fetchSessionList();
    }
  }

  async function send(text: string, options?: { selectedGenerationId?: string | null }) {
    const trimmed = text.trim();

    if (!trimmed || busy) return;

    if (membershipRequired) {
      setMembershipRequired(true);
      return;
    }

    setBusy(true);
    setError(null);
    setInput("");
    const localId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: localId, role: "user", content: trimmed, created_at: new Date().toISOString() },
    ]);
    scrollToEnd();

    try {
      let currentSession = sessionId;

      if (!currentSession) {
        const created = await fetch("/api/agent/sessions", { method: "POST" });
        const createdBody = (await created.json()) as { session?: SessionSummary; error?: string };

        if (!created.ok || !createdBody.session) {
          if (createdBody.error === "agent_membership_required") {
            setMembershipRequired(true);
            return;
          }
          throw new Error(createdBody.error ?? "session_create_failed");
        }

        currentSession = createdBody.session.id;
        setSessionId(currentSession);
        setSessions((prev) => [createdBody.session!, ...prev.filter((item) => item.id !== createdBody.session!.id)]);
      }

      const selectedGenerationId =
        options?.selectedGenerationId !== undefined ? options.selectedGenerationId : selectedId;
      const response = await fetch(`/api/agent/sessions/${currentSession}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, selectedGenerationId }),
      });
      const body = (await response.json()) as {
        userMessage?: ChatMessage;
        assistantMessage?: ChatMessage;
        canvas?: CanvasItem[];
        remainingCredits?: number | null;
        error?: string;
      };

      if (!response.ok || !body.assistantMessage) {
        if (body.error === "agent_membership_required") {
          setMembershipRequired(true);
          return;
        }
        throw new Error(body.error ?? "message_failed");
      }

      setMessages((prev) => [
        ...prev.filter((message) => message.id !== localId),
        body.userMessage!,
        body.assistantMessage!,
      ]);
      setCanvas(body.canvas ?? []);

      if (typeof body.remainingCredits === "number") {
        setBalance(body.remainingCredits);
        setSpent(0);
      } else {
        setSpent(
          (current) =>
            current +
            (body.assistantMessage?.trace ?? []).reduce(
              (sum, item) => sum + (item.type === "tool" ? item.costCredits ?? 0 : 0),
              0,
            ),
        );
      }

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
      const body = (await response.json()) as { session?: SessionSummary; error?: string };

      if (!response.ok || !body.session) {
        if (body.error === "agent_membership_required") {
          setMembershipRequired(true);
          return;
        }
        setError("新会话创建失败，请稍后重试。");
        return;
      }

      setSessionId(body.session.id);
      setSessions((prev) => [body.session!, ...prev.filter((item) => item.id !== body.session!.id)]);
      setMessages([]);
      setCanvas([]);
      setSelectedId(null);
      setError(null);
      setSpent(0);
      setHistoryOpen(false);
    } catch {
      setError("网络异常，请稍后重试。");
    }
  }

  const selected = canvas.find((item) => item.generationId === selectedId) ?? null;
  const hasMessages = messages.length > 0;
  const current = canvas[Math.min(viewIndex, canvas.length - 1)] ?? canvas[canvas.length - 1];
  const displayCredits = balance ?? Math.max(0, credits - spent);

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[400px_1fr] xl:grid-cols-[424px_1fr] lg:overflow-hidden">
      {/* LEFT PANEL: Agent Dialogue + History Session Switcher */}
      <section className="relative flex min-h-[520px] flex-col overflow-hidden rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/90 p-4 shadow-[0_18px_50px_rgba(23,25,22,0.045)] backdrop-blur-md lg:min-h-0 lg:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#171916]/8 pb-3">
          <div>
            <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">DIALOGUE</p>
            <h2 className="mt-0.5 font-display text-xl font-normal text-[#171916]">和 Agent 聊</h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void toggleHistoryDrawer()}
              aria-expanded={historyOpen}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                historyOpen
                  ? "border-[#171916] bg-[#171916] text-[#faf7ef]"
                  : "border-[#171916]/12 bg-[#f4f0e5]/80 text-[#484e45] hover:border-[#171916]/25 hover:text-[#171916]",
              ].join(" ")}
            >
              <History size={13} aria-hidden />
              <span>历史对话</span>
              {sessions.length > 0 ? (
                <span
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    historyOpen ? "bg-white/20 text-[#faf7ef]" : "bg-[#fbf9f3] text-[#6d7368]"
                  }`}
                >
                  {sessions.length}
                </span>
              ) : null}
              <ChevronDown size={12} className={`transition ${historyOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>

            <button
              type="button"
              onClick={() => void newSession()}
              className="inline-flex items-center gap-1 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3 py-1.5 text-xs font-medium text-[#171916] transition hover:border-[#171916]/30"
            >
              <Plus size={13} aria-hidden />
              <span>新建对话</span>
            </button>
          </div>
        </div>

        {/* Collapsible History Session Drawer */}
        {historyOpen ? (
          <div className="mb-3 max-h-52 overflow-y-auto rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/92 p-2.5 shadow-inner studio-scroll">
            <div className="mb-1.5 flex items-center justify-between px-1.5 text-[11px] text-[#6d7368]">
              <span>最近会话（点击切换）</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-[#6d7368] hover:text-[#171916]"
                aria-label="收起历史对话列表"
              >
                收起
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="rounded-xl bg-[#fbf9f3]/80 px-3 py-3 text-center text-xs text-[#6d7368]">
                暂无历史会话，发送第一句话即自动保存。
              </p>
            ) : (
              <ul className="space-y-1">
                {sessions.map((item, idx) => {
                  const isCurrent = item.id === sessionId;
                  const isLoading = loadingSessionId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void loadSessionById(item.id)}
                        disabled={isLoading}
                        className={[
                          "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition",
                          isCurrent
                            ? "bg-[#171916] font-medium text-[#faf7ef]"
                            : "bg-[#fbf9f3]/80 text-[#484e45] hover:bg-[#fbf9f3] hover:text-[#171916]",
                        ].join(" ")}
                      >
                        <span className="truncate">{item.title?.trim() || `会话 #${sessions.length - idx}`}</span>
                        <span
                          className={`shrink-0 text-[10px] tabular-nums ${
                            isCurrent ? "text-[#faf7ef]/70" : "text-[#92978b]"
                          }`}
                        >
                          {isLoading ? "加载中…" : formatSessionTime(item.last_message_at ?? item.created_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {/* Scrollable Chat Stream */}
        <div
          ref={chatScrollRef}
          className="studio-scroll mb-3 max-h-[56vh] flex-1 space-y-4 overflow-y-auto pr-1 lg:min-h-0 lg:max-h-none"
        >
          {!hasMessages ? (
            <div className="rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/75 p-4 text-xs leading-6 text-[#484e45]">
              <p className="font-display text-[11px] tracking-[0.2em] text-[#566c58]">AGENT</p>
              <p className="mt-2">
                只有一个模糊想法也可以。直接说想做什么，或者让我问两句帮你定方向；每步计划和扣分都会写清楚。
              </p>
            </div>
          ) : null}

          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              onSelect={(id) => {
                setSelectedId(id);
                const idx = canvas.findIndex((item) => item.generationId === id);
                if (idx >= 0) setViewIndex(idx);
              }}
            />
          ))}

          {busy ? (
            <div className="flex items-center gap-2 text-xs text-[#6d7368]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#566c58]" aria-hidden /> Agent 正在思考…
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-[#b45340]/25 bg-[#fdf3f0] p-3 text-xs text-[#8a3222]">{error}</p>
          ) : null}
        </div>

        {/* Bottom Composer */}
        <div className="border-t border-[#171916]/8 pt-3">
          {membershipRequired ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#b48a52]/30 bg-[#f6ebd9]/80 px-4 py-3 text-xs text-[#5a411e]">
              <Lock size={14} aria-hidden />
              <span>
                Agent 对话为会员专属{messages.length > 0 ? "，会员已过期：历史对话与画布仍可查看" : ""}。
              </span>
              <Link
                href="/upgrade"
                className="ml-auto inline-flex rounded-full bg-[#171916] px-4 py-1.5 text-xs font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
              >
                查看会员方案
              </Link>
            </div>
          ) : (
            <>
              {selected ? (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#566c58]/30 bg-[#e7eee5] px-3 py-1.5 text-xs text-[#2d3e2f]">
                  <span>
                    ✎ 正在以 <strong className="font-semibold text-[#1f3021]">{selected.version}</strong> 为基础继续修改
                  </span>
                  <button
                    type="button"
                    className="ml-auto text-[#484e45] hover:text-[#171916]"
                    onClick={() => setSelectedId(null)}
                    aria-label="取消选择"
                  >
                    ✕
                  </button>
                </div>
              ) : null}

              <div className="flex items-end gap-2 rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 px-3.5 py-2 transition focus-within:border-[#566c58]/50 focus-within:bg-[#fbf9f3]">
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
                  className="max-h-[6rem] flex-1 resize-none border-none bg-transparent text-sm leading-6 text-[#171916] outline-none placeholder:text-[#92978b]"
                />
                <button
                  type="button"
                  disabled={busy || !input.trim()}
                  onClick={() => void send(input)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#171916] text-[#faf7ef] transition hover:bg-[#2a2e28] disabled:opacity-35"
                  aria-label="发送"
                >
                  <Send size={14} aria-hidden />
                </button>
              </div>

              {!hasMessages ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {WELCOME_HINTS.map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      onClick={() => void send(hint)}
                      className="rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-3 py-1 text-[11px] text-[#484e45] transition hover:border-[#566c58]/40 hover:text-[#171916]"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {/* RIGHT PANEL: Full-Height Canvas + Version Lineage + Bottom Filmstrip */}
      <section className="flex min-h-[520px] flex-col overflow-hidden rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/82 p-4 shadow-[0_18px_50px_rgba(23,25,22,0.045)] backdrop-blur-md lg:min-h-0 lg:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#171916]/8 pb-3">
          <div className="flex items-baseline gap-2.5">
            <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">CANVAS</p>
            <h2 className="font-display text-lg font-normal text-[#171916]">画布</h2>
          </div>
          <p className="text-xs tabular-nums text-[#6d7368]">
            {canvas.length} 张作品 · 点击图片选中后继续修改（剩余积分：{displayCredits}）
          </p>
        </div>

        {canvas.length === 0 ? (
          <div className="relative grid min-h-[380px] flex-1 place-items-center overflow-hidden rounded-2xl border border-dashed border-[#171916]/15 bg-[#f2eee2]/85 p-6 text-center">
            <Image
              src="/images/oil-section-wash.webp"
              alt=""
              fill
              sizes="60vw"
              className="object-cover opacity-45"
            />
            <div className="relative z-10 max-w-sm rounded-[1.75rem] border border-[#171916]/8 bg-[#fbf9f3]/86 px-7 py-8 shadow-[0_14px_38px_rgba(23,25,22,0.05)] backdrop-blur-md">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[#566c58]/20 bg-[#e7eee5] text-[#384a3a]">
                <Sparkles size={20} aria-hidden />
              </div>
              <p className="mt-4 font-display text-xs tracking-[0.24em] text-[#6d7368] uppercase">CANVAS</p>
              <p className="mt-2 font-display text-xl font-normal text-[#171916]">聊出来的图会出现在这里</p>
              <p className="mt-2 text-xs leading-6 text-[#484e45]">
                选中任意一张，就能在左侧继续说怎么改。
              </p>
            </div>
          </div>
        ) : (
          <CanvasCarousel
            canvas={canvas}
            viewIndex={viewIndex}
            onView={setViewIndex}
            selectedId={selectedId}
            onSelect={() => setSelectedId(current.generationId)}
            onLightbox={() => setLightboxItem(current)}
            onVariant={(generationId) => {
              setSelectedId(generationId);
              void send("给这张图生成两个不同配色的变体", { selectedGenerationId: generationId });
            }}
            current={current}
          />
        )}
      </section>

      {/* Lightbox Modal */}
      {lightboxItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#171916]/82 p-4 backdrop-blur-md sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="画布作品大图预览"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="relative flex max-h-[92vh] max-w-5xl flex-col items-center gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxItem(null)}
              aria-label="关闭大图预览"
              className="absolute -top-2 right-0 grid h-9 w-9 place-items-center rounded-full bg-[#fbf9f3] text-[#171916] shadow-lg transition hover:bg-white"
            >
              <X size={18} aria-hidden />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxItem.imageUrl}
              alt={`大图预览 ${lightboxItem.version}`}
              className="mt-8 max-h-[78vh] w-auto max-w-full rounded-2xl border border-white/15 bg-[#fbf9f3] object-contain shadow-2xl"
            />
            <div className="flex items-center gap-3 rounded-full bg-[#fbf9f3]/92 px-5 py-2 text-xs text-[#171916] shadow-lg">
              <span className="font-mono font-medium">{lightboxItem.version}</span>
              {lightboxItem.basedOn ? <span className="text-[#6d7368]">基于 {lightboxItem.basedOn} 修改</span> : null}
              <a
                href={lightboxItem.imageUrl}
                download
                className="inline-flex items-center gap-1 rounded-full bg-[#171916] px-3.5 py-1 text-xs font-medium text-[#faf7ef]"
              >
                <Download size={12} aria-hidden /> 下载原图
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChatBubble({ message, onSelect }: { message: ChatMessage; onSelect: (id: string) => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-[1.2rem_1.2rem_4px_1.2rem] bg-[#171916] px-3.5 py-2.5 text-sm leading-6 text-[#faf7ef]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-display text-[11px] tracking-[0.2em] text-[#6d7368]">AGENT</p>
      {message.content ? (
        <div className="max-w-[95%] whitespace-pre-wrap rounded-[4px_1.2rem_1.2rem_1.2rem] border border-[#171916]/8 bg-[#f4f0e5]/85 px-3.5 py-2.5 text-sm leading-6 text-[#171916]">
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
      <div
        className={`flex items-center gap-2 text-xs ${
          item.status === "failed" ? "text-[#8a3222]" : "text-[#484e45]"
        }`}
      >
        <span
          className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${
            item.status === "failed" ? "bg-[#b45340] text-white" : "bg-[#384a3a] text-[#faf7ef]"
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
      <details className="group rounded-xl border border-[#171916]/10 bg-[#fbf9f3]">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-[#e7eee5]/85 px-3 py-2 text-[11px] font-semibold text-[#2d3e2f]">
          <span>⚙ {item.name}</span>
          {item.costCredits ? (
            <span className="ml-auto rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-2 py-0.5 text-[10px] tabular-nums text-[#484e45]">
              −{item.costCredits} 积分
            </span>
          ) : null}
          <span className="text-[#6d7368] transition group-open:rotate-90">▶</span>
        </summary>
        <div className="border-t border-dashed border-[#171916]/10 px-3 py-2.5 font-mono text-[11px] leading-5 text-[#484e45]">
          {item.argsSummary ? <p>{item.argsSummary}</p> : null}
          {item.detail ? <p className="text-[#8a3222]">error: {item.detail}</p> : null}
        </div>
      </details>
    );
  }

  if (!item.imageUrl) return null;

  return (
    <button
      type="button"
      onClick={() => item.generationId && onSelect(item.generationId)}
      className="relative block w-36 overflow-hidden rounded-xl border border-[#171916]/12 transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(23,25,22,0.12)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={`生成结果 ${item.version ?? ""}`.trim()} className="block h-auto w-full" />
      {item.version ? (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-[#171916]/72 px-2 py-0.5 font-mono text-[9.5px] text-[#faf7ef]">
          {item.version}
        </span>
      ) : null}
    </button>
  );
}

function CanvasCarousel({
  canvas,
  viewIndex,
  onView,
  selectedId,
  onSelect,
  onLightbox,
  onVariant,
  current,
}: {
  canvas: CanvasItem[];
  viewIndex: number;
  onView: (index: number) => void;
  selectedId: string | null;
  onSelect: () => void;
  onLightbox: () => void;
  onVariant: (generationId: string) => void;
  current: CanvasItem;
}) {
  const selected = current.generationId === selectedId;
  const stageRef = useRef<HTMLDivElement>(null);
  const naturalRef = useRef<{ width: number; height: number } | null>(null);
  const [imgBox, setImgBox] = useState<{ width: number; height: number } | null>(null);

  const refit = useCallback(() => {
    const stage = stageRef.current;
    const natural = naturalRef.current;

    if (!stage || !natural) return;

    const scale = Math.min(1, (stage.clientWidth - 32) / natural.width, (stage.clientHeight - 32) / natural.height);
    if (scale > 0) {
      setImgBox({ width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) });
    }
  }, []);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => refit());
    observer.observe(stage);

    return () => observer.disconnect();
  }, [refit]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Main Centered Stage */}
      <div
        ref={stageRef}
        className="relative grid min-h-[320px] flex-1 place-items-center overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#f1ede2]/90 p-4"
      >
        <span
          className="relative inline-flex"
          style={imgBox ? { width: imgBox.width, height: imgBox.height } : undefined}
        >
          <button type="button" onClick={onSelect} className="h-full w-full" aria-label={`选中 ${current.version}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.imageUrl}
              alt={`画布作品 ${current.version}`}
              onLoad={(event) => {
                naturalRef.current = {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                };
                refit();
              }}
              className="h-full w-full rounded-xl border border-[#171916]/10 object-contain shadow-[0_18px_46px_rgba(23,25,22,0.12)]"
            />
          </button>

          {/* Version + Editing badge */}
          <span className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-[#171916]/72 px-2.5 py-1 font-mono text-[10.5px] text-[#faf7ef] backdrop-blur">
            {current.version}
            {selected ? <span className="font-sans font-semibold text-[#cde2cc]">✓ 编辑对象</span> : null}
          </span>

          {canvas.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => onView(Math.max(0, viewIndex - 1))}
                disabled={viewIndex <= 0}
                className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-[#fbf9f3]/78 text-lg leading-none text-[#171916] shadow backdrop-blur-sm transition hover:bg-[#fbf9f3] disabled:pointer-events-none disabled:opacity-35"
                aria-label="上一张"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => onView(Math.min(canvas.length - 1, viewIndex + 1))}
                disabled={viewIndex >= canvas.length - 1}
                className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-[#fbf9f3]/78 text-lg leading-none text-[#171916] shadow backdrop-blur-sm transition hover:bg-[#fbf9f3] disabled:pointer-events-none disabled:opacity-35"
                aria-label="下一张"
              >
                ›
              </button>
              <span className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#fbf9f3]/82 px-3 py-1 shadow-sm backdrop-blur-sm">
                {canvas.map((item, index) => (
                  <span
                    key={item.generationId}
                    className={`h-1.5 w-1.5 rounded-full ${index === viewIndex ? "bg-[#171916]" : "bg-[#171916]/25"}`}
                  />
                ))}
                <span className="ml-1 font-mono text-[10.5px] tabular-nums text-[#171916]">
                  {viewIndex + 1} / {canvas.length}
                </span>
              </span>
            </>
          ) : null}
        </span>
      </div>

      {/* Lineage & Actions Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#171916]/8 bg-[#f4f0e5]/75 px-3.5 py-2">
        <span className="rounded-md bg-[#171916]/8 px-2 py-0.5 text-[10px] font-semibold text-[#484e45]">
          {ORIGIN_LABEL[current.origin]}
        </span>
        {current.basedOn ? (
          <span className="text-xs text-[#6d7368]">基于 {current.basedOn} 修改</span>
        ) : (
          <span className="text-xs text-[#6d7368]">{current.version}</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onSelect}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              selected
                ? "border-[#384a3a] bg-[#384a3a] text-[#faf7ef]"
                : "border-[#171916] bg-[#171916] text-[#faf7ef] hover:bg-[#2a2e28]"
            }`}
          >
            选中编辑
          </button>
          <button
            type="button"
            onClick={() => onVariant(current.generationId)}
            className="rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/30 hover:text-[#171916]"
          >
            变体
          </button>
          <button
            type="button"
            onClick={onLightbox}
            className="inline-flex items-center gap-1 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/30 hover:text-[#171916]"
            aria-label="放大查看画布作品"
          >
            <Maximize2 size={12} aria-hidden />
            灯箱
          </button>
          <a
            href={current.imageUrl}
            download
            className="grid place-items-center rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3 py-1.5 text-[#484e45] transition hover:border-[#171916]/30 hover:text-[#171916]"
            aria-label="下载图片"
          >
            <Download size={13} aria-hidden />
          </a>
        </div>
      </div>

      {/* Bottom Artwork Filmstrip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 studio-scroll">
        {canvas.map((item, idx) => {
          const isViewing = idx === viewIndex;
          const isTarget = item.generationId === selectedId;
          return (
            <button
              key={item.generationId}
              type="button"
              onClick={() => onView(idx)}
              className={[
                "group relative flex shrink-0 items-center gap-2 rounded-xl border p-1.5 pr-2.5 text-left transition",
                isViewing
                  ? "border-[#171916] bg-[#fbf9f3] shadow-sm"
                  : "border-[#171916]/10 bg-[#f4f0e5]/65 opacity-80 hover:opacity-100",
              ].join(" ")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={`缩略图 ${item.version}`}
                className="h-10 w-10 rounded-lg object-cover"
              />
              <div className="leading-tight">
                <p className="font-mono text-[10px] font-semibold text-[#171916]">{item.version}</p>
                <p className="mt-0.5 text-[10px] text-[#6d7368]">
                  {isTarget ? "编辑中" : ORIGIN_LABEL[item.origin]}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
