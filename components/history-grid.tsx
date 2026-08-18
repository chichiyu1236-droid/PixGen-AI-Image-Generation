"use client";

import { Copy, Download, RotateCw, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GenerationFeedback } from "@/components/generation-feedback";
import type { GenerateRequest } from "@/lib/validation/generate";
import type { Database, Json } from "@/types/database";

type Generation = Database["public"]["Tables"]["generations"]["Row"];
type SortOrder = "newest" | "oldest";

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

export function HistoryGrid({ generations }: { generations: Generation[] }) {
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sortedGenerations = useMemo(() => {
    return [...generations].sort((first, second) => {
      const firstTime = new Date(first.created_at).getTime();
      const secondTime = new Date(second.created_at).getTime();
      return sortOrder === "newest" ? secondTime - firstTime : firstTime - secondTime;
    });
  }, [generations, sortOrder]);

  async function copyPrompt(item: Generation) {
    await navigator.clipboard.writeText(item.final_prompt);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  if (generations.length === 0) {
    return (
      <div className="rounded-[2rem] border border-black/10 bg-white p-10 text-center shadow-[0_18px_50px_rgba(0,0,0,0.04)]">
        <Sparkles className="mx-auto text-black/35" size={28} />
        <h2 className="mt-5 text-2xl font-light text-black">还没有生成过图片</h2>
        <p className="mt-3 text-sm leading-6 text-black/58">生成第一张图片后，它会出现在这里。</p>
        <Link className="mt-6 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/90" href="/generate">
          去生成第一张图片
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-black/10 bg-white px-5 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.04)]">
        <p className="text-sm text-black/58">共 {generations.length} 张图片。成功生成的图片会消耗 1 积分。</p>
        <label className="flex items-center gap-2 text-sm font-semibold text-black">
          排序
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            className="rounded-full border border-black/10 bg-[#f8faf7] px-4 py-2 font-normal text-black outline-none transition focus:border-black/30 focus:bg-white"
          >
            <option value="newest">最新优先</option>
            <option value="oldest">最早优先</option>
          </select>
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sortedGenerations.map((item) => {
          const regenerateHref = buildRegenerateHref(item);

          return (
            <article key={item.id} className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.04)]">
              <div className="border-b border-black/10 bg-[#f8faf7] p-4">
                <div className="flex items-center justify-between text-sm text-black/52">
                  <time>{new Date(item.created_at).toLocaleString("zh-CN")}</time>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 font-semibold text-black">-1 积分</span>
                </div>
              </div>

              {item.image_url ? (
                <div className="p-4">
                  <Image className="aspect-square w-full rounded-[1.5rem] border border-black/10 object-cover" src={item.image_url} alt={item.input_subject} width={512} height={512} />
                </div>
              ) : null}

              <div className="space-y-4 p-5">
                <div>
                  <p className="font-display text-xl tracking-[0.08em] text-black/40">主题</p>
                  <h2 className="mt-2 line-clamp-2 text-2xl font-light leading-tight text-black">{item.input_subject}</h2>
                  {item.input_extra ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-black/58">{item.input_extra}</p> : null}
                </div>

                <details className="rounded-[1.25rem] border border-black/10 bg-[#f8faf7] p-4 text-sm">
                  <summary className="cursor-pointer font-semibold text-black">查看提示词</summary>
                  <p className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-black/70">{item.final_prompt}</p>
                </details>

                <div className="flex flex-wrap gap-2 text-sm">
                  {item.image_url ? (
                    <a className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 font-semibold text-black transition hover:border-black/25" href={item.image_url} download>
                      <Download size={15} />
                      下载
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void copyPrompt(item)}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 font-semibold text-black transition hover:border-black/25"
                  >
                    <Copy size={15} />
                    {copiedId === item.id ? "已复制" : "复制提示词"}
                  </button>
                  <Link className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 font-semibold text-white transition hover:bg-black/90" href={regenerateHref}>
                    <RotateCw size={15} />
                    重新生成
                  </Link>
                </div>

                <GenerationFeedback generationId={item.id} initialFeedback={item.feedback} />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
