"use client";

import {
  ArrowRight,
  Check,
  ChevronRight,
  ImagePlus,
  Layers3,
  MessageSquareText,
  Pause,
  Play,
  Send,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/app-shell";
import { GoogleLoginButton } from "@/components/auth-button";
import { formatFenAsCny } from "@/lib/billing/money";
import { membershipPlans, YEARLY_DISCOUNT_PERCENT } from "@/lib/billing/plans";

type ShowcaseCard = {
  src: string;
  alt: string;
  tag: string;
  style: string;
  objectPosition?: string;
};

const MARQUEE_ROWS: readonly (readonly ShowcaseCard[])[] = [
  [
    { src: "/images/showcase-perfume.webp", alt: "水晶玻璃香氛瓶商业静物图", tag: "香氛静物", style: "奢华商业 · 16:9" },
    { src: "/images/showcase-duo.webp", alt: "轻透玻璃护肤套装产品主图", tag: "护肤主图", style: "极简高级 · 影棚日光" },
    { src: "/images/showcase-candle.webp", alt: "手工磨砂香薰蜡烛亚麻静物", tag: "香薰生活", style: "真实摄影 · 生活场景" },
    { src: "/images/showcase-serum.webp", alt: "护肤精华滴管瓶洞石静物", tag: "电商主图", style: "极简高级 · 顶部留白", objectPosition: "50% 56%" },
    { src: "/images/showcase-oak-vase.webp", alt: "暖木台面陶瓷花器与尤加利", tag: "器物美学", style: "柔和日光 · 生活场景" },
    { src: "/images/showcase-slate-vase.webp", alt: "暗调石板雕塑性陶瓷器皿", tag: "品牌海报", style: "明暗影调 · 奢华商业" },
  ],
  [
    { src: "/images/showcase-cream.webp", alt: "植萃面霜乳液贝壳托盘静物", tag: "植萃美妆", style: "极简高级 · 自然留白", objectPosition: "50% 52%" },
    { src: "/images/showcase-window-vase.webp", alt: "清晨窗光釉面陶瓷花瓶", tag: "小红书封面", style: "真实摄影 · 清透光影" },
    { src: "/images/showcase-candle.webp", alt: "亚麻布手工香薰蜡烛氛围图", tag: "居家香氛", style: "自然日光 · 暖调构图" },
    { src: "/images/showcase-minimal-vase.webp", alt: "极简螺旋哑光陶瓶影棚图", tag: "极简主图", style: "影棚纯底 · 自然平衡" },
    { src: "/images/showcase-perfume.webp", alt: "洞石光影高定香水商业视觉", tag: "高定香氛", style: "折射焦散 · 16:9" },
    { src: "/images/showcase-rim-vase.webp", alt: "侧光质感陶瓷器皿品牌视觉", tag: "质感大片", style: "侧逆轮廓 · 影棚" },
  ],
  [
    { src: "/images/showcase-ivory-vase.webp", alt: "纯白画廊手工陶艺花器", tag: "画廊白底", style: "电商主图 · 干净留白" },
    { src: "/images/showcase-perfume.webp", alt: "琥珀玻璃香水瓶广告视觉", tag: "新品海报", style: "奢华商业 · 暖光" },
    { src: "/images/showcase-duo.webp", alt: "极简护肤瓶组合洞石场景", tag: "品牌视觉", style: "宽幅 Banner · 16:9" },
    { src: "/images/showcase-serum.webp", alt: "高定玻璃精华液艺术静物", tag: "小红书封面", style: "自然日光 · 4:5", objectPosition: "50% 58%" },
    { src: "/images/showcase-candle.webp", alt: "手工香薰与鼠尾草生活方式图", tag: "社交图文", style: "生活场景 · 真实摄影" },
    { src: "/images/showcase-oak-vase.webp", alt: "柔和日光器物静物摄影", tag: "软装美学", style: "明亮清透 · 自然平衡" },
  ],
];

const ROW_DURATIONS = ["58s", "68s", "54s"] as const;

const dataPoints = [
  { value: "7", unit: "个", label: "创作选项", detail: "用途、比例、质感、场景、留白、主体和补充说明" },
  { value: "1", unit: "积分", label: "每张图的消耗", detail: "只有图片成功生成后才会扣除，失败不扣费" },
  { value: "5", unit: "个", label: "新用户积分", detail: "第一次登录即可体验经典生成模式" },
  { value: "3", unit: "个", label: "常用动作", detail: "下载原图、反馈记录、用作参考图继续迭代" },
] as const;

const pricingTiers = [
  { quota: 100, label: "标准", title: "标准会员", blurb: "适合日常电商主图与社媒内容创作", popular: false },
  { quota: 300, label: "Pro", title: "Pro 会员", blurb: "适合品牌视觉团队与高频多轮迭代", popular: true },
] as const;

export function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [marqueePaused, setMarqueePaused] = useState(false);
  const [featureView, setFeatureView] = useState<"reference" | "prompt">("reference");
  const [agentStep, setAgentStep] = useState<"v1" | "v2">("v1");

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.14 },
    );

    elements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) {
        element.classList.add("is-visible");
        return;
      }
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f6f3ea] text-[#171916]">
      {/* Translucent warm parchment top navigation */}
      <header className="fixed inset-x-0 top-0 z-40 px-4 pt-3.5 sm:px-6">
        <nav
          aria-label="主导航"
          className="oil-glass-bar mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full px-4 py-2.5 sm:px-6"
        >
          <BrandMark href="/" compact />

          <div className="hidden items-center gap-7 text-sm text-[#484e45] md:flex">
            <a className="transition hover:text-[#171916]" href="#features">
              功能
            </a>
            <a className="transition hover:text-[#171916]" href="#agent">
              智能体
            </a>
            <a className="transition hover:text-[#171916]" href="#records">
              记录
            </a>
            <Link className="transition hover:text-[#171916]" href="/history">
              历史
            </Link>
            <a className="transition hover:text-[#171916]" href="#pricing">
              价格
            </a>
          </div>

          <div className="flex items-center gap-2.5">
            {isAuthenticated ? (
              <>
                <Link
                  className="hidden rounded-full border border-[#171916]/12 bg-[#fbf9f3]/80 px-3.5 py-2 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916] sm:inline-flex"
                  href="/history"
                >
                  作品图库
                </Link>
                <Link
                  className="inline-flex items-center gap-1 rounded-full bg-[#171916] px-4 py-2 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                  href="/generate"
                >
                  进入工作台
                  <ChevronRight size={15} aria-hidden />
                </Link>
              </>
            ) : (
              <GoogleLoginButton className="inline-flex items-center gap-2 rounded-full bg-[#171916] px-4 py-2 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]" />
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* 1. HERO STAGE — Light-Toned Oil Painting Backdrop + Tilted Commercial Marquee + Painterly Foreground */}
        <section
          aria-labelledby="pix-hero-title"
          className="relative isolate flex flex-col justify-between overflow-hidden pt-[5.25rem] sm:pt-24"
        >
          {/* Layer 1: High-key Impressionist oil painting backdrop */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
            <Image
              src="/images/oil-hero-bg.webp"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-95"
            />
          </div>

          {/* Luminous warm ivory scrim ensuring crisp AAA contrast for editorial typography */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(180deg, rgba(250,248,241,0.82) 0%, rgba(248,245,237,0.68) 26%, rgba(246,243,234,0.2) 52%, rgba(246,243,234,0.06) 80%, rgba(246,243,234,0.86) 100%)",
            }}
          />

          {/* Centered Editorial Hero Copy */}
          <div className="relative z-20 mx-auto max-w-5xl px-6 text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#171916]/10 bg-[#fbf9f3]/80 px-4 py-1 text-xs font-medium tracking-[0.14em] text-[#484e45] backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-[#566c58]" aria-hidden />
              PixGen Studio · 浅色调商业视觉工作室
            </p>
            <h1
              id="pix-hero-title"
              className="mt-4 font-display text-[clamp(2.25rem,4.5vw,4.25rem)] font-normal leading-[1.1] tracking-[0.02em] text-[#171916]"
            >
              从一句模糊，
              <br className="sm:hidden" />
              到一张成品。
            </h1>
            <p className="mx-auto mt-3.5 max-w-2xl text-pretty text-sm leading-7 text-[#484e45] sm:text-base sm:leading-7">
              不必反复推敲提示词：选好用途、比例与风格，或直接与智能体多轮对话，让商品主图、封面与品牌海报自带画廊级自然光影。
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {isAuthenticated ? (
                <Link
                  className="inline-flex items-center gap-2 rounded-full bg-[#171916] px-7 py-2.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.18)] transition hover:bg-[#2a2e28]"
                  href="/generate"
                >
                  进入创作工作台
                  <ArrowRight size={16} aria-hidden />
                </Link>
              ) : (
                <GoogleLoginButton className="inline-flex items-center gap-2 rounded-full bg-[#171916] px-7 py-2.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.18)] transition hover:bg-[#2a2e28]" />
              )}
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-[#171916]/15 bg-[#fbf9f3]/90 px-6 py-2.5 text-sm font-medium text-[#171916] backdrop-blur-md transition hover:border-[#171916]/30 hover:bg-[#fbf9f3]"
                href="/history"
              >
                浏览作品图库
              </Link>
            </div>
          </div>

          {/* Layer 2: Full-bleed 3-Row Tilted Continuous Commercial Visual Marquee */}
          <div className="relative mt-4 sm:mt-5">
            <div
              className="pix-marquee-stage"
              data-paused={marqueePaused ? "true" : "false"}
              aria-label="PixGen 商业商品视觉作品陈列"
            >
              {/* Soft upper mist transition so tilted cards emerge organically from the oil sky */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 sm:h-24"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(248,245,237,0.92) 0%, rgba(248,245,237,0.45) 48%, rgba(248,245,237,0) 100%)",
                }}
              />

              {/* Subtle left/right gallery edge mist */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 sm:w-20"
                style={{
                  background: "linear-gradient(90deg, rgba(246,243,234,0.88) 0%, rgba(246,243,234,0) 100%)",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 sm:w-20"
                style={{
                  background: "linear-gradient(270deg, rgba(246,243,234,0.88) 0%, rgba(246,243,234,0) 100%)",
                }}
              />

              <div className="pix-marquee-tilt">
                {MARQUEE_ROWS.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className={`pix-marquee-track ${rowIndex % 2 === 1 ? "pix-marquee-track-reverse" : ""}`}
                    style={{ ["--marquee-duration" as string]: ROW_DURATIONS[rowIndex] }}
                  >
                    {[0, 1].map((copyIndex) =>
                      row.map((card, cardIndex) => (
                        <figure
                          key={`${rowIndex}-${copyIndex}-${cardIndex}`}
                          aria-hidden={copyIndex === 1 ? true : undefined}
                          className="pix-marquee-card group"
                        >
                          <Image
                            src={card.src}
                            alt={copyIndex === 0 ? card.alt : ""}
                            fill
                            sizes="(max-width: 768px) 190px, 268px"
                            loading="eager"
                            className="object-cover transition duration-700 group-hover:scale-[1.04]"
                            style={card.objectPosition ? { objectPosition: card.objectPosition } : undefined}
                          />
                          <figcaption className="pointer-events-none absolute inset-x-2.5 bottom-2.5 hidden items-center justify-between gap-2 rounded-full border border-white/60 bg-[#fbf9f3]/86 px-3 py-1 text-[11px] text-[#171916] opacity-0 backdrop-blur-md transition duration-300 sm:flex sm:group-hover:opacity-100">
                            <span className="font-medium">{card.tag}</span>
                            <span className="text-[#6d7368]">{card.style}</span>
                          </figcaption>
                        </figure>
                      )),
                    )}
                  </div>
                ))}
              </div>

              {/* Layer 3: Light-Toned Oil Painting Foreground Depth Strip */}
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 select-none">
                <Image
                  src="/images/oil-hero-fg.webp"
                  alt=""
                  width={1600}
                  height={420}
                  priority
                  className="block h-28 w-full object-cover object-bottom sm:h-40 lg:h-48"
                />
              </div>

              {/* Motion Pause / Play Toggle */}
              <button
                type="button"
                data-marquee-toggle
                onClick={() => setMarqueePaused((paused) => !paused)}
                aria-pressed={marqueePaused}
                aria-label={marqueePaused ? "恢复画廊动效" : "暂停画廊动效"}
                title={marqueePaused ? "恢复画廊动效" : "暂停画廊动效"}
                className="oil-glass-bar absolute bottom-4 right-4 z-30 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-[#171916] transition hover:bg-[#fbf9f3] sm:bottom-5 sm:right-5"
              >
                {marqueePaused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
                <span>{marqueePaused ? "继续移动" : "暂停动效"}</span>
              </button>
            </div>
          </div>
        </section>

        {/* 2. FEATURES — Editorial Monograph Asymmetric Plates (#features) */}
        <section id="features" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <div data-reveal className="reveal grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
              <div>
                <p className="font-display text-sm tracking-[0.22em] text-[#566c58] uppercase">Editorial Studio</p>
                <h2 className="mt-3 text-balance font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.65rem]">
                  把提示词的功夫，交给画廊级选项。
                </h2>
              </div>
              <p className="text-pretty text-base leading-7 text-[#484e45] lg:pb-1">
                告别冰冷下拉框和碰运气抽卡。经典工作台将比例、用途、质感、场景与参考图做成可视化面板，自动整理为结构化画面描述。
              </p>
            </div>

            {/* Asymmetric Monograph Pair */}
            <div className="mt-12 grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
              {/* Card 01: Visual Controls & Ratio Wireframes */}
              <article
                data-reveal
                className="reveal relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3] p-6 shadow-[0_24px_64px_rgba(23,25,22,0.06)] sm:p-8"
              >
                <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 opacity-65">
                  <Image
                    src="/images/oil-section-wash.webp"
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#fbf9f3]/72 via-[#fbf9f3]/86 to-[#fbf9f3]/96" />
                </div>

                <div className="relative z-10">
                  <div className="rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/92 p-4 shadow-[0_14px_34px_rgba(23,25,22,0.06)] backdrop-blur">
                    <div className="flex items-center justify-between text-xs text-[#6d7368]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#171916]">
                        <SlidersHorizontal size={13} aria-hidden /> 画面参数预览
                      </span>
                      <span>可视化点选</span>
                    </div>
                    <div className="mt-3.5 grid grid-cols-3 gap-2">
                      {[
                        { ratio: "1:1", label: "方图主图", w: "w-6", h: "h-6", active: false },
                        { ratio: "4:5", label: "竖图封面", w: "w-5", h: "h-6", active: true },
                        { ratio: "16:9", label: "宽幅海报", w: "w-8", h: "h-5", active: false },
                      ].map((item) => (
                        <div
                          key={item.ratio}
                          className={[
                            "flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-center",
                            item.active
                              ? "border-[#171916] bg-[#171916] text-[#faf7ef]"
                              : "border-[#171916]/10 bg-[#f4f0e5]/75 text-[#484e45]",
                          ].join(" ")}
                        >
                          <span
                            aria-hidden
                            className={`mb-2 block rounded-[4px] border-[1.5px] ${item.w} ${item.h} ${
                              item.active ? "border-[#faf7ef]/80" : "border-[#6d7368]/60"
                            }`}
                          />
                          <span className="text-xs font-semibold tabular-nums">{item.ratio}</span>
                          <span className={`mt-0.5 text-[10px] ${item.active ? "text-[#faf7ef]/70" : "text-[#6d7368]"}`}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {[
                        { label: "极简高级", dot: "#d7d2c4", active: true },
                        { label: "真实摄影", dot: "#a9b79f", active: false },
                        { label: "奢华商业", dot: "#c4a36d", active: false },
                        { label: "影棚日光", dot: "#e7e1d1", active: true },
                        { label: "顶部留白", dot: "#c5d2d8", active: false },
                      ].map((chip) => (
                        <span
                          key={chip.label}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                            chip.active
                              ? "border-[#566c58]/35 bg-[#e7eee5] font-medium text-[#2c3c2e]"
                              : "border-[#171916]/10 bg-[#fbf9f3] text-[#484e45]"
                          }`}
                        >
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-full border border-black/10"
                            style={{ backgroundColor: chip.dot }}
                          />
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-8">
                  <p className="flex items-center gap-2 font-display text-xs tracking-[0.2em] text-[#6d7368]">
                    <span>01</span>
                    <span>·</span>
                    <span>CLASSIC STUDIO</span>
                  </p>
                  <h3 className="mt-2.5 font-display text-2xl font-normal text-[#171916] sm:text-3xl">
                    先定方向，不靠运气
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#484e45]">
                    用比例线框卡与色调芯片直观组合画面语言，只需写下商品主体，系统自动补齐构图、光线与留白空间。
                  </p>
                </div>
              </article>

              {/* Card 02: Multi-Reference & Studio Output */}
              <article
                data-reveal
                className="reveal relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3] p-6 shadow-[0_24px_64px_rgba(23,25,22,0.06)] sm:p-8"
                style={{ transitionDelay: "90ms" }}
              >
                <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 opacity-75">
                  <Image
                    src="/images/oil-section-wash.webp"
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 55vw"
                    className="scale-x-[-1] object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#fbf9f3]/68 via-[#fbf9f3]/82 to-[#fbf9f3]/96" />
                </div>

                <div className="relative z-10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-full border border-[#171916]/10 bg-[#f4f0e5]/90 p-1">
                      <button
                        type="button"
                        onClick={() => setFeatureView("reference")}
                        aria-pressed={featureView === "reference"}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                          featureView === "reference" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                        }`}
                      >
                        多图参考生成
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeatureView("prompt")}
                        aria-pressed={featureView === "prompt"}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                          featureView === "prompt" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                        }`}
                      >
                        自然语言成片
                      </button>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#6d7368]">
                      <Layers3 size={13} aria-hidden /> 最多携带 3 张参考图
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[0.42fr_0.58fr]">
                    <div className="flex flex-col justify-between rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/92 p-3.5 backdrop-blur">
                      <div>
                        <p className="text-[11px] font-medium tracking-[0.14em] text-[#6d7368] uppercase">
                          {featureView === "reference" ? "输入参考与主体" : "结构化画面说明"}
                        </p>
                        {featureView === "reference" ? (
                          <div className="mt-2.5 flex items-center gap-2">
                            <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-[#171916]/10">
                              <Image src="/images/hero-art-1.png" alt="参考图示例 1" fill sizes="56px" className="object-cover" />
                            </div>
                            <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-[#171916]/10">
                              <Image src="/images/showcase-candle.webp" alt="参考图示例 2" fill sizes="56px" className="object-cover" />
                            </div>
                            <span className="grid h-14 w-14 place-items-center rounded-xl border border-dashed border-[#171916]/18 text-[#6d7368]">
                              <ImagePlus size={15} aria-hidden />
                            </span>
                          </div>
                        ) : null}
                        <p className="mt-3 text-xs leading-6 text-[#484e45]">
                          {featureView === "reference"
                            ? "保留玻璃瓶身造型与黄铜质感，置于清晨窗光的洞石台上，投下柔和橄榄枝光影。"
                            : "极简商业静物摄影：手工磨砂玻璃香薰蜡烛置入原色亚麻台面，柔和日光与鼠尾草投影。"}
                        </p>
                      </div>
                      <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-[#e7eee5] px-2.5 py-1 text-[11px] font-medium text-[#384a3a]">
                        <Sparkles size={11} aria-hidden /> 1 次生成 · −1 积分
                      </span>
                    </div>

                    <div className="relative aspect-[16/11] overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#eee9dc]">
                      <Image
                        src={featureView === "reference" ? "/images/showcase-perfume.webp" : "/images/showcase-candle.webp"}
                        alt={featureView === "reference" ? "多图参考商业成品示例" : "自然语言商业成品示例"}
                        fill
                        sizes="(max-width: 1024px) 100vw, 34vw"
                        className="object-cover transition duration-500"
                      />
                      <span className="absolute bottom-2.5 left-2.5 rounded-full border border-white/60 bg-[#fbf9f3]/90 px-3 py-1 text-[11px] font-medium text-[#171916] backdrop-blur">
                        {featureView === "reference" ? "参考主体特征一致 · 高清原图" : "自然日光影调 · 可直接商用"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-8">
                  <p className="flex items-center gap-2 font-display text-xs tracking-[0.2em] text-[#6d7368]">
                    <span>02</span>
                    <span>·</span>
                    <span>REFERENCE &amp; OUTPUT</span>
                  </p>
                  <h3 className="mt-2.5 font-display text-2xl font-normal text-[#171916] sm:text-3xl">
                    照着参考图做，细节稳定延续
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#484e45]">
                    支持上传本地产品图或直接从历史作品一键带入参考槽位，在保持商品外观辨识度的前提下拓展全新广告场景。
                  </p>
                </div>
              </article>
            </div>

            {/* Card 03: Archive & Reuse Strip */}
            <article
              data-reveal
              className="reveal mt-6 grid gap-6 rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-6 shadow-[0_18px_46px_rgba(23,25,22,0.045)] sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center"
            >
              <div>
                <p className="flex items-center gap-2 font-display text-xs tracking-[0.2em] text-[#6d7368]">
                  <span>03</span>
                  <span>·</span>
                  <span>ARCHIVE REUSE</span>
                </p>
                <h3 className="mt-2.5 font-display text-2xl font-normal text-[#171916] sm:text-3xl">
                  满意的图，不该只有一次
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-7 text-[#484e45]">
                  每一次成功生成都会在图库保留高清原图、完整画面描述与满意反馈。随时一键复制提示词、下载原图，或作为参考图继续创作下一版。
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {["高清原图下载", "一键复制提示词", "用作参考图", "满意度标注"].map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-[#171916]/10 bg-[#f4f0e5] px-3.5 py-1.5 text-xs font-medium text-[#484e45]"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { src: "/images/hero-art-2.png", label: "护肤主图" },
                  { src: "/images/flow-result-bright.png", label: "生活场景" },
                  { src: "/images/showcase-perfume.webp", label: "香氛海报" },
                ].map((thumb) => (
                  <div
                    key={thumb.label}
                    className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#eee9dc]"
                  >
                    <Image
                      src={thumb.src}
                      alt={thumb.label}
                      fill
                      sizes="180px"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="absolute bottom-2 left-2 rounded-full bg-[#fbf9f3]/88 px-2.5 py-0.5 text-[11px] font-medium text-[#171916] backdrop-blur">
                      {thumb.label}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        {/* 3. AGENT CONVERSATION WORKBENCH PREVIEW (#agent) */}
        <section id="agent" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div
            data-reveal
            className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-[2.25rem] border border-[#171916]/10 bg-[#fbf9f3] shadow-[0_26px_74px_rgba(23,25,22,0.07)]"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
              <Image
                src="/images/oil-section-wash.webp"
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#fbf9f3]/94 via-[#fbf9f3]/86 to-[#fbf9f3]/72" />
            </div>

            <div className="relative z-10 grid gap-10 p-6 sm:p-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:p-12">
              <div>
                <p className="flex items-center gap-2.5 font-display text-sm tracking-[0.2em] text-[#566c58] uppercase">
                  <MessageSquareText size={16} aria-hidden />
                  智能体对话
                  <span className="rounded-full bg-[#384a3a] px-2.5 py-0.5 font-sans text-[10px] font-semibold tracking-wider text-[#faf7ef]">
                    MEMBER
                  </span>
                </p>
                <h2 className="mt-4 text-balance font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.65rem]">
                  说不清楚，就聊清楚。
                </h2>
                <p className="mt-5 text-pretty text-base leading-7 text-[#484e45]">
                  哪怕只有一句模糊的感觉也没关系。Agent 会先通过几个轻巧问题澄清方向，再执行出图；生成后选中画布任意版本，用自然语言继续修改或批量衍生配色变体。
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["模糊需求先澄清", "选中画布版本续改", "每步积分消耗透明", "历史会话随时回溯"].map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-[#171916]/10 bg-[#f4f0e5]/90 px-3.5 py-1.5 text-xs font-medium text-[#484e45]"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                {/* Interactive version toggle */}
                <div className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#f4f0e5] p-1">
                  <button
                    type="button"
                    onClick={() => setAgentStep("v1")}
                    aria-pressed={agentStep === "v1"}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      agentStep === "v1" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                    }`}
                  >
                    第 1 轮 · 对话成图 v1
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentStep("v2")}
                    aria-pressed={agentStep === "v2"}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      agentStep === "v2" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                    }`}
                  >
                    第 2 轮 · 局部迭代 v2
                  </button>
                </div>
              </div>

              <AgentChatPreview step={agentStep} />
            </div>
          </div>
        </section>

        {/* 4. RECORDS METRICS — Editorial Indented Fixed-Width Numeric Column (#records) */}
        <section id="records" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div data-reveal className="reveal mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div>
              <p className="font-display text-sm tracking-[0.22em] text-[#566c58] uppercase">Studio Archive</p>
              <h2 className="mt-3 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-5xl">
                每一张图，都能继续使用。
              </h2>
              <p className="mt-5 max-w-md text-pretty text-base leading-7 text-[#484e45]">
                图片、生成时间与完整画面说明都会沉淀在你的图库档案中。透明计费、无隐形扣除，每次迭代都有据可查。
              </p>
              <Link
                className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-[#171916] underline-offset-4 transition hover:text-[#384a3a] hover:underline"
                href="/history"
              >
                打开历史记录
                <ArrowRight size={15} aria-hidden />
              </Link>
            </div>

            <dl className="border-b border-[#171916]/10">
              {dataPoints.map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[6rem_1fr] items-baseline gap-x-6 border-t border-[#171916]/10 py-6 pl-5 sm:pl-10 lg:pl-24"
                >
                  <dt className="flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
                    <span className="font-display text-[2.85rem] leading-none text-[#171916]">{item.value}</span>
                    <span className="text-sm font-medium text-[#6d7368]">{item.unit}</span>
                  </dt>
                  <dd className="text-sm leading-6 text-[#6d7368]">
                    <span className="block text-base font-semibold text-[#171916]">{item.label}</span>
                    {item.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* 5. PRICING — Static Gallery Cards from lib/billing/plans.ts (#pricing) */}
        <section id="pricing" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div data-reveal className="reveal mx-auto max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="font-display text-sm tracking-[0.22em] text-[#566c58] uppercase">Membership</p>
                <h2 className="mt-3 max-w-3xl font-display text-3xl font-normal leading-tight text-[#171916] sm:text-5xl">
                  一张图一分，先免费用起。
                </h2>
                <p className="mt-4 max-w-lg text-pretty text-base leading-7 text-[#484e45]">
                  免费体验含 5 张一次性试用积分；会员卡按期发放额度，完整开放 Agent 对话工作台与历史会话回溯。
                </p>
              </div>
              <Link
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#171916] underline-offset-4 transition hover:text-[#384a3a] hover:underline"
                href="/upgrade"
              >
                查看完整定价
                <ArrowRight size={15} aria-hidden />
              </Link>
            </div>

            <PricingCards isAuthenticated={isAuthenticated} />
          </div>
        </section>

        {/* 6. CLOSING CTA — Light Oil Wash Monograph Band */}
        <section className="relative z-10 px-6 pb-20 pt-10 lg:px-10 lg:pb-24">
          <div
            data-reveal
            className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-[2.25rem] border border-[#171916]/10 bg-[#fbf9f3] px-7 py-14 shadow-[0_24px_64px_rgba(23,25,22,0.06)] sm:px-12 sm:py-16"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <Image
                src="/images/oil-section-wash.webp"
                alt=""
                fill
                sizes="100vw"
                className="object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#fbf9f3]/86 via-[#fbf9f3]/70 to-[#fbf9f3]/55" />
            </div>

            <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="font-display text-sm tracking-[0.22em] text-[#566c58] uppercase">Begin Creating</p>
                <h2 className="mt-3 max-w-3xl font-display text-3xl font-normal leading-tight text-[#171916] sm:text-5xl">
                  第一张图，从一句话开始。
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-[#484e45]">
                  登录后即刻获得 5 张体验积分，进入浅色调油画视觉工作台开启商业图创作。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {isAuthenticated ? (
                  <Link
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#171916] px-7 py-3.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                    href="/generate"
                  >
                    继续生成
                    <ArrowRight size={16} aria-hidden />
                  </Link>
                ) : (
                  <GoogleLoginButton className="inline-flex items-center justify-center gap-2 rounded-full bg-[#171916] px-7 py-3.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]" />
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#171916]/10 bg-[#f2eee2]/80 px-6 py-10 text-xs text-[#6d7368] lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-display text-base tracking-[0.08em] text-[#171916]">PixGen</span>
            <span aria-hidden>·</span>
            <span>浅色调油画美学 AI 视觉工作室</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Link className="transition hover:text-[#171916]" href="/generate">
              创作工作台
            </Link>
            <Link className="transition hover:text-[#171916]" href="/history">
              作品图库
            </Link>
            <Link className="transition hover:text-[#171916]" href="/upgrade">
              会员方案
            </Link>
            <Link className="transition hover:text-[#171916]" href="/login">
              登录
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AgentChatPreview({ step }: { step: "v1" | "v2" }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -right-2.5 -top-3 h-full w-full rotate-[1.4deg] rounded-[1.75rem] border border-[#171916]/10 bg-[#f4f0e5]/75"
      />

      <div className="relative overflow-hidden rounded-[1.75rem] border border-[#171916]/12 bg-[#fbf9f3] shadow-[0_26px_64px_rgba(23,25,22,0.09)]">
        <div className="flex items-center justify-between border-b border-[#171916]/8 bg-[#f4f0e5]/90 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#b48a52]/45" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#566c58]/45" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#596e7c]/45" />
            <p className="ml-2 text-xs font-medium text-[#484e45]">PixGen · 智能体对话工作台</p>
          </div>
          <span className="rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-2.5 py-0.5 font-mono text-[10px] text-[#6d7368]">
            {step === "v1" ? "图 1 · v1" : "图 2 · v2"}
          </span>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-[1.08fr_0.92fr] sm:items-stretch">
          {/* Dialogue column */}
          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-[1.15rem_1.15rem_4px_1.15rem] bg-[#171916] px-3.5 py-2.5 text-xs leading-6 text-[#faf7ef]">
                  {step === "v1"
                    ? "我想做一张高端香氛主图，光线干净高级一点"
                    : "选中 图 1 · v1，把氛围换成更柔和的晨光与亚麻质感"}
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-display text-[11px] tracking-[0.2em] text-[#6d7368]">AGENT</p>
                <div className="rounded-[4px_1.15rem_1.15rem_1.15rem] border border-[#171916]/8 bg-[#f4f0e5]/85 px-3.5 py-2.5 text-xs leading-6 text-[#171916]">
                  {step === "v1"
                    ? "已为您规划洞石台面与自然窗光折射方案，主体采用玻璃瓶身配黄铜球盖，保证高级商业质感。"
                    : "已基于 图 1 · v1 调整材质与光线：保留柔和晨光与植物投影，切换为温润亚麻静物陈设。"}
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px] text-[#484e45]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-2.5 py-1">
                    <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#384a3a] text-[8px] text-white">
                      ✓
                    </span>
                    {step === "v1" ? "规划画面方向" : "锁定编辑对象"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#566c58]/25 bg-[#e7eee5] px-2.5 py-1 text-[#2d3e2f]">
                    <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#384a3a] text-[8px] text-white">
                      ✓
                    </span>
                    {step === "v1" ? "生成图片 · −1 积分" : "编辑迭代 · −1 积分"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-[#171916]/10 bg-[#f4f0e5]/80 px-3.5 py-2">
              <span className="flex-1 truncate text-xs text-[#6d7368]">
                继续说一句“出两个不同配色变体”
                <span className="flow-caret ml-0.5 inline-block h-3 w-[1.5px] bg-[#171916]/60 align-middle" aria-hidden />
              </span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#171916] text-[#faf7ef]" aria-hidden>
                <Send size={12} />
              </span>
            </div>
          </div>

          {/* Canvas column */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#171916]/10 bg-[#f2eee2]/85 p-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#171916]/8 bg-[#eee9dc]">
              <Image
                src={step === "v1" ? "/images/showcase-perfume.webp" : "/images/showcase-candle.webp"}
                alt={step === "v1" ? "智能体生成版本 v1 示例" : "智能体迭代版本 v2 示例"}
                fill
                sizes="(max-width: 1024px) 100vw, 28vw"
                className="object-cover"
              />
              <span className="absolute left-2 top-2 rounded-full bg-[#171916]/72 px-2.5 py-0.5 font-mono text-[10px] text-[#faf7ef] backdrop-blur">
                {step === "v1" ? "图 1 · v1" : "图 2 · v2 · 基于 v1"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#6d7368]">
              <span>画布版本脉络完整保留</span>
              <span className="font-medium text-[#384a3a]">✓ 可继续改图</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating completion toast */}
      <div className="agent-toast absolute -bottom-5 left-5 hidden items-center gap-2.5 rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/95 px-4 py-2.5 shadow-[0_18px_40px_rgba(23,25,22,0.12)] backdrop-blur sm:flex">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#384a3a] text-[#faf7ef]">
          <Check size={13} strokeWidth={3} aria-hidden />
        </span>
        <div className="text-left">
          <p className="text-xs font-semibold text-[#171916]">画布已更新</p>
          <p className="text-[11px] text-[#6d7368]">随时选中任意版本继续对话迭代</p>
        </div>
      </div>
    </div>
  );
}

function planForTier(quota: number, periodDays: number) {
  return membershipPlans.find((plan) => plan.quotaPerTranche === quota && plan.periodDays === periodDays);
}

function PricingCards({ isAuthenticated }: { isAuthenticated: boolean }) {
  const freeCtaClass =
    "inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#171916]/15 bg-[#fbf9f3] px-5 py-3 text-sm font-medium text-[#171916] transition hover:border-[#171916]/35 hover:bg-[#f4f0e5]";
  const paidCtaClass =
    "inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171916] px-5 py-3 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]";

  return (
    <div className="mt-12 grid gap-6 lg:grid-cols-3">
      {/* Free Tier */}
      <div className="flex flex-col rounded-[1.85rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-7 shadow-[0_18px_48px_rgba(23,25,22,0.045)]">
        <p className="font-display text-xs tracking-[0.22em] text-[#6d7368]">FREE</p>
        <h3 className="mt-2 font-display text-2xl font-normal text-[#171916]">免费体验</h3>
        <p className="mt-4 font-display text-4xl font-normal tabular-nums text-[#171916]">¥0</p>
        <p className="mt-2 text-sm text-[#6d7368]">5 张试用积分 · 经典模式</p>
        <div className="mt-7">
          {isAuthenticated ? (
            <Link className={freeCtaClass} href="/generate">
              开始生成
            </Link>
          ) : (
            <GoogleLoginButton className={freeCtaClass} />
          )}
        </div>
        <ul className="mt-7 space-y-2.5 border-t border-[#171916]/8 pt-6 text-sm leading-6 text-[#484e45]">
          <li>✓ 5 张一次性试用积分，不刷新</li>
          <li>✓ 经典生成模式与多图参考</li>
          <li className="text-[#92978b]">✗ Agent 对话（会员专属）</li>
        </ul>
      </div>

      {/* Paid Tiers (display-only on landing page; purchase happens on /upgrade) */}
      {pricingTiers.map((tier) => {
        const monthly = planForTier(tier.quota, 30);
        const yearly = planForTier(tier.quota, 365);

        if (!monthly || !yearly) {
          return null;
        }

        return (
          <div
            key={tier.quota}
            className={[
              "relative flex flex-col rounded-[1.85rem] border p-7 transition",
              tier.popular
                ? "border-[#566c58]/55 bg-[#fbf9f3] shadow-[0_24px_64px_rgba(56,74,58,0.11)]"
                : "border-[#171916]/10 bg-[#fbf9f3]/92 shadow-[0_18px_48px_rgba(23,25,22,0.045)]",
            ].join(" ")}
          >
            {tier.popular ? (
              <span className="absolute -top-3 left-7 rounded-full bg-[#384a3a] px-3.5 py-1 text-[11px] font-medium tracking-wide text-[#faf7ef]">
                推荐方案
              </span>
            ) : null}
            <p className="font-display text-xs tracking-[0.22em] text-[#6d7368]">{tier.label.toUpperCase()}</p>
            <h3 className="mt-2 font-display text-2xl font-normal text-[#171916]">{tier.title}</h3>
            <p className="mt-4 font-display text-4xl font-normal tabular-nums text-[#171916]">
              {formatFenAsCny(monthly.amountFen)}
              <span className="ml-1 font-sans text-sm font-normal text-[#6d7368]">/月</span>
            </p>
            <p className="mt-2 text-sm tabular-nums text-[#566c58]">
              年付 {formatFenAsCny(yearly.amountFen)}/年，省 {YEARLY_DISCOUNT_PERCENT}%
            </p>
            <p className="mt-1 text-xs text-[#6d7368]">{tier.blurb}</p>
            <div className="mt-7">
              {isAuthenticated ? (
                <Link className={paidCtaClass} href="/upgrade">
                  前往升级定价页
                  <ArrowRight size={15} aria-hidden />
                </Link>
              ) : (
                <GoogleLoginButton next="/upgrade" className={paidCtaClass} />
              )}
            </div>
            <ul className="mt-7 space-y-2.5 border-t border-[#171916]/8 pt-6 text-sm leading-6 text-[#484e45]">
              <li>✓ 每期 {monthly.quotaPerTranche} 张生成额度</li>
              <li>✓ Agent 对话工作台（会员专属）</li>
              <li>✓ 订阅积分优先消耗，永久积分兜底</li>
            </ul>
          </div>
        );
      })}
    </div>
  );
}
