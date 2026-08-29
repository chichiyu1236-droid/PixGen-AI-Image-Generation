"use client";

import { Clock3, Download, Loader2, Plus, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { GenerationFeedback } from "@/components/generation-feedback";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { compressImageToBase64, type ReferenceImageFile } from "@/lib/media/compress-image";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";
import { REFERENCE_IMAGE_LIMITS } from "@/lib/validation/generate";
import type { GenerateRequest } from "@/lib/validation/generate";

type GenerationResult = {
  generation: {
    id: string;
    image_url: string | null;
    feedback: "liked" | "disliked" | null;
  };
};

type GenerateError = {
  error: string;
};

const REFERENCE_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function GenerationForm({
  credits,
  initialValues = {},
  initialReference,
}: {
  credits: number;
  initialValues?: Partial<GenerateRequest>;
  initialReference?: { id: string; url: string };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationFeedback, setGenerationFeedback] = useState<"liked" | "disliked" | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [references, setReferences] = useState<ReferenceImageFile[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultSectionRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    if (!initialReference) {
      return;
    }

    let cancelled = false;

    (async () => {
      setReferenceBusy(true);

      try {
        const response = await fetch(initialReference.url);

        if (!response.ok) {
          throw new Error("reference_fetch_failed");
        }

        const blob = await response.blob();
        const base64 = await compressImageToBase64(blob);

        if (cancelled) {
          return;
        }

        if (base64.length > REFERENCE_IMAGE_LIMITS.maxDataChars) {
          setReferenceError("参考图加载失败，请手动上传");
          return;
        }

        setReferences((current) =>
          current.length > 0
            ? current
            : [
                {
                  id: `history-${initialReference.id}`,
                  previewUrl: URL.createObjectURL(blob),
                  base64,
                  generationId: initialReference.id,
                },
              ],
        );
      } catch {
        if (!cancelled) {
          setReferenceError("参考图加载失败，请手动上传");
        }
      } finally {
        if (!cancelled) {
          setReferenceBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialReference]);

  async function addReferenceFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    const incoming = Array.from(files);
    const unsupported = incoming.find((file) => !REFERENCE_ACCEPTED_TYPES.includes(file.type));

    if (unsupported) {
      setReferenceError("仅支持 PNG / JPEG / WebP 格式的图片");
      return;
    }

    if (references.length + incoming.length > REFERENCE_IMAGE_LIMITS.maxCount) {
      setReferenceError(`最多添加 ${REFERENCE_IMAGE_LIMITS.maxCount} 张参考图`);
      return;
    }

    setReferenceBusy(true);
    setReferenceError(null);

    try {
      const added: ReferenceImageFile[] = [];

      for (const file of incoming) {
        const base64 = await compressImageToBase64(file);

        if (base64.length > REFERENCE_IMAGE_LIMITS.maxDataChars) {
          setReferenceError("这张图片压缩后仍然过大，请换一张试试");
          continue;
        }

        added.push({
          id: crypto.randomUUID(),
          previewUrl: URL.createObjectURL(file),
          base64,
        });
      }

      if (added.length > 0) {
        setReferences((current) => [...current, ...added]);
      }
    } catch {
      setReferenceError("图片读取失败，请重试");
    } finally {
      setReferenceBusy(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removeReference(id: string) {
    setReferences((current) => {
      const removed = current.find((reference) => reference.id === id);

      if (removed?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return current.filter((reference) => reference.id !== id);
    });
    setReferenceError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(formData.entries());

    if (references.length > 0) {
      payload.referenceImages = references.map(({ base64, generationId }) =>
        generationId ? { data: base64, generationId } : { data: base64 },
      );
    }

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
    setGenerationId(null);
    setGenerationFeedback(null);

    // On narrow screens the result panel sits below the form; bring it into
    // view so the loading state (and any later error) is visible right away.
    if (resultSectionRef.current && window.matchMedia("(max-width: 1023px)").matches) {
      resultSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    let healthResponse: Response;

    try {
      healthResponse = await fetch("/api/health/image-provider");
    } catch {
      setError("network_error");
      setLoading(false);
      return;
    }

    if (!healthResponse.ok) {
      setError("provider_unavailable");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJsonResponse<GenerationResult | GenerateError>(response);

      if (!response.ok) {
        setError(body && "error" in body ? body.error : "generation_failed");
        return;
      }

      if (!body || !("generation" in body)) {
        setError("generation_failed");
        return;
      }

      setImageUrl(body.generation.image_url);
      setGenerationId(body.generation.id);
      setGenerationFeedback(body.generation.feedback);
      router.refresh();
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[430px_1fr]">
      <form onSubmit={onSubmit} className="rounded-[2rem] border border-black/10 bg-white/88 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.045)] backdrop-blur" aria-busy={loading}>
        <div className="mb-6 border-b border-black/10 pb-5">
          <p className="font-display text-2xl tracking-[0.12em] text-black/40">CREATE</p>
          <h2 className="mt-2 text-3xl font-light text-black">告诉我们你想要什么</h2>
          <p className="mt-2 text-sm leading-6 text-black/58">先选画面方向，再写下主体和细节。系统会帮你整理成更完整的图片说明。</p>
        </div>

        <div className="grid gap-4">
          <SelectField name="imageType" label="图片用途" options={imageTypes} defaultValue={initialValues.imageType} />
          <SelectField name="aspectRatio" label="画面比例" options={aspectRatios} defaultValue={initialValues.aspectRatio} />
          <SelectField name="style" label="画面质感" options={styles} defaultValue={initialValues.style} />
          <SelectField name="scene" label="场景" options={scenes} defaultValue={initialValues.scene} />
          <SelectField name="whitespace" label="留白" options={whitespaceOptions} defaultValue={initialValues.whitespace} />

          <label className="grid gap-2 text-sm font-semibold text-black">
            主体描述
            <textarea
              name="subject"
              required
              minLength={2}
              className="min-h-28 rounded-[1.25rem] border border-black/10 bg-[#f8faf7] p-4 font-normal text-black outline-none transition placeholder:text-black/42 focus:border-black/30 focus:bg-white"
              placeholder="例如：一瓶高端护肤精华，透明玻璃瓶，银色瓶盖"
              defaultValue={initialValues.subject}
            />
          </label>
          <div className="grid gap-2">
            <span className="text-sm font-semibold text-black">参考与补充</span>
            <div className="grid gap-4 rounded-[1.25rem] border border-black/10 bg-[#f8faf7] p-4">
              <div className="grid gap-2">
                <span className="text-[13px] font-semibold text-black/55">参考图（最多 {REFERENCE_IMAGE_LIMITS.maxCount} 张）</span>
                <div className="flex flex-wrap items-center gap-3">
                  {references.map((reference) => (
                    <div key={reference.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview; no remote optimization needed */}
                      <img src={reference.previewUrl} alt="参考图" className="h-16 w-16 rounded-[0.75rem] border border-black/10 bg-white object-cover" />
                      <button
                        type="button"
                        onClick={() => removeReference(reference.id)}
                        aria-label="移除参考图"
                        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black text-white transition hover:bg-black/85"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {references.length < REFERENCE_IMAGE_LIMITS.maxCount ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={referenceBusy}
                      className="grid h-16 w-16 place-items-center rounded-[0.75rem] border border-dashed border-black/20 bg-white/70 text-black/40 transition hover:border-black/40 hover:text-black/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {referenceBusy ? <Loader2 className="animate-spin" size={16} /> : <Plus size={18} />}
                    </button>
                  ) : null}
                </div>
                {references.length >= REFERENCE_IMAGE_LIMITS.maxCount ? (
                  <p className="text-xs text-black/45">已达 {REFERENCE_IMAGE_LIMITS.maxCount} 张上限</p>
                ) : null}
                {referenceError ? <p className="text-xs text-black/62">{referenceError}</p> : null}
              </div>
              <label className="grid gap-2 text-[13px] font-semibold text-black/55">
                补充说明
                <textarea
                  name="extra"
                  className="min-h-20 rounded-[1rem] border border-black/10 bg-white p-3.5 text-sm font-normal text-black outline-none transition placeholder:text-black/42 focus:border-black/30"
                  placeholder="例如：背景干净，适合广告图，顶部留出标题空间"
                  defaultValue={initialValues.extra}
                />
              </label>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(event) => void addReferenceFiles(event.target.files)}
            />
          </div>
        </div>

        <button
          disabled={loading || credits < 1}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-3.5 font-semibold text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          {loading ? "正在生成图片" : "生成图片"}
        </button>
      </form>

      <section ref={resultSectionRef} className="flex min-h-[620px] flex-col rounded-[2rem] border border-black/10 bg-white/78 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.045)] backdrop-blur">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-5">
          <div>
            <p className="font-display text-2xl tracking-[0.12em] text-black/40">PREVIEW</p>
            <h2 className="mt-2 text-3xl font-light text-black">图片结果</h2>
          </div>
          <p className="text-sm text-black/52">成功生成后扣 1 积分</p>
        </div>

        {credits < 1 || error === "insufficient_credits" ? <UpgradePrompt /> : null}
        {error && error !== "insufficient_credits" ? (
          <p className="mb-5 rounded-[1.25rem] border border-black/10 bg-white p-4 text-sm text-black/72">{getErrorMessage(error)}</p>
        ) : null}

        {loading ? (
          <div className="grid min-h-[470px] flex-1 place-items-center rounded-[1.5rem] border border-black/10 bg-[#f8faf7] text-center">
            <div className="w-full max-w-sm px-6">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-black/10 bg-white shadow-[0_18px_40px_rgba(0,0,0,0.06)]">
                <Loader2 className="animate-spin" size={24} />
              </div>
              <h3 className="mt-6 text-3xl font-light text-black">正在生成图片</h3>
              <p className="mt-3 text-sm leading-6 text-black/58">高质量图片通常需要一点时间。请保持页面打开，完成后会自动显示在这里。</p>

              <div className="mt-7 h-px overflow-hidden bg-black/10">
                <div className="h-full w-2/3 animate-pulse bg-black" />
              </div>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/62">
                <Clock3 size={16} />
                已等待 {elapsedSeconds} 秒
              </div>
            </div>
          </div>
        ) : imageUrl ? (
          <div>
            <div className="rounded-[1.5rem] border border-black/10 bg-[#f8faf7] p-4">
              <Image className="h-auto w-full rounded-[1rem] border border-black/10 object-cover" src={imageUrl} alt="生成图片结果" width={1024} height={1024} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href={imageUrl}
                download
                className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/90"
              >
                <Download size={16} />
                下载图片
              </a>
              {generationId ? <GenerationFeedback generationId={generationId} initialFeedback={generationFeedback} /> : null}
            </div>
          </div>
        ) : (
          <div className="grid min-h-[470px] flex-1 place-items-center rounded-[1.5rem] border border-dashed border-black/15 bg-[#f8faf7] text-center">
            <div className="max-w-sm px-6">
              <p className="font-display text-3xl tracking-[0.12em] text-black/36">EMPTY</p>
              <p className="mt-4 text-lg font-light text-black">生成结果会显示在这里</p>
              <p className="mt-2 text-sm leading-6 text-black/52">填写左侧内容后，点击生成图片开始创作。</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

async function readJsonResponse<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getErrorMessage(error: string) {
  const messages: Record<string, string> = {
    provider_unavailable: "生成服务暂时繁忙，请稍后再试。",
    image_generation_failed: "图片生成失败，请稍后重试。",
    storage_unavailable: "图片保存失败，请稍后重试。",
    network_error: "网络连接异常，请检查后重试。",
    generation_failed: "生成失败，请稍后重试。",
    profile_unavailable: "积分读取失败，请刷新页面后重试。",
    generation_record_failed: "结果保存失败，请稍后重试。",
    not_authenticated: "请登录后再生成图片。",
    insufficient_credits: "积分余额不足，请购买积分后再试。",
  };

  return messages[error] ?? "生成失败，请稍后重试。";
}

function SelectField<T extends Record<string, { label: string }>>({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: T;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-black">
      {label}
      <select name={name} defaultValue={defaultValue} className="rounded-full border border-black/10 bg-[#f8faf7] px-4 py-3 font-normal text-black outline-none transition focus:border-black/30 focus:bg-white">
        {Object.entries(options).map(([value, option]) => (
          <option key={value} value={value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
