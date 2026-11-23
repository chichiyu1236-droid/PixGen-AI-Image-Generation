import { ArrowLeft, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
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
          <p className="font-display text-xs tracking-[0.24em] text-[#566c58] uppercase">LIGHT-TONED STUDIO</p>
          <h2 className="font-display text-4xl font-normal leading-[1.15] text-[#171916] xl:text-5xl">
            让每一件商品，
            <br />
            拥有画廊级自然光影。
          </h2>
          <p className="text-sm leading-7 text-[#484e45]">
            新用户首次登录自动获赠 5 张一次性试用积分。通过可视化比例、风格色票与多图参考快速生成商业视觉，会员更可解锁 Agent 多轮对话改图。
          </p>

          {/* Paired Framed Specimen Cards */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="overflow-hidden rounded-2xl border border-white/80 bg-[#fbf9f3] p-2 shadow-[0_20px_50px_rgba(23,25,22,0.1)]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <Image
                  src="/images/showcase-perfume.webp"
                  alt="香氛瓶商业视觉样张"
                  fill
                  sizes="22vw"
                  className="object-cover"
                />
              </div>
              <p className="mt-2 px-1 text-[11px] font-medium text-[#484e45]">香氛静物 · 洞石窗光</p>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/80 bg-[#fbf9f3] p-2 shadow-[0_20px_50px_rgba(23,25,22,0.1)]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <Image
                  src="/images/showcase-candle.webp"
                  alt="手工香薰商业视觉样张"
                  fill
                  sizes="22vw"
                  className="object-cover"
                />
              </div>
              <p className="mt-2 px-1 text-[11px] font-medium text-[#484e45]">生活场景 · 柔和日光</p>
            </div>
          </div>
        </div>

        <ul className="relative z-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#484e45]">
          {["5 张免费试用积分", "经典模式 + 多图参考", "历史图库永久留存"].map((item) => (
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
          <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">WELCOME BACK</p>
          <h1 className="mt-2.5 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-4xl">
            登录后开始生成
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#484e45]">
            使用 Google 快捷登录或邮箱密码进入工作台。新用户自动获得 5 张体验积分（一次性，不刷新）。
          </p>

          <div className="mt-7">
            <LoginForm />
          </div>
        </div>

        <p className="text-center text-xs text-[#92978b]">PixGen · 浅色调油画美学 AI 视觉工作室</p>
      </section>
    </main>
  );
}
