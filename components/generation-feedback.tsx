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
    <div className="mt-4 flex flex-wrap gap-2 text-sm">
      <button
        type="button"
        disabled={saving}
        onClick={() => void updateFeedback("liked")}
        className={[
          "inline-flex items-center gap-1 rounded-full border px-4 py-2 font-semibold transition disabled:opacity-60",
          feedback === "liked" ? "border-black bg-black text-white" : "border-black/10 bg-white text-black hover:border-black/25",
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
          "inline-flex items-center gap-1 rounded-full border px-4 py-2 font-semibold transition disabled:opacity-60",
          feedback === "disliked" ? "border-black bg-black text-white" : "border-black/10 bg-white text-black hover:border-black/25",
        ].join(" ")}
      >
        <ThumbsDown size={15} />
        不满意
      </button>
      {regenerateHref ? (
        <Link className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-4 py-2 font-semibold text-black transition hover:border-black/25" href={regenerateHref}>
          <RotateCw size={15} />
          重新生成
        </Link>
      ) : null}
    </div>
  );
}
