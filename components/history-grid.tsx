"use client";

import {
  Check,
  Copy,
  Download,
  ImagePlus,
  Maximize2,
  RotateCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GenerationFeedback } from "@/components/generation-feedback";
import { aspectRatios, imageTypes, scenes, styles } from "@/lib/prompts/options";
import type { GenerateRequest } from "@/lib/validation/generate";
import type { Database, Json } from "@/types/database";

type Generation = Database["public"]["Tables"]["generations"]["Row"];
type SortOrder = "newest" | "oldest";
type OriginFilter = "all" | "classic" | "agent" | "liked";

function getOptions(value: Json): Partial<GenerateRequest> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Partial<GenerateRequest>;
}

function buildRegenerateHref(item: Generation) {
  const options = getOptions(item.options_json);
  const params = new URLSearchParams();

  for (const key of ["imageType", "aspectRatio", "style", "scene", "whitespace"] as const) {
    const value = options[key];
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  params.set("subject", item.input_subject);

  if (item.input_extra) {
    params.set("extra", item.input_extra);
  }

  return `/generate?${params.toString()}`;
}

function getOptionTags(item: Generation): string[] {
  const options = getOptions(item.options_json);
  const tags: string[] = [];

  if (options.imageType && options.imageType in imageTypes) {
    tags.push(imageTypes[options.imageType].label);
  }
  if (options.style && options.style in styles) {
    tags.push(styles[options.style].label);
  }
  if (options.scene && options.scene in scenes) {
    tags.push(scenes[options.scene].label);
  }
  if (options.aspectRatio && options.aspectRatio in aspectRatios) {
    tags.push(aspectRatios[options.aspectRatio].label);
  }
  if (item.origin && item.origin !== "classic") {
    tags.push(item.origin === "agent_edit" ? "Agent 改图" : item.origin === "agent_variant" ? "Agent 变体" : "Agent 对话");
  }

  return tags;
}

export function HistoryGrid({ generations }: { generations: Generation[] }) {
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<Generation | null>(null);

  useEffect(() => {
    if (!activeItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem]);

  const filteredGenerations = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return [...generations]
      .filter((item) => {
        if (originFilter === "classic" && item.origin !== "classic") return false;
        if (originFilter === "agent" && item.origin === "classic") return false;
        if (originFilter === "liked" && item.feedback !== "liked") return false;
        if (!normalized) return true;
        return (
          item.input_subject.toLowerCase().includes(normalized) ||
          (item.input_extra ?? "").toLowerCase().includes(normalized) ||
          item.final_prompt.toLowerCase().includes(normalized)
        );
      })
      .sort((first, second) => {
        const firstTime = new Date(first.created_at).getTime();
        const secondTime = new Date(second.created_at).getTime();
        return sortOrder === "newest" ? secondTime - firstTime : firstTime - secondTime;
      });
  }, [generations, originFilter, query, sortOrder]);

  async function copyPrompt(item: Generation) {
    await navigator.clipboard.writeText(item.final_prompt);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <div className="space-y-6">
      {/* Compact Editorial Gallery Header */}
      <header className="flex flex-col gap-4 border-b border-[#171916]/10 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">ARCHIVE GALLERY</p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
              <h1 className="font-display text-3xl font-normal text-[#171916] sm:text-4xl">作品图库</h1>
              <span className="rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-3 py-1 text-xs font-medium tabular-nums text-[#484e45]">
                共 {generations.length} 张图片
              </span>
            </div>
          </div>

          <Link
            href="/generate"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#171916] px-5 py-2.5 text-xs font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
          >
            <Sparkles size={14} aria-hidden />
            新建创作
          </Link>
        </div>

        {/* Search, Filter Chips & Sort Controls */}
        {generations.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按类型筛选作品">
              {(
                [
                  { id: "all", label: "全部作品" },
                  { id: "classic", label: "经典模式" },
                  { id: "agent", label: "Agent 对话" },
                  { id: "liked", label: "满意收藏" },
                ] as const
              ).map((chip) => {
                const active = originFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setOriginFilter(chip.id)}
                    aria-pressed={active}
                    className={[
                      "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                      active
                        ? "bg-[#171916] text-[#faf7ef]"
                        : "border border-[#171916]/10 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/25 hover:text-[#171916]",
                    ].join(" ")}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex items-center">
                <Search size={14} className="pointer-events-none absolute left-3 text-[#92978b]" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索主题或提示词…"
                  aria-label="搜索历史作品"
                  className="w-48 rounded-full border border-[#171916]/10 bg-[#fbf9f3] py-1.5 pl-8 pr-3.5 text-xs text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 sm:w-56"
                />
              </label>

              <div className="inline-flex rounded-full border border-[#171916]/10 bg-[#f4f0e5] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSortOrder("newest")}
                  aria-pressed={sortOrder === "newest"}
                  className={`rounded-full px-3 py-1 transition ${
                    sortOrder === "newest" ? "bg-[#fbf9f3] font-medium text-[#171916] shadow-sm" : "text-[#6d7368]"
                  }`}
                >
                  最新
                </button>
                <button
                  type="button"
                  onClick={() => setSortOrder("oldest")}
                  aria-pressed={sortOrder === "oldest"}
                  className={`rounded-full px-3 py-1 transition ${
                    sortOrder === "oldest" ? "bg-[#fbf9f3] font-medium text-[#171916] shadow-sm" : "text-[#6d7368]"
                  }`}
                >
                  最早
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {/* Empty State */}
      {generations.length === 0 ? (
        <div className="relative overflow-hidden rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3] px-6 py-16 text-center shadow-[0_18px_46px_rgba(23,25,22,0.045)]">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-45">
            <Image src="/images/oil-section-wash.webp" alt="" fill sizes="100vw" className="object-cover" />
          </div>
          <div className="relative z-10 mx-auto max-w-sm">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[#566c58]/20 bg-[#e7eee5] text-[#384a3a]">
              <Sparkles size={20} aria-hidden />
            </div>
            <h2 className="mt-5 font-display text-2xl font-normal text-[#171916]">还没有生成过图片</h2>
            <p className="mt-2.5 text-sm leading-6 text-[#484e45]">
              生成第一张商业视觉作品后，它会自动沉淀在这里，支持随时复用提示词或用作参考图。
            </p>
            <Link
              className="mt-6 inline-flex rounded-full bg-[#171916] px-6 py-2.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
              href="/generate"
            >
              去生成第一张图片
            </Link>
          </div>
        </div>
      ) : filteredGenerations.length === 0 ? (
        <div className="rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3] px-6 py-12 text-center">
          <p className="text-sm text-[#484e45]">当前筛选条件下暂无匹配作品。</p>
          <button
            type="button"
            onClick={() => {
              setOriginFilter("all");
              setQuery("");
            }}
            className="mt-4 rounded-full border border-[#171916]/15 bg-[#f4f0e5] px-4 py-1.5 text-xs font-medium text-[#171916] transition hover:border-[#171916]/30"
          >
            重置筛选
          </button>
        </div>
      ) : (
        /* Editorial Gallery Grid */
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredGenerations.map((item) => {
            const tags = getOptionTags(item);
            return (
              <article
                key={item.id}
                className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/92 shadow-[0_16px_44px_rgba(23,25,22,0.045)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(23,25,22,0.09)]"
              >
                {/* Matted Image Stage */}
                {item.image_url ? (
                  <div className="relative overflow-hidden bg-[#f1ede2] p-3">
                    <button
                      type="button"
                      onClick={() => setActiveItem(item)}
                      className="relative block aspect-[4/3] w-full overflow-hidden rounded-[1.15rem] border border-[#171916]/8 bg-[#eee9dc] focus:outline-none"
                      aria-label={`查看 ${item.input_subject} 详情`}
                    >
                      <Image
                        className="object-cover transition duration-500 group-hover:scale-[1.03]"
                        src={item.image_url}
                        alt={item.input_subject}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      />
                    </button>

                    {/* Subtle hover quick overlay */}
                    <div className="pointer-events-none absolute inset-x-5 bottom-5 flex items-center justify-between gap-2 opacity-0 transition duration-200 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setActiveItem(item)}
                        className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-[#171916]/80 px-3 py-1.5 text-[11px] font-medium text-[#faf7ef] backdrop-blur transition hover:bg-[#171916]"
                      >
                        <Maximize2 size={11} aria-hidden /> 查看大图
                      </button>
                      <a
                        href={item.image_url}
                        download
                        className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-[#fbf9f3]/92 px-3 py-1.5 text-[11px] font-medium text-[#171916] shadow backdrop-blur transition hover:bg-white"
                      >
                        <Download size={11} aria-hidden /> 下载
                      </a>
                    </div>
                  </div>
                ) : null}

                {/* Card Copy & Quick Actions */}
                <div className="flex flex-1 flex-col justify-between gap-3.5 p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-[#6d7368]">
                      <time>{new Date(item.created_at).toLocaleString("zh-CN")}</time>
                      <span className="rounded-full bg-[#f4f0e5] px-2 py-0.5 font-medium text-[#484e45]">−1 积分</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveItem(item)}
                      className="mt-2 block text-left"
                    >
                      <h2 className="line-clamp-2 font-display text-lg font-normal leading-snug text-[#171916] transition hover:text-[#384a3a]">
                        {item.input_subject}
                      </h2>
                    </button>
                    {tags.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-[#171916]/8 bg-[#f4f0e5]/85 px-2.5 py-0.5 text-[11px] text-[#484e45]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Always-visible essential actions (keeps E2E link "用作参考图" immediately clickable) */}
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-[#171916]/8 pt-3 text-xs">
                    {item.image_url ? (
                      <Link
                        className="inline-flex items-center gap-1 rounded-full bg-[#171916] px-3 py-1.5 font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                        href={`/generate?mode=classic&ref=${item.id}`}
                      >
                        <ImagePlus size={12} aria-hidden />
                        用作参考图
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void copyPrompt(item)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3 py-1.5 font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
                    >
                      {copiedId === item.id ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                      {copiedId === item.id ? "已复制" : "复制提示词"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveItem(item)}
                      className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#171916]/10 bg-[#f4f0e5]/80 px-2.5 py-1.5 text-[11px] font-medium text-[#484e45] transition hover:text-[#171916]"
                    >
                      详情
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Gallery Detail Lightbox Modal */}
      {activeItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#171916]/75 p-4 backdrop-blur-md sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="作品详情"
          onClick={() => setActiveItem(null)}
        >
          <div
            className="grid max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-[#171916]/15 bg-[#fbf9f3] shadow-2xl lg:grid-cols-[1.15fr_0.85fr]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Uncropped Artwork Stage */}
            <div className="relative flex min-h-[260px] items-center justify-center bg-[#f1ede2] p-5 sm:p-7">
              {activeItem.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element -- uncropped natural ratio display */
                <img
                  src={activeItem.image_url}
                  alt={activeItem.input_subject}
                  className="max-h-[72vh] w-auto max-w-full rounded-xl border border-[#171916]/10 bg-[#fbf9f3] object-contain shadow-[0_20px_50px_rgba(23,25,22,0.12)]"
                />
              ) : null}
            </div>

            {/* Detail Metadata & Actions */}
            <div className="studio-scroll flex max-h-[85vh] flex-col justify-between gap-5 overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xs tracking-[0.2em] text-[#566c58] uppercase">ARTWORK DETAIL</p>
                    <h2 className="mt-1 font-display text-2xl font-normal leading-snug text-[#171916]">
                      {activeItem.input_subject}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveItem(null)}
                    aria-label="关闭作品详情"
                    className="rounded-full p-1.5 text-[#6d7368] transition hover:bg-[#eee9dc] hover:text-[#171916]"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>

                {activeItem.input_extra ? (
                  <p className="text-sm leading-6 text-[#484e45]">{activeItem.input_extra}</p>
                ) : null}

                <div className="flex flex-wrap gap-1.5">
                  {getOptionTags(activeItem).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[#171916]/10 bg-[#f4f0e5] px-3 py-1 text-xs text-[#484e45]"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-3 py-1 text-xs tabular-nums text-[#6d7368]">
                    {new Date(activeItem.created_at).toLocaleString("zh-CN")}
                  </span>
                </div>

                {/* Full Prompt Box */}
                <div className="rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/80 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#171916]">完整画面说明（Prompt）</span>
                    <button
                      type="button"
                      onClick={() => void copyPrompt(activeItem)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-2.5 py-1 text-[11px] font-medium text-[#484e45] transition hover:text-[#171916]"
                    >
                      {copiedId === activeItem.id ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
                      {copiedId === activeItem.id ? "已复制" : "一键复制"}
                    </button>
                  </div>
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#484e45] studio-scroll">
                    {activeItem.final_prompt}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-[#171916]">作品反馈</p>
                  <GenerationFeedback
                    key={activeItem.id}
                    generationId={activeItem.id}
                    initialFeedback={activeItem.feedback}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-[#171916]/10 pt-4">
                {activeItem.image_url ? (
                  <Link
                    href={`/generate?mode=classic&ref=${activeItem.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#171916] px-4 py-2.5 text-xs font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                  >
                    <ImagePlus size={14} aria-hidden />
                    用作参考图
                  </Link>
                ) : null}
                {activeItem.image_url ? (
                  <a
                    href={activeItem.image_url}
                    download
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#171916]/15 bg-[#fbf9f3] px-4 py-2.5 text-xs font-medium text-[#171916] transition hover:border-[#171916]/30"
                  >
                    <Download size={14} aria-hidden />
                    下载原图
                  </a>
                ) : null}
                <Link
                  href={buildRegenerateHref(activeItem)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#171916]/15 bg-[#fbf9f3] px-4 py-2.5 text-xs font-medium text-[#171916] transition hover:border-[#171916]/30"
                >
                  <RotateCw size={14} aria-hidden />
                  同参重做
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
