import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getSafeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AllowedEmailOtpType =
  | "email"
  | "recovery"
  | "signup"
  | "magiclink"
  | "invite"
  | "email_change";

const ALLOWED_EMAIL_OTP_TYPES = new Set<AllowedEmailOtpType>([
  "email",
  "recovery",
  "signup",
  "magiclink",
  "invite",
  "email_change",
]);

function isAllowedEmailOtpType(value: string | null): value is AllowedEmailOtpType {
  return value !== null && ALLOWED_EMAIL_OTP_TYPES.has(value as AllowedEmailOtpType);
}

function buildLoginErrorUrl(origin: string, errorCode: string, safeNext: string): URL {
  return new URL(`/login?error=${errorCode}&next=${encodeURIComponent(safeNext)}`, origin);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const upstreamError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const rawNext = url.searchParams.get("next");

  const defaultFallback = rawType === "recovery" ? "/auth/reset-password" : "/generate";
  const safeNext = getSafeNextPath(rawNext, defaultFallback);

  if (upstreamError) {
    console.error(
      "[auth/callback] upstream auth error:",
      upstreamError,
      url.searchParams.get("error_description") ?? "",
    );
    return NextResponse.redirect(buildLoginErrorUrl(url.origin, "auth_callback_failed", safeNext));
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
      return NextResponse.redirect(buildLoginErrorUrl(url.origin, "auth_callback_failed", safeNext));
    }

    if (data?.user) {
      try {
        await ensureUserProfile(data.user);
      } catch (profileError) {
        console.error("[auth/callback] ensureUserProfile failed:", profileError);
      }
    }

    return NextResponse.redirect(new URL(safeNext, url.origin));
  }

  if (tokenHash) {
    if (!isAllowedEmailOtpType(rawType)) {
      console.error("[auth/callback] unsupported token_hash type:", rawType);
      return NextResponse.redirect(buildLoginErrorUrl(url.origin, "otp_expired", safeNext));
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType,
    });

    if (error) {
      console.error("[auth/callback] verifyOtp failed:", error.message);
      return NextResponse.redirect(buildLoginErrorUrl(url.origin, "otp_expired", safeNext));
    }

    if (data?.user) {
      try {
        await ensureUserProfile(data.user);
      } catch (profileError) {
        console.error("[auth/callback] ensureUserProfile failed:", profileError);
      }
    }

    return NextResponse.redirect(new URL(safeNext, url.origin));
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
