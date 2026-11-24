import { ArrowLeft, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";
import { getSafeNextPath } from "@/lib/auth/redirect";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const safeNext = getSafeNextPath(getSearchValue(resolvedSearchParams, "next"));
  const errorCode = getSearchValue(resolvedSearchParams, "error");
  const resetSuccess = getSearchValue(resolvedSearchParams, "reset") === "success";

  return (
    <main className="grid min-h-screen bg-[#f6f3ea] text-[#171916] lg:grid-cols-[1.08fr_0.92fr]">
      {/* Left Column: Light-Toned Oil Painting Editorial Showcase Plate */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-[#171916]/10 p-10 lg:flex xl:p-14">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <Image
            src="/images/oil-hero-bg.webp"
            alt=""
            fill
            priority
            sizes="55vw"
            className="object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(160deg, rgba(250,248,241,0.86) 0%, rgba(246,243,234,0.68) 52%, rgba(246,243,234,0.88) 100%)",
            }}
          />
        </div>

        <div className="relative z-10">
          <BrandMark href="/" />
        </div>

        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">PIXGEN</p>
          <h2 className="font-display text-4xl font-normal leading-[1.18] text-[#171916] xl:text-5xl">
            想法不用写很长，
            <br />
            先出第一张看看。
          </h2>
          <p className="text-sm leading-7 text-[#484e45]">
            新账号自带 5 张试用额度。选好比例和风格就能出图，会员还可以和 Agent 对话改图。
          </p>

          {/* Paired Framed Specimen Cards */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="overflow-hidden rounded-2xl border border-white/80 bg-[#fbf9f3] p-2 shadow-[0_20px_50px_rgba(23,25,22,0.1)]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <Image
                  src="/images/marquee-window.webp"
                  alt="地中海窗边与海景样张"
                  fill
                  sizes="22vw"
                  className="object-cover"
                />
              </div>
              <p className="mt-2 px-1 text-[11px] text-[#484e45]">胶片日光 · 窗景</p>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/80 bg-[#fbf9f3] p-2 shadow-[0_20px_50px_rgba(23,25,22,0.1)]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <Image
                  src="/images/marquee-bookshop.webp"
                  alt="街角书店插画样张"
                  fill
                  sizes="22vw"
                  className="object-cover"
                />
              </div>
              <p className="mt-2 px-1 text-[11px] text-[#484e45]">水粉插画 · 街角书店</p>
            </div>
          </div>
        </div>

        <ul className="relative z-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#484e45]">
          {["新用户 5 张试用", "支持最多 3 张参考图", "作品与提示词自动保存"].map((item) => (
            <li key={item} className="inline-flex items-center gap-1.5">
              <Check size={13} className="text-[#566c58]" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* Right Column: Warm Parchment Login Card */}
      <section className="flex flex-col justify-between px-5 py-8 sm:px-10 lg:px-12">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <BrandMark href="/" compact />
          </div>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-1.5 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916]"
          >
            <ArrowLeft size={13} aria-hidden />
            返回首页
          </Link>
        </div>

        <div className="mx-auto my-8 w-full max-w-md rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3]/94 p-7 shadow-[0_24px_64px_rgba(23,25,22,0.065)] backdrop-blur sm:p-9">
          <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">LOGIN</p>
          <h1 className="mt-2.5 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-4xl">
            登录后开始生成
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#484e45]">
            支持国内邮箱验证码免密直连或密码登录，新账号自动获赠 5 张试用积分（一次性，不刷新）。
          </p>

          <div className="mt-7">
            <LoginForm next={safeNext} initialError={errorCode} resetSuccess={resetSuccess} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[#6d7368]">
          <span className="text-[#92978b]">PixGen</span>
          <span aria-hidden className="text-[#171916]/15">
            ·
          </span>
          <Link className="underline-offset-4 transition hover:text-[#171916] hover:underline" href="/terms">
            服务条款
          </Link>
          <Link className="underline-offset-4 transition hover:text-[#171916] hover:underline" href="/privacy">
            隐私政策
          </Link>
        </div>
      </section>
    </main>
  );
}
