"use client";

import { ExternalLink, ImageOff, Loader2, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactEventHandler, ReactNode, SyntheticEvent } from "react";

export const DEFAULT_IMAGE_RETRY_DELAYS_MS = [600, 1500, 3000] as const;

export function buildRetryImageUrl(src: string, retryCount: number): string {
  if (retryCount <= 0) {
    return src;
  }

  const trimmed = src.trim();
  if (!trimmed || /^(blob|data):/i.test(trimmed)) {
    return src;
  }

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      parsed.searchParams.set("_retry", String(retryCount));
      return parsed.toString();
    }

    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
      const parsed = new URL(trimmed, "http://placeholder.local");
      parsed.searchParams.set("_retry", String(retryCount));
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return src;
  }

  return src;
}

export function getSafeOriginalImageUrl(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export type ResilientImageProps = {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  /** Compact mode for small thumbnails inside an outer <button> (renders phrasing elements only, no nested buttons). */
  compact?: boolean;
  /** Optional click handler for full-size interactive images; only wraps the image so error actions are never nested inside a button. */
  onImageClick?: () => void;
  imageClickLabel?: string;
  imageButtonClassName?: string;
  /** Optional overlay shown over the loaded image (e.g. hover lightbox badge or version pill). */
  overlay?: ReactNode;
  /** Backoff delays in ms for automatic retries. Defaults to [600, 1500, 3000]. */
  retryDelaysMs?: readonly number[];
  /** Show "新窗口打开原图" link in full error state when src is a safe http/https/relative URL. Defaults to true. */
  showOriginalLink?: boolean;
  onLoad?: ReactEventHandler<HTMLImageElement>;
};

type ImageLoadStatus = "loading" | "retrying" | "loaded" | "failed";

export function ResilientImage(props: ResilientImageProps) {
  return <ResilientImageInner key={props.src} {...props} />;
}

function ResilientImageInner({
  src,
  alt,
  className,
  containerClassName,
  compact = false,
  onImageClick,
  imageClickLabel,
  imageButtonClassName,
  overlay,
  retryDelaysMs = DEFAULT_IMAGE_RETRY_DELAYS_MS,
  showOriginalLink = true,
  onLoad,
}: ResilientImageProps) {
  const [status, setStatus] = useState<ImageLoadStatus>("loading");
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (status !== "loading") return;
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setStatus("loaded");
    }
  }, [requestAttempt, status]);

  function clearPendingTimer() {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    clearPendingTimer();
    setStatus("loaded");
    onLoad?.(event);
  }

  function handleError() {
    clearPendingTimer();

    const nextRetryIndex = autoRetryCount;
    if (nextRetryIndex < retryDelaysMs.length) {
      const delay = retryDelaysMs[nextRetryIndex] ?? DEFAULT_IMAGE_RETRY_DELAYS_MS[0];
      const nextAttempt = requestAttempt + 1;
      setAutoRetryCount(nextRetryIndex + 1);
      setStatus("retrying");
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRequestAttempt(nextAttempt);
        setStatus("loading");
      }, delay);
      return;
    }

    setStatus("failed");
  }

  function handleManualReload(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    clearPendingTimer();
    setAutoRetryCount(0);
    setRequestAttempt((prev) => prev + 1);
    setStatus("loading");
  }

  const displaySrc = buildRetryImageUrl(src, requestAttempt);
  const safeOriginalUrl = showOriginalLink ? getSafeOriginalImageUrl(src) : null;
  const maxRetries = retryDelaysMs.length;

  if (compact) {
    return (
      <span className={["relative block overflow-hidden", containerClassName].filter(Boolean).join(" ")}>
        {status === "loading" || status === "loaded" ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase/mock image with retry cache-busting
          <img
            ref={imgRef}
            key={requestAttempt}
            src={displaySrc}
            alt={alt}
            onLoad={handleLoad}
            onError={handleError}
            className={className}
          />
        ) : null}

        {status === "loading" || status === "retrying" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 grid place-items-center bg-[#f4f0e5]/75 text-[#6d7368]"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        ) : null}

        {status === "failed" ? (
          <span
            role="img"
            aria-label={`${alt}（加载失败）`}
            title="图片加载失败"
            className="grid h-full w-full place-items-center bg-[#f4f0e5] text-[#8a6a3f]"
          >
            <ImageOff className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
      </span>
    );
  }

  if (status === "failed") {
    return (
      <div
        className={[
          "flex flex-col items-center justify-center rounded-2xl border border-[#171916]/12 bg-[#fbf9f3]/95 text-center shadow-[0_12px_32px_rgba(23,25,22,0.06)]",
          showOriginalLink ? "min-h-[200px] min-w-[260px] max-w-sm px-10 py-6" : "min-h-[112px] w-full px-3 py-4",
          containerClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full border border-[#b45340]/20 bg-[#fdf3f0] text-[#8a3222]">
          <ImageOff size={18} aria-hidden />
        </span>
        <p className="mt-3 text-xs font-medium text-[#171916]">图片加载失败</p>
        {showOriginalLink ? (
          <p className="mt-1 text-[11px] leading-5 text-[#6d7368]">可能是网络瞬断或图片同步延迟，可手动重载。</p>
        ) : null}
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleManualReload}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#171916] px-3.5 py-1.5 text-xs font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
          >
            <RotateCw size={12} aria-hidden />
            重新加载图片
          </button>
          {safeOriginalUrl ? (
            <a
              href={safeOriginalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full border border-[#171916]/15 bg-[#f4f0e5]/85 px-3 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/30 hover:text-[#171916]"
            >
              <ExternalLink size={12} aria-hidden />
              新窗口打开原图
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  const loadingMessage =
    status === "retrying" || (status === "loading" && autoRetryCount > 0)
      ? `正在重新加载图片（${Math.min(autoRetryCount, maxRetries)}/${maxRetries}）…`
      : requestAttempt > 0
        ? "正在重新加载图片…"
        : "正在加载图片…";

  const imageBody = (
    <>
      {status !== "retrying" ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase/mock image with retry cache-busting
        <img
          ref={imgRef}
          key={requestAttempt}
          src={displaySrc}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className={className}
        />
      ) : null}

      {status === "loading" || status === "retrying" ? (
        <span
          role="status"
          aria-live="polite"
          className={[
            "pointer-events-none flex items-center justify-center gap-2 rounded-full border border-[#171916]/10 bg-[#fbf9f3]/92 px-3.5 py-1.5 text-xs text-[#484e45] shadow-sm backdrop-blur",
            status === "retrying" ? "" : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#566c58]" aria-hidden />
          <span className="whitespace-nowrap">{loadingMessage}</span>
        </span>
      ) : null}

      {status === "loaded" ? overlay : null}
    </>
  );

  const pendingLayoutClass =
    status !== "loaded"
      ? showOriginalLink
        ? "min-h-[160px] min-w-[200px] items-center justify-center"
        : "min-h-[96px] items-center justify-center"
      : "";

  if (onImageClick) {
    return (
      <div
        className={[
          "relative flex max-h-full max-w-full items-center justify-center",
          pendingLayoutClass,
          containerClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          onClick={onImageClick}
          aria-label={imageClickLabel ?? alt}
          className={[
            imageButtonClassName ?? "group relative flex max-h-full max-w-full items-center justify-center focus:outline-none",
            status === "retrying" ? "flex items-center justify-center" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {imageBody}
        </button>
      </div>
    );
  }

  return (
    <div
      className={[
        "relative flex max-h-full max-w-full items-center justify-center",
        pendingLayoutClass,
        containerClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {imageBody}
    </div>
  );
}
