import { describe, expect, it } from "vitest";
import { getSafeNextPath } from "@/lib/auth/redirect";

describe("getSafeNextPath", () => {
  it("falls back when next is null, undefined, or empty", () => {
    expect(getSafeNextPath(null)).toBe("/generate");
    expect(getSafeNextPath(undefined)).toBe("/generate");
    expect(getSafeNextPath("")).toBe("/generate");
    expect(getSafeNextPath(null, "/auth/reset-password")).toBe("/auth/reset-password");
  });

  it("allows valid internal paths with query strings", () => {
    expect(getSafeNextPath("/upgrade")).toBe("/upgrade");
    expect(getSafeNextPath("/generate?mode=agent")).toBe("/generate?mode=agent");
    expect(getSafeNextPath("/auth/reset-password")).toBe("/auth/reset-password");
    expect(getSafeNextPath("/pay/123e4567-e89b-12d3-a456-426614174000?stripe_session_id=cs_test_123")).toBe(
      "/pay/123e4567-e89b-12d3-a456-426614174000?stripe_session_id=cs_test_123",
    );
  });

  it("blocks external URLs, protocol-relative paths, backslashes, and control characters", () => {
    expect(getSafeNextPath("https://attacker.example/phish")).toBe("/generate");
    expect(getSafeNextPath("http://attacker.example")).toBe("/generate");
    expect(getSafeNextPath("javascript:alert(1)")).toBe("/generate");
    expect(getSafeNextPath("//attacker.example")).toBe("/generate");
    expect(getSafeNextPath("/foo//bar")).toBe("/generate");
    expect(getSafeNextPath("/\\attacker.example")).toBe("/generate");
    expect(getSafeNextPath("/generate\\evil")).toBe("/generate");
    expect(getSafeNextPath("/generate\r\nSet-Cookie: bad=1")).toBe("/generate");
    expect(getSafeNextPath("/generate\u0000")).toBe("/generate");
    expect(getSafeNextPath("/generate\u007f")).toBe("/generate");
    expect(getSafeNextPath("generate")).toBe("/generate");
  });

  it("blocks auth loop paths (/login and /auth/callback)", () => {
    expect(getSafeNextPath("/login")).toBe("/generate");
    expect(getSafeNextPath("/login?next=/upgrade")).toBe("/generate");
    expect(getSafeNextPath("/login/sub")).toBe("/generate");
    expect(getSafeNextPath("/auth/callback")).toBe("/generate");
    expect(getSafeNextPath("/auth/callback?code=abc")).toBe("/generate");
    expect(getSafeNextPath("/auth/callback/extra")).toBe("/generate");
  });
});
