"use client";

import {
  Check,
  Clock3,
  Copy,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  Maximize2,
  RotateCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { GenerationFeedback } from "@/components/generation-feedback";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { compressImageToBase64, type ReferenceImageFile } from "@/lib/media/compress-image";
import {
  aspectRatios,
  imageTypes,
  scenes,
  styles,
  whitespaceOptions,
  type AspectRatioId,
  type ImageTypeId,
  type SceneId,
  type StyleId,
  type WhitespaceId,
} from "@/lib/prompts/options";
import { REFERENCE_IMAGE_LIMITS } from "@/lib/validation/generate";
import type { GenerateRequest } from "@/lib/validation/generate";

type GenerationResult = {
  generation: {
    id: string;
    image_url: string | null;
    final_prompt?: string | null;
    feedback: "liked" | "disliked" | null;
  };
  remainingCredits?: { totalCredits?: number } | null;
};

type GenerateError = {
  error: string;
};

type SessionArtwork = {
  id: string;
  imageUrl: string;
  feedback: "liked" | "disliked" | null;
  finalPrompt: string | null;
  aspectRatioLabel: string;
  styleLabel: string;
};

const REFERENCE_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const RATIO_META: Record<AspectRatioId, { boxClass: string; caption: string }> = {
  square: { boxClass: "h-6 w-6", caption: "方图主图" },
  portrait: { boxClass: "h-7 w-5", caption: "竖图封面" },
  landscape: { boxClass: "h-4 w-7", caption: "宽幅海报" },
};

const STYLE_SWATCHES: Record<StyleId, [string, string]> = {
  premium_minimal: ["#e9e4d7", "#7d887a"],
  soft_realistic: ["#dcd6c8", "#a49174"],
  vibrant_ad: ["#f0d8b2", "#c87a54"],
  soft_3d: ["#d9e3e8", "#8aa2ae"],
  editorial_illustration: ["#ead5cc", "#687c6c"],
  luxury_commercial: ["#cbb389", "#373a34"],
};

const WHITESPACE_LAYOUT: Record<WhitespaceId, string> = {
  balanced: "items-center justify-center",
  top_space: "items-end justify-center pb-0.5",
  left_space: "items-center justify-end pr-0.5",
  right_space: "items-center justify-start pl-0.5",
};

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
  const [imageType, setImageType] = useState<ImageTypeId>(initialValues.imageType ?? "ecommerce_hero");
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>(initialValues.aspectRatio ?? "square");
  const [style, setStyle] = useState<StyleId>(initialValues.style ?? "premium_minimal");
  const [scene, setScene] = useState<SceneId>(initialValues.scene ?? "studio");
  const [whitespace, setWhitespace] = useState<WhitespaceId>(initialValues.whitespace ?? "balanced");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveCredits, setLiveCredits] = useState(credits);
  const [artworks, setArtworks] = useState<SessionArtwork[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [references, setReferences] = useState<ReferenceImageFile[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLiveCredits(credits);
  }, [credits]);

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
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen]);

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

  function onDropReferences(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (references.length < REFERENCE_IMAGE_LIMITS.maxCount && !referenceBusy) {
      void addReferenceFiles(event.dataTransfer.files);
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

    if (liveCredits < 1) {
      setError("insufficient_credits");
      return;
    }

    setLoading(true);
    setElapsedSeconds(0);
    setError(null);
    setShowPrompt(false);

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

      if (!body || !("generation" in body) || !body.generation.image_url) {
        setError("generation_failed");
        return;
      }

      const nextArtwork: SessionArtwork = {
        id: body.generation.id,
        imageUrl: body.generation.image_url,
        feedback: body.generation.feedback,
        finalPrompt: body.generation.final_prompt ?? null,
        aspectRatioLabel: aspectRatios[aspectRatio].label,
        styleLabel: styles[style].label,
      };

      setArtworks((prev) => {
        const updated = [...prev, nextArtwork];
        setActiveIdx(updated.length - 1);
        return updated;
      });

      if (typeof body.remainingCredits?.totalCredits === "number") {
        setLiveCredits(body.remainingCredits.totalCredits);
      } else {
        setLiveCredits((prev) => Math.max(0, prev - 1));
      }

      router.refresh();
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }

  const activeArtwork = artworks[Math.min(activeIdx, artworks.length - 1)] ?? null;

  async function handleCopyPrompt() {
    if (!activeArtwork?.finalPrompt) return;
    await navigator.clipboard.writeText(activeArtwork.finalPrompt);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1800);
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[400px_1fr] xl:grid-cols-[424px_1fr] lg:overflow-hidden">
      {/* LEFT PANEL: Scrollable visual parameter controls + sticky bottom submit bar */}
      <form
        ref={formRef}
        onSubmit={onSubmit}
        aria-busy={loading}
        className="flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/90 shadow-[0_18px_50px_rgba(23,25,22,0.045)] backdrop-blur-md"
      >
        {/* Hidden inputs keeping FormData payload 100% compatible with /api/generate */}
        <input type="hidden" name="imageType" value={imageType} />
        <input type="hidden" name="aspectRatio" value={aspectRatio} />
        <input type="hidden" name="style" value={style} />
        <input type="hidden" name="scene" value={scene} />
        <input type="hidden" name="whitespace" value={whitespace} />

        <div className="studio-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="border-b border-[#171916]/8 pb-4">
            <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">CREATE</p>
            <h2 className="mt-1 font-display text-2xl font-normal text-[#171916]">告诉我们你想要什么</h2>
            <p className="mt-1.5 text-xs leading-5 text-[#6d7368]">
              写下画面主体，点选下方可视化比例与风格卡，系统会自动补足构图与光线。
            </p>
          </div>

          {/* 1. Primary Subject Input (top priority) */}
          <label className="grid gap-2 text-xs font-semibold tracking-wide text-[#171916]">
            <span>主体描述</span>
            <textarea
              name="subject"
              required
              minLength={2}
              rows={3}
              className="min-h-[88px] resize-none rounded-2xl border border-[#171916]/12 bg-[#f4f0e5]/75 p-3.5 text-sm font-normal leading-6 text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/50 focus:bg-[#fbf9f3]"
              placeholder="例如：一瓶高端护肤精华，透明玻璃瓶，银色瓶盖"
              defaultValue={initialValues.subject}
            />
          </label>

          {/* 2. Aspect Ratio Visual Wireframe Cards */}
          <div className="grid gap-2">
            <span className="text-xs font-semibold tracking-wide text-[#171916]">画面比例</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="画面比例">
              {(Object.entries(aspectRatios) as [AspectRatioId, (typeof aspectRatios)[AspectRatioId]][]).map(
                ([value, option]) => {
                  const active = aspectRatio === value;
                  const meta = RATIO_META[value];
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setAspectRatio(value)}
                      className={[
                        "flex flex-col items-center justify-center rounded-2xl border px-2 py-3 transition",
                        active
                          ? "border-[#171916] bg-[#171916] text-[#faf7ef] shadow-[0_8px_20px_rgba(23,25,22,0.14)]"
                          : "border-[#171916]/10 bg-[#f4f0e5]/65 text-[#484e45] hover:border-[#171916]/25 hover:bg-[#fbf9f3]",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden
                        className={`mb-2 block rounded-[4px] border-[1.5px] ${meta.boxClass} ${
                          active ? "border-[#faf7ef]/85 bg-white/10" : "border-[#6d7368]/60 bg-[#fbf9f3]"
                        }`}
                      />
                      <span className="text-xs font-semibold tabular-nums">{option.label}</span>
                      <span className={`mt-0.5 text-[10px] ${active ? "text-[#faf7ef]/70" : "text-[#6d7368]"}`}>
                        {meta.caption}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* 3. Image Type Chips */}
          <div className="grid gap-2">
            <span className="text-xs font-semibold tracking-wide text-[#171916]">图片用途</span>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="图片用途">
              {(Object.entries(imageTypes) as [ImageTypeId, (typeof imageTypes)[ImageTypeId]][]).map(
                ([value, option]) => {
                  const active = imageType === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setImageType(value)}
                      className={[
                        "rounded-xl border px-2.5 py-2 text-center text-xs transition",
                        active
                          ? "border-[#384a3a] bg-[#e7eee5] font-semibold text-[#243426]"
                          : "border-[#171916]/10 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/25 hover:text-[#171916]",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* 4. Visual Style Swatch Cards */}
          <div className="grid gap-2">
            <span className="text-xs font-semibold tracking-wide text-[#171916]">画面质感</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="画面质感">
              {(Object.entries(styles) as [StyleId, (typeof styles)[StyleId]][]).map(([value, option]) => {
                const active = style === value;
                const [sw1, sw2] = STYLE_SWATCHES[value];
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStyle(value)}
                    className={[
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-xs transition",
                      active
                        ? "border-[#171916] bg-[#171916] font-medium text-[#faf7ef]"
                        : "border-[#171916]/10 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/25 hover:text-[#171916]",
                    ].join(" ")}
                  >
                    <span className="flex shrink-0 -space-x-1" aria-hidden>
                      <span className="h-3.5 w-3.5 rounded-full border border-white/60" style={{ backgroundColor: sw1 }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-white/60" style={{ backgroundColor: sw2 }} />
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Scene & Whitespace Compact Selectors */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="grid gap-2">
              <span className="text-xs font-semibold tracking-wide text-[#171916]">场景氛围</span>
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-[#171916]/10 bg-[#f4f0e5]/80 p-1" role="radiogroup" aria-label="场景氛围">
                {(Object.entries(scenes) as [SceneId, (typeof scenes)[SceneId]][]).map(([value, option]) => {
                  const active = scene === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setScene(value)}
                      className={[
                        "rounded-xl py-1.5 text-xs transition",
                        active
                          ? "bg-[#fbf9f3] font-semibold text-[#171916] shadow-[0_2px_8px_rgba(23,25,22,0.08)]"
                          : "text-[#6d7368] hover:text-[#171916]",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-xs font-semibold tracking-wide text-[#171916]">留白构图</span>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="留白构图">
                {(Object.entries(whitespaceOptions) as [WhitespaceId, (typeof whitespaceOptions)[WhitespaceId]][]).map(
                  ([value, option]) => {
                    const active = whitespace === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setWhitespace(value)}
                        className={[
                          "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition",
                          active
                            ? "border-[#384a3a] bg-[#e7eee5] font-semibold text-[#243426]"
                            : "border-[#171916]/10 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/25",
                        ].join(" ")}
                      >
                        <span
                          aria-hidden
                          className={`flex h-4 w-5 shrink-0 rounded-[3px] border ${WHITESPACE_LAYOUT[value]} ${
                            active ? "border-[#384a3a]/45 bg-[#fbf9f3]" : "border-[#171916]/15 bg-[#f4f0e5]"
                          }`}
                        >
                          <span className={`h-1.5 w-2 rounded-[1px] ${active ? "bg-[#384a3a]" : "bg-[#92978b]"}`} />
                        </span>
                        <span>{option.label}</span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>

          {/* 6. Reference Images & Supplementary Notes ("参考与补充") */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-[#171916]">参考与补充</span>
              <span className="text-[11px] tabular-nums text-[#6d7368]">
                {references.length} / {REFERENCE_IMAGE_LIMITS.maxCount} 张参考图
              </span>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDropReferences}
              className={[
                "grid gap-3.5 rounded-2xl border p-3.5 transition",
                dragActive
                  ? "border-[#566c58] bg-[#e7eee5]/65"
                  : "border-[#171916]/10 bg-[#f4f0e5]/65",
              ].join(" ")}
            >
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  {references.map((reference) => (
                    <div key={reference.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview; no remote optimization needed */}
                      <img
                        src={reference.previewUrl}
                        alt="参考图"
                        className="h-16 w-16 rounded-xl border border-[#171916]/12 bg-[#fbf9f3] object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeReference(reference.id)}
                        aria-label="移除参考图"
                        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#171916] text-[#faf7ef] shadow transition hover:bg-[#2a2e28]"
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
                      className="flex h-16 flex-1 min-w-[132px] items-center justify-center gap-2 rounded-xl border border-dashed border-[#171916]/20 bg-[#fbf9f3]/80 px-3 text-xs text-[#6d7368] transition hover:border-[#566c58]/50 hover:text-[#171916] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {referenceBusy ? (
                        <Loader2 className="animate-spin" size={15} />
                      ) : (
                        <>
                          <Upload size={14} aria-hidden />
                          <span>上传或拖入参考图</span>
                        </>
                      )}
                    </button>
                  ) : null}
                </div>

                {references.length >= REFERENCE_IMAGE_LIMITS.maxCount ? (
                  <p className="text-xs font-medium text-[#8a6a3f]">
                    已达 {REFERENCE_IMAGE_LIMITS.maxCount} 张上限
                  </p>
                ) : null}
                {referenceError ? <p className="text-xs text-[#8f3b2e]">{referenceError}</p> : null}
              </div>

              <label className="grid gap-1.5 text-xs font-medium text-[#484e45]">
                <span>补充说明（可选）</span>
                <textarea
                  name="extra"
                  rows={2}
                  className="min-h-[68px] resize-none rounded-xl border border-[#171916]/10 bg-[#fbf9f3] p-3 text-xs font-normal leading-5 text-[#171916] outline-none transition placeholder:text-[#92978b] focus:border-[#566c58]/45"
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

        {/* Sticky Bottom Submit Action Bar */}
        <div className="border-t border-[#171916]/8 bg-[#f4f0e5]/92 px-5 py-3.5 backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-[11px] tabular-nums text-[#6d7368]">
            <span>
              {aspectRatios[aspectRatio].label} · {styles[style].label} · {scenes[scene].label}
            </span>
            <span>本次消耗 1 积分（余 {liveCredits}）</span>
          </div>
          <button
            type="submit"
            disabled={loading || liveCredits < 1}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3 text-sm font-medium text-[#faf7ef] shadow-[0_12px_28px_rgba(23,25,22,0.16)] transition hover:bg-[#2a2e28] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
            {loading ? "正在生成图片" : "生成图片"}
          </button>
        </div>
      </form>

      {/* RIGHT PANEL: Full-Height Light-Linen Gallery Canvas Stage + Session Filmstrip */}
      <section
        ref={resultSectionRef}
        className="flex min-h-[520px] flex-col overflow-hidden rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/82 p-4 shadow-[0_18px_50px_rgba(23,25,22,0.045)] backdrop-blur-md lg:min-h-0 lg:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#171916]/8 pb-3">
          <div className="flex items-baseline gap-2.5">
            <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">CANVAS</p>
            <h2 className="font-display text-lg font-normal text-[#171916]">商业画布</h2>
          </div>
          <p className="text-xs text-[#6d7368]">成功生成后扣 1 积分 · 失败自动不扣费</p>
        </div>

        {liveCredits < 1 || error === "insufficient_credits" ? <UpgradePrompt /> : null}
        {error && error !== "insufficient_credits" ? (
          <p className="mb-3 rounded-2xl border border-[#b45340]/25 bg-[#fdf3f0] px-4 py-3 text-xs text-[#8a3222]">
            {getErrorMessage(error)}
          </p>
        ) : null}

        {/* Main Canvas Viewport */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {loading ? (
            <div className="relative grid min-h-[380px] flex-1 place-items-center overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#f2eee2]">
              <Image
                src="/images/oil-section-wash.webp"
                alt=""
                fill
                sizes="60vw"
                className="oil-breathe object-cover opacity-75"
              />
              <div className="relative z-10 w-full max-w-sm rounded-[1.75rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-7 text-center shadow-[0_20px_50px_rgba(23,25,22,0.08)] backdrop-blur-md">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#566c58]/25 bg-[#e7eee5] text-[#384a3a]">
                  <Loader2 className="animate-spin" size={22} aria-hidden />
                </div>
                <h3 className="mt-5 font-display text-2xl font-normal text-[#171916]">正在绘制商业成片</h3>
                <p className="mt-2 text-xs leading-6 text-[#484e45]">
                  正在融合构图比例、材质光影与留白层次，请保持当前页面打开。
                </p>
                <div className="mt-5 h-1 overflow-hidden rounded-full bg-[#171916]/8">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-[#566c58]" />
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#171916]/10 bg-[#f4f0e5] px-3.5 py-1.5 text-xs tabular-nums text-[#484e45]">
                  <Clock3 size={13} aria-hidden />
                  已等待 {elapsedSeconds} 秒
                </div>
              </div>
            </div>
          ) : activeArtwork ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {/* Framed Result Artwork */}
              <div className="relative grid min-h-[340px] flex-1 place-items-center overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#f1ede2]/90 p-4">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="group relative flex max-h-full max-w-full items-center justify-center focus:outline-none"
                  aria-label="放大查看生成图片"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase/mock image adapts naturally to aspect ratio */}
                  <img
                    src={activeArtwork.imageUrl}
                    alt="生成图片结果"
                    className="max-h-[56vh] w-auto max-w-full rounded-xl border border-[#171916]/10 bg-[#fbf9f3] object-contain shadow-[0_20px_50px_rgba(23,25,22,0.12)] transition duration-300 group-hover:scale-[1.01] lg:max-h-[calc(100vh-20.5rem)]"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[#171916]/72 px-2.5 py-1 text-[11px] text-[#faf7ef] opacity-0 backdrop-blur transition group-hover:opacity-100">
                    <Maximize2 size={11} aria-hidden /> 灯箱查看
                  </span>
                </button>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#171916]/8 bg-[#f4f0e5]/75 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3 py-1.5 text-xs font-medium text-[#171916] transition hover:border-[#171916]/30"
                  >
                    <Maximize2 size={13} aria-hidden />
                    放大查看
                  </button>
                  <a
                    href={activeArtwork.imageUrl}
                    download
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#171916] px-3.5 py-1.5 text-xs font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                  >
                    <Download size={13} aria-hidden />
                    下载原图
                  </a>
                  <button
                    type="button"
                    onClick={() => formRef.current?.requestSubmit()}
                    disabled={loading || liveCredits < 1}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/30 hover:text-[#171916] disabled:opacity-45"
                  >
                    <RotateCw size={13} aria-hidden />
                    重新生成
                  </button>
                  {activeArtwork.finalPrompt ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleCopyPrompt()}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/30 hover:text-[#171916]"
                      >
                        {copiedPrompt ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                        {copiedPrompt ? "已复制提示词" : "复制提示词"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPrompt((v) => !v)}
                        aria-expanded={showPrompt}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/30 hover:text-[#171916]"
                      >
                        <FileText size={13} aria-hidden />
                        {showPrompt ? "收起 Prompt" : "查看 Prompt"}
                      </button>
                    </>
                  ) : null}
                </div>

                <GenerationFeedback
                  key={activeArtwork.id}
                  generationId={activeArtwork.id}
                  initialFeedback={activeArtwork.feedback}
                  compact
                />
              </div>

              {showPrompt && activeArtwork.finalPrompt ? (
                <div className="max-h-28 overflow-y-auto rounded-xl border border-[#171916]/10 bg-[#fbf9f3] px-3.5 py-2.5 font-mono text-[11px] leading-5 text-[#484e45]">
                  {activeArtwork.finalPrompt}
                </div>
              ) : null}

              {/* Session Filmstrip */}
              {artworks.length > 1 ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-0.5 pt-0.5">
                  <span className="shrink-0 text-[11px] font-medium text-[#6d7368]">本次成片</span>
                  {artworks.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveIdx(idx)}
                      className={[
                        "relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 transition",
                        idx === activeIdx
                          ? "border-[#171916] shadow-sm"
                          : "border-transparent opacity-70 hover:opacity-100",
                      ].join(" ")}
                      aria-label={`切换到第 ${idx + 1} 张会话结果`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={`会话缩略图 ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
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
                  <ImagePlus size={20} aria-hidden />
                </div>
                <p className="mt-4 font-display text-xs tracking-[0.24em] text-[#6d7368] uppercase">ATELIER STAGE</p>
                <p className="mt-2 font-display text-xl font-normal text-[#171916]">生成结果会显示在这里</p>
                <p className="mt-2 text-xs leading-6 text-[#484e45]">
                  在左侧写下主体、点选比例与画面质感，点击「生成图片」即可在浅亚麻画布上实时呈现高清成片。
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Lightbox Modal */}
      {lightboxOpen && activeArtwork ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#171916]/80 p-4 backdrop-blur-md sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="高清大图预览"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative flex max-h-[92vh] max-w-5xl flex-col items-center gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="关闭大图预览"
              className="absolute -top-2 right-0 grid h-9 w-9 place-items-center rounded-full bg-[#fbf9f3] text-[#171916] shadow-lg transition hover:bg-white"
            >
              <X size={18} aria-hidden />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeArtwork.imageUrl}
              alt="高清成片大图"
              className="mt-8 max-h-[78vh] w-auto max-w-full rounded-2xl border border-white/15 bg-[#fbf9f3] object-contain shadow-2xl"
            />
            <div className="flex items-center gap-3 rounded-full bg-[#fbf9f3]/92 px-5 py-2 text-xs text-[#171916] shadow-lg">
              <span>
                {activeArtwork.aspectRatioLabel} · {activeArtwork.styleLabel}
              </span>
              <a
                href={activeArtwork.imageUrl}
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
    insufficient_credits: "积分余额不足，请购买会员卡后再试。",
  };

  return messages[error] ?? "生成失败，请稍后重试。";
}
