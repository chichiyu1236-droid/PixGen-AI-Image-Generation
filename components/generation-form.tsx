"use client";

import { Clock3, Download, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";

type GenerationResult = {
  generation: {
    image_url: string | null;
  };
};

export function GenerationForm({ credits }: { credits: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (credits < 1) {
      setError("insufficient_credits");
      return;
    }

    setLoading(true);
    setElapsedSeconds(0);
    setError(null);
    setImageUrl(null);

    try {
      const formData = new FormData(event.currentTarget);
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as GenerationResult | { error: string };

      if (!response.ok) {
        setError("error" in body ? body.error : "generation_failed");
        return;
      }

      setImageUrl((body as GenerationResult).generation.image_url);
      router.refresh();
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <form onSubmit={onSubmit} className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm" aria-busy={loading}>
        <div className="grid gap-4">
          <SelectField name="imageType" label="图片类型" options={imageTypes} />
          <SelectField name="aspectRatio" label="比例" options={aspectRatios} />
          <SelectField name="style" label="风格" options={styles} />
          <SelectField name="scene" label="场景" options={scenes} />
          <SelectField name="whitespace" label="留白" options={whitespaceOptions} />
          <label className="grid gap-2 text-sm font-semibold">
            主体描述
            <textarea
              name="subject"
              required
              minLength={2}
              className="min-h-24 rounded-md border border-ink/15 p-3 font-normal outline-none transition focus:border-steel"
              placeholder="例如：一瓶高端护肤精华，透明玻璃瓶，银色瓶盖"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            补充要求
            <textarea
              name="extra"
              className="min-h-20 rounded-md border border-ink/15 p-3 font-normal outline-none transition focus:border-steel"
              placeholder="例如：背景干净，适合广告图"
            />
          </label>
        </div>
        <button
          disabled={loading || credits < 1}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          {loading ? "正在生成..." : "生成图片"}
        </button>
      </form>

      <section className="min-h-[520px] rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
        {credits < 1 || error === "insufficient_credits" ? <UpgradePrompt /> : null}
        {error && error !== "insufficient_credits" ? (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">生成失败，请稍后重试。</p>
        ) : null}
        {loading ? (
          <div className="grid h-full min-h-[420px] place-items-center text-center">
            <div className="w-full max-w-sm">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink text-white">
                <Loader2 className="animate-spin" size={24} />
              </div>
              <h3 className="mt-5 text-2xl font-bold text-ink">正在为你生成图片</h3>
              <p className="mt-3 text-sm leading-6 text-ink/65">高质量图片需要一点时间，请保持页面打开，结果会自动显示在这里。</p>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-clay" />
              </div>

              <div className="mt-5 inline-flex items-center gap-2 rounded-md bg-paper px-3 py-2 text-sm text-ink/70">
                <Clock3 size={16} />
                已等待 {elapsedSeconds} 秒
              </div>
            </div>
          </div>
        ) : imageUrl ? (
          <div>
            <Image className="h-auto w-full rounded-md border border-ink/10" src={imageUrl} alt="Generated result" width={1024} height={1024} />
            <a
              href={imageUrl}
              download
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold"
            >
              <Download size={16} />
              下载图片
            </a>
          </div>
        ) : (
          <div className="grid h-full min-h-[420px] place-items-center text-center text-ink/50">生成结果会显示在这里</div>
        )}
      </section>
    </div>
  );
}

function SelectField<T extends Record<string, { label: string }>>({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: T;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <select name={name} className="rounded-md border border-ink/15 bg-white p-3 font-normal outline-none transition focus:border-steel">
        {Object.entries(options).map(([value, option]) => (
          <option key={value} value={value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
