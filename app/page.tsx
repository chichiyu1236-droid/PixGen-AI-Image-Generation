import Link from "next/link";
import { GoogleLoginButton } from "@/components/auth-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1fr_460px] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay">Structured GPT Image generation</p>
          <h1 className="max-w-3xl text-5xl font-bold leading-tight text-ink">勾选需求，生成更专业的商业图片</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/70">
            选择图片类型、比例、风格、场景和留白，再填写主体。系统会自动组装专业提示词并生成高质量图片。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Link className="rounded-md bg-ink px-5 py-3 font-semibold text-white" href="/generate">
                开始生成
              </Link>
            ) : (
              <GoogleLoginButton />
            )}
            <Link className="rounded-md border border-ink/20 px-5 py-3 font-semibold" href="/history">
              查看历史
            </Link>
          </div>
        </div>
        <div className="grid aspect-[4/5] content-end rounded-lg bg-[linear-gradient(145deg,#496a81,#b76e4c)] p-6 text-white shadow-2xl">
          <div>
            <p className="text-sm uppercase tracking-wide opacity-80">Example output</p>
            <h2 className="mt-2 text-3xl font-bold">Premium product visual</h2>
            <p className="mt-3 text-sm leading-6 opacity-85">
              A realistic preview area for generated examples after the first production images exist.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
