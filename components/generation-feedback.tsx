"use client";

import { RotateCw, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Feedback = "liked" | "disliked" | null;

export function GenerationFeedback({
  generationId,
  initialFeedback,
  regenerateHref,
  compact = false,
}: {
  generationId: string;
  initialFeedback: Feedback;
  regenerateHref?: string;
  compact?: boolean;
}) {
  const [feedback, setFeedback] = useState<Feedback>(initialFeedback);
  const [saving, setSaving] = useState(false);

  async function updateFeedback(nextFeedback: Exclude<Feedback, null>) {
    const normalizedFeedback = feedback === nextFeedback ? null : nextFeedback;
    setFeedback(normalizedFeedback);
    setSaving(true);

    try {
      const response = await fetch(`/api/generations/${generationId}/feedback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: normalizedFeedback }),
      });

      if (!response.ok) {
        setFeedback(feedback);
      }
    } catch {
      setFeedback(feedback);
    } finally {
      setSaving(false);
    }
  }

  const sizeClass = compact ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-xs";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={saving}
        onClick={() => void updateFeedback("liked")}
        className={[
          "inline-flex items-center gap-1.5 rounded-full border font-medium transition disabled:opacity-60",
          sizeClass,
          feedback === "liked"
            ? "border-[#384a3a] bg-[#384a3a] text-[#faf7ef]"
            : "border-[#171916]/12 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/25 hover:text-[#171916]",
        ].join(" ")}
      >
        <ThumbsUp size={13} aria-hidden />
        满意
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => void updateFeedback("disliked")}
        className={[
          "inline-flex items-center gap-1.5 rounded-full border font-medium transition disabled:opacity-60",
          sizeClass,
          feedback === "disliked"
            ? "border-[#171916] bg-[#171916] text-[#faf7ef]"
            : "border-[#171916]/12 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/25 hover:text-[#171916]",
        ].join(" ")}
      >
        <ThumbsDown size={13} aria-hidden />
        不满意
      </button>
      {regenerateHref ? (
        <Link
          className={[
            "inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]",
            sizeClass,
          ].join(" ")}
          href={regenerateHref}
        >
          <RotateCw size={13} aria-hidden />
          重新生成
        </Link>
      ) : null}
    </div>
  );
}
