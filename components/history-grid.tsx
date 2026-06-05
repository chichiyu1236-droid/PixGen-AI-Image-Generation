"use client";

import { Copy, Download, RotateCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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
    return <div className="rounded-lg border border-ink/10 bg-white p-8 text-center text-ink/60">还没有生成记录。</div>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink/10 bg-white px-4 py-3">
        <p className="text-sm text-ink/60">共 {generations.length} 张图片，每次成功生成消耗 1 积分。</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          时间排序
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            className="rounded-md border border-ink/15 bg-white px-3 py-2 font-normal outline-none transition focus:border-steel"
          >
            <option value="newest">最新优先</option>
            <option value="oldest">最早优先</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedGenerations.map((item) => (
          <article key={item.id} className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm">
            {item.image_url ? (
              <Image className="aspect-square w-full rounded-md object-cover" src={item.image_url} alt={item.input_subject} width={512} height={512} />
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <time className="text-ink/50">{new Date(item.created_at).toLocaleString("zh-CN")}</time>
              <span className="rounded-full bg-ink/5 px-2 py-1 font-semibold text-ink/60">-1 积分</span>
            </div>

            <h2 className="mt-2 line-clamp-2 font-semibold">{item.input_subject}</h2>
            {item.input_extra ? <p className="mt-2 line-clamp-2 text-sm text-ink/60">{item.input_extra}</p> : null}

            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold">查看最终提示词</summary>
              <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-paper p-3 text-ink/70">{item.final_prompt}</p>
            </details>

            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              {item.image_url ? (
                <a className="inline-flex items-center justify-center gap-1 rounded-md border border-ink/20 px-2 py-2 font-semibold" href={item.image_url} download>
                  <Download size={15} />
                  下载
                </a>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => void copyPrompt(item)}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-ink/20 px-2 py-2 font-semibold"
              >
                <Copy size={15} />
                {copiedId === item.id ? "已复制" : "复制"}
              </button>
              <Link className="inline-flex items-center justify-center gap-1 rounded-md bg-ink px-2 py-2 font-semibold text-white" href={buildRegenerateHref(item)}>
                <RotateCw size={15} />
                同款
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
