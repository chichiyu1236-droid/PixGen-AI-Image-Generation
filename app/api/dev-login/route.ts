import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "test@demo.com",
    password: "Test123456",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cookieStore = await cookies();
  const projectRef = new URL(url).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  // Match @supabase/ssr >=0.5 cookie encoding: base64url with "base64-" prefix.
  cookieStore.set(cookieName, `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.redirect(new URL("/generate", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
}
