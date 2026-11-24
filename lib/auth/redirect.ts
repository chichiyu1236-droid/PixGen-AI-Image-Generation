const SAFE_ORIGIN = "https://pixgen.local";
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/**
 * Normalizes an untrusted `next` query parameter into a safe in-app relative path.
 * Blocks external origins, protocol-relative `//`, backslashes, control characters,
 * and self-redirect loops (`/login`, `/auth/callback`).
 */
export function getSafeNextPath(
  next: string | null | undefined,
  fallback = "/generate",
): string {
  if (
    typeof next !== "string" ||
    next.length === 0 ||
    !next.startsWith("/") ||
    next.includes("//") ||
    next.includes("\\") ||
    CONTROL_CHARS_RE.test(next)
  ) {
    return fallback;
  }

  let parsed: URL;
  try {
    parsed = new URL(next, SAFE_ORIGIN);
  } catch {
    return fallback;
  }

  if (parsed.origin !== SAFE_ORIGIN) {
    return fallback;
  }

  const { pathname } = parsed;
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/auth/callback/")
  ) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
