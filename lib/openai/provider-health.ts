import "server-only";

import { getServerEnv } from "@/lib/env";

const UNAVAILABLE_TTL_MS = 5 * 60 * 1000;
// The relay intermittently returns a single 503 while still serving most
// requests; only trip the breaker on consecutive failures, not the first blip.
const FAILURE_THRESHOLD = 2;

let unavailableUntil = 0;
let unavailableReason: string | null = null;
let consecutiveFailures = 0;

export function getImageProviderHealth() {
  const now = Date.now();
  const env = getServerEnv();

  if (unavailableUntil > now) {
    return {
      ok: false,
      model: env.OPENAI_IMAGE_MODEL,
      reason: unavailableReason ?? "provider_unavailable",
      retryAfterSeconds: Math.ceil((unavailableUntil - now) / 1000),
    };
  }

  return {
    ok: true,
    model: env.OPENAI_IMAGE_MODEL,
    reason: null,
    retryAfterSeconds: 0,
  };
}

export function markImageProviderHealthy() {
  consecutiveFailures = 0;
}

/** Records a provider-side failure; the breaker opens on consecutive failures. */
export function markImageProviderFailure(reason: string, ttlMs = UNAVAILABLE_TTL_MS) {
  consecutiveFailures += 1;

  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    unavailableUntil = Date.now() + ttlMs;
    unavailableReason = reason;
  }
}

export function getImageProviderErrorReason(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const value = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = typeof value.status === "number" ? value.status : null;
  const code = typeof value.code === "string" ? value.code : "";
  const message = typeof value.message === "string" ? value.message : "";
  const normalized = `${code} ${message}`.toLowerCase();

  if (
    status === 503 ||
    normalized.includes("auth_unavailable") ||
    normalized.includes("no auth available") ||
    normalized.includes("no available channel") ||
    normalized.includes("model_not_found")
  ) {
    return message || code || "provider_unavailable";
  }

  return null;
}
