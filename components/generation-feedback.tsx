"use client";

import { RotateCw, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Feedback = "liked" | "disliked" | null;

export function GenerationFeedback({
  generationId,
  initialFeedback,
  regenerateHref,
}: {
  generationId: string;
  initialFeedback: Feedback;
  regenerateHref?: string;
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

  return (
    <div className="mt-3 flex flex-wrap gap-2 text-sm">
      <button
        type="button"
        disabled={saving}
        onClick={() => void updateFeedback("liked")}
        className={[
          "inline-flex items-center gap-1 rounded-md border px-3 py-2 font-semibold transition disabled:opacity-60",
          feedback === "liked" ? "border-green-200 bg-green-50 text-green-700" : "border-ink/20",
        ].join(" ")}
      >
        <ThumbsUp size={15} />
        满意
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => void updateFeedback("disliked")}
        className={[
          "inline-flex items-center gap-1 rounded-md border px-3 py-2 font-semibold transition disabled:opacity-60",
          feedback === "disliked" ? "border-red-200 bg-red-50 text-red-700" : "border-ink/20",
        ].join(" ")}
      >
        <ThumbsDown size={15} />
        不满意
      </button>
      {regenerateHref ? (
        <Link className="inline-flex items-center gap-1 rounded-md bg-ink px-3 py-2 font-semibold text-white" href={regenerateHref}>
          <RotateCw size={15} />
          重新生成
        </Link>
      ) : null}
    </div>
  );
}
