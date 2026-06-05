"use client";

import { CheckCircle2, Clock3, Download, ImageIcon, Loader2, Server, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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

  async function onSubmit(formData: FormData) {
    if (loading) {
      return;
    }

    if (credits < 1) {
      setError("insufficient_credits");
      return;
    }

    setLoading(true);
    setError(null);
    setImageUrl(null);

    try {
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
      <form action={onSubmit} className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
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
          <div className="grid h-full min-h-[420px] place-items-center">
            <div className="w-full max-w-md text-left">
              <div className="rounded-lg border border-ink/10 bg-paper/60 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-clay">图片生成任务运行中</p>
                    <h3 className="mt-1 text-2xl font-bold text-ink">正在生成高质量图片</h3>
                  </div>
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-ink text-white">
                    <Loader2 className="animate-spin" size={22} />
                  </div>
                </div>

                <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-clay" />
                </div>

                <div className="mt-5 grid gap-3 text-sm">
                  <LoadingStep icon={<CheckCircle2 size={16} />} title="请求已提交" detail="已锁定本次生成请求，按钮会保持禁用。" done />
                  <LoadingStep icon={<Server size={16} />} title="调用生图通道" detail="正在等待中转站返回图片，通常需要 30-90 秒。" active />
                  <LoadingStep icon={<ImageIcon size={16} />} title="保存到历史记录" detail="图片返回后会自动上传并刷新积分。" />
                </div>

                <div className="mt-5 flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm text-ink/70">
                  <Clock3 size={16} />
                  已运行 {elapsedSeconds} 秒，请不要重复点击或关闭页面。
                </div>
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

function LoadingStep({
  icon,
  title,
  detail,
  active = false,
  done = false,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-md bg-white p-3">
      <div
        className={[
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
          done ? "bg-green-100 text-green-700" : active ? "bg-ink text-white" : "bg-ink/10 text-ink/45",
        ].join(" ")}
      >
        {active ? <Loader2 className="animate-spin" size={16} /> : icon}
      </div>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-0.5 leading-5 text-ink/60">{detail}</p>
      </div>
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
