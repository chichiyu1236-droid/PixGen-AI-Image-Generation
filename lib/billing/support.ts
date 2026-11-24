const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reads the public customer support email configured via NEXT_PUBLIC_SUPPORT_EMAIL.
 * Returns an empty string when unset or invalid so UI can cleanly degrade.
 */
export function getSupportEmail(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();

  if (!raw || !EMAIL_PATTERN.test(raw)) {
    return "";
  }

  return raw;
}

/**
 * Builds a mailto: URI for the given support email with optional subject and body.
 * Returns an empty string when email is empty or invalid.
 */
export function buildSupportMailto(
  email: string,
  options?: { subject?: string; body?: string },
): string {
  const trimmed = email.trim();

  if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
    return "";
  }

  const params = new URLSearchParams();

  if (options?.subject) {
    params.set("subject", options.subject);
  }

  if (options?.body) {
    params.set("body", options.body);
  }

  const query = params.toString().replace(/\+/g, "%20");

  return query ? `mailto:${trimmed}?${query}` : `mailto:${trimmed}`;
}

/**
 * Returns user-facing Chinese contact copy, falling back cleanly when no support
 * email is configured in the environment.
 */
export function getSupportContactText(email?: string): string {
  const resolved = (email ?? getSupportEmail()).trim();

  if (resolved && EMAIL_PATTERN.test(resolved)) {
    return `如有订单、积分或退款相关疑问，请发送邮件至 ${resolved} 联系人工客服处理。`;
  }

  return "如有订单、积分或退款相关疑问，请保留注册邮箱与订单编号并联系站点客服处理。";
}

/**
 * Validates that an external checkout redirect URL strictly uses https: protocol,
 * blocking javascript:, data:, http:, and malformed URLs.
 */
export function isSafeHttpsUrl(url: string | null | undefined): url is string {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Navigates the browser to a validated external HTTPS checkout URL. */
export function redirectToExternalUrl(url: string): void {
  if (!isSafeHttpsUrl(url)) {
    return;
  }

  window.location.assign(url.trim());
}
