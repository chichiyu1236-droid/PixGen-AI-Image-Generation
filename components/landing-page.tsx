"use client";

import {
  ArrowRight,
  ChevronRight,
  ImagePlus,
  MessageSquareText,
  Pause,
  Play,
  Send,
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
};

const MARQUEE_ROWS: readonly (readonly ShowcaseCard[])[] = [
  [
    { src: "/images/marquee-window.webp", alt: "地中海蓝百叶窗与鲜橙枝海景", tag: "胶片风景", style: "自然日光" },
    { src: "/images/marquee-riso.webp", alt: "朱红与钴蓝双色孔版银杏植物版画", tag: "双色版画", style: "精致插画" },
    { src: "/images/marquee-pool.webp", alt: "夏日泳池晴朗波光与白砖边沿", tag: "晴日泳池", style: "真实摄影" },
    { src: "/images/marquee-bookshop.webp", alt: "巴黎街角浅绿色书店橱窗水粉插画", tag: "街角书店", style: "水粉插画" },
    { src: "/images/marquee-cobalt.webp", alt: "克莱因蓝玻璃拱门与石膏折光静物", tag: "光影装置", style: "极简高级" },
    { src: "/images/marquee-matcha.webp", alt: "粗陶碗现打抹茶与竹茶筅俯拍", tag: "东方茶事", style: "生活场景" },
  ],
  [
    { src: "/images/marquee-kyoto.webp", alt: "晨雾中的京都苔庭与木质茶室檐廊", tag: "京都庭院", style: "胶片建筑" },
    { src: "/images/marquee-3d-bloom.webp", alt: "悬浮透明玻璃球内的微缩樱花与露珠", tag: "微缩樱花", style: "柔和 3D" },
    { src: "/images/marquee-figs.webp", alt: "午后亚麻桌布上的无花果与蜜桃静物", tag: "夏日果桌", style: "自然静物" },
    { src: "/images/marquee-meadow.webp", alt: "海岸悬崖野花草地与白色灯塔油画", tag: "海岸灯塔", style: "油画笔触" },
    { src: "/images/showcase-perfume.webp", alt: "洞石光影下的玻璃香氛瓶", tag: "香氛静物", style: "影棚日光" },
    { src: "/images/marquee-riso.webp", alt: "纸面肌理植物孔版画", tag: "植物版画", style: "纸面印刷" },
  ],
  [
    { src: "/images/marquee-bookshop.webp", alt: "阳光洒入的街角书店与橘猫", tag: "绘本场景", style: "水粉插画" },
    { src: "/images/marquee-cobalt.webp", alt: "蓝调折光雕塑感静物", tag: "光学静物", style: "极简高级" },
    { src: "/images/marquee-window.webp", alt: "海岸蓝窗与鲜橙胶片画面", tag: "旅拍胶片", style: "户外日光" },
    { src: "/images/showcase-candle.webp", alt: "原色亚麻台面上的手工香薰蜡烛", tag: "居家香薰", style: "生活场景" },
    { src: "/images/marquee-pool.webp", alt: "夏日波光泳池一角", tag: "晴日色彩", style: "明亮广告感" },
    { src: "/images/marquee-kyoto.webp", alt: "晨间茶室与红枫一枝", tag: "建筑空间", style: "胶片光影" },
  ],
];

const ROW_DURATIONS = ["58s", "68s", "54s"] as const;

const dataPoints = [
  { value: "7", unit: "个", label: "创作选项", detail: "用途、比例、质感、场景、留白、主体和补充说明" },
  { value: "1", unit: "积分", label: "每张图的消耗", detail: "成功出图才扣分，失败不扣" },
  { value: "5", unit: "个", label: "新用户积分", detail: "第一次登录即可试用" },
  { value: "3", unit: "个", label: "常用动作", detail: "下载、反馈、设为参考图" },
] as const;

const pricingTiers = [
  { quota: 100, label: "标准", title: "标准会员", popular: false },
  { quota: 300, label: "Pro", title: "Pro 会员", popular: true },
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
      {/* Translucent top navigation */}
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
        {/* 1. HERO STAGE */}
        <section
          aria-labelledby="pix-hero-title"
          className="relative isolate flex flex-col justify-between overflow-hidden pt-[5.25rem] sm:pt-24"
        >
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

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(180deg, rgba(250,248,241,0.82) 0%, rgba(248,245,237,0.68) 26%, rgba(246,243,234,0.2) 52%, rgba(246,243,234,0.06) 80%, rgba(246,243,234,0.86) 100%)",
            }}
          />

          <div className="relative z-20 mx-auto max-w-5xl px-6 text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#171916]/10 bg-[#fbf9f3]/80 px-4 py-1 text-xs font-medium tracking-[0.12em] text-[#484e45] backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-[#566c58]" aria-hidden />
              PixGen · AI 生图工作台
            </p>
            <h1
              id="pix-hero-title"
              className="mt-4 font-display text-[clamp(2.25rem,4.5vw,4.25rem)] font-normal leading-[1.1] tracking-[0.02em] text-[#171916]"
            >
              从一句模糊，
              <br className="sm:hidden" />
              到一张成品。
            </h1>
            <p className="mx-auto mt-3.5 max-w-xl text-pretty text-sm leading-7 text-[#484e45] sm:text-base">
              选好比例和风格就能出图；拿不准方向，直接和智能体聊。
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {isAuthenticated ? (
                <Link
                  className="inline-flex items-center gap-2 rounded-full bg-[#171916] px-7 py-2.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.18)] transition hover:bg-[#2a2e28]"
                  href="/generate"
                >
                  开始生成
                  <ArrowRight size={16} aria-hidden />
                </Link>
              ) : (
                <GoogleLoginButton className="inline-flex items-center gap-2 rounded-full bg-[#171916] px-7 py-2.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.18)] transition hover:bg-[#2a2e28]" />
              )}
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-[#171916]/15 bg-[#fbf9f3]/90 px-6 py-2.5 text-sm font-medium text-[#171916] backdrop-blur-md transition hover:border-[#171916]/30 hover:bg-[#fbf9f3]"
                href="/history"
              >
                查看历史
              </Link>
            </div>
          </div>

          {/* 3-Row Tilted Continuous Visual Marquee */}
          <div className="relative mt-4 sm:mt-5">
            <div
              className="pix-marquee-stage"
              data-paused={marqueePaused ? "true" : "false"}
              aria-label="PixGen 生成作品陈列"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 sm:h-24"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(248,245,237,0.92) 0%, rgba(248,245,237,0.45) 48%, rgba(248,245,237,0) 100%)",
                }}
              />

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
                          />
                          <figcaption className="pointer-events-none absolute inset-x-2.5 bottom-2.5 hidden items-center justify-between gap-2 rounded-full border border-white/60 bg-[#fbf9f3]/88 px-3 py-1 text-[11px] text-[#171916] opacity-0 backdrop-blur-md transition duration-300 sm:flex sm:group-hover:opacity-100">
                            <span className="font-medium">{card.tag}</span>
                            <span className="text-[#6d7368]">{card.style}</span>
                          </figcaption>
                        </figure>
                      )),
                    )}
                  </div>
                ))}
              </div>

              {/* Light-Toned Oil Painting Foreground Depth Strip */}
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
                <span>{marqueePaused ? "继续" : "暂停"}</span>
              </button>
            </div>
          </div>
        </section>

        {/* 2. FEATURES (#features) — Spacious, Low Text Density */}
        <section id="features" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <div data-reveal className="reveal flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">FEATURES</p>
                <h2 className="mt-3 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.65rem]">
                  少写提示词，多看成片。
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-7 text-[#484e45] lg:pb-1">
                比例、风格和参考图点选即用，不用背英文词。
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
              {/* Card 01: Visual Controls */}
              <article
                data-reveal
                className="reveal relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3] p-6 shadow-[0_24px_64px_rgba(23,25,22,0.055)] sm:p-8"
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

                <div className="relative z-10 rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/92 p-4 shadow-[0_14px_34px_rgba(23,25,22,0.05)] backdrop-blur">
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { ratio: "1:1", w: "w-6", h: "h-6", active: false },
                      { ratio: "4:5", w: "w-5", h: "h-6", active: true },
                      { ratio: "16:9", w: "w-8", h: "h-5", active: false },
                    ].map((item) => (
                      <div
                        key={item.ratio}
                        className={[
                          "flex flex-col items-center justify-center rounded-xl border px-2 py-3.5",
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
                      </div>
                    ))}
                  </div>
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {[
                      { label: "极简高级", dot: "#d7d2c4", active: true },
                      { label: "真实摄影", dot: "#a9b79f", active: false },
                      { label: "精致插画", dot: "#e1b4a6", active: false },
                      { label: "柔和 3D", dot: "#b8ccd8", active: false },
                    ].map((chip) => (
                      <span
                        key={chip.label}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
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

                <div className="relative z-10 mt-9">
                  <p className="font-display text-xs tracking-[0.2em] text-[#6d7368]">01 · 经典模式</p>
                  <h3 className="mt-2 font-display text-2xl font-normal text-[#171916] sm:text-3xl">
                    先定方向，一次出图
                  </h3>
                  <p className="mt-2.5 text-sm leading-7 text-[#484e45]">
                    挑好比例、风格和留白，写清主体就行。
                  </p>
                </div>
              </article>

              {/* Card 02: Reference Images */}
              <article
                data-reveal
                className="reveal relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3] p-6 shadow-[0_24px_64px_rgba(23,25,22,0.055)] sm:p-8"
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
                  <div className="inline-flex rounded-full border border-[#171916]/10 bg-[#f4f0e5]/90 p-1">
                    <button
                      type="button"
                      onClick={() => setFeatureView("reference")}
                      aria-pressed={featureView === "reference"}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                        featureView === "reference" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                      }`}
                    >
                      带参考图
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeatureView("prompt")}
                      aria-pressed={featureView === "prompt"}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                        featureView === "prompt" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                      }`}
                    >
                      直接写描述
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3.5 sm:grid-cols-[0.38fr_0.62fr] sm:items-stretch">
                    <div className="flex flex-col justify-between rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/92 p-4 backdrop-blur">
                      {featureView === "reference" ? (
                        <div className="flex items-center gap-2">
                          <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-[#171916]/10">
                            <Image src="/images/marquee-window.webp" alt="参考图 1" fill sizes="48px" className="object-cover" />
                          </div>
                          <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-[#171916]/10">
                            <Image src="/images/marquee-figs.webp" alt="参考图 2" fill sizes="48px" className="object-cover" />
                          </div>
                          <span className="grid h-12 w-12 place-items-center rounded-xl border border-dashed border-[#171916]/18 text-[#6d7368]">
                            <ImagePlus size={14} aria-hidden />
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-[#566c58]">一句话描述</span>
                      )}
                      <p className="mt-4 text-xs leading-6 text-[#484e45]">
                        {featureView === "reference"
                          ? "照着参考图的色调与光线，换到窗边桌面。"
                          : "巴黎街角书店橱窗，清晨阳光，水粉插画风。"}
                      </p>
                    </div>

                    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#eee9dc]">
                      <Image
                        src={featureView === "reference" ? "/images/marquee-window.webp" : "/images/marquee-bookshop.webp"}
                        alt={featureView === "reference" ? "带参考图生成效果" : "文字描述生成效果"}
                        fill
                        sizes="(max-width: 1024px) 100vw, 34vw"
                        className="object-cover transition duration-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-9">
                  <p className="font-display text-xs tracking-[0.2em] text-[#6d7368]">02 · 参考图</p>
                  <h3 className="mt-2 font-display text-2xl font-normal text-[#171916] sm:text-3xl">
                    照着样图，接着出新图
                  </h3>
                  <p className="mt-2.5 text-sm leading-7 text-[#484e45]">
                    传本地图片或从历史里挑，每次最多带 3 张。
                  </p>
                </div>
              </article>
            </div>

            {/* Card 03: Archive Reuse Strip */}
            <article
              data-reveal
              className="reveal mt-6 grid gap-6 rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3]/92 p-6 shadow-[0_18px_46px_rgba(23,25,22,0.045)] sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center"
            >
              <div>
                <p className="font-display text-xs tracking-[0.2em] text-[#6d7368]">03 · 作品留存</p>
                <h3 className="mt-2 font-display text-2xl font-normal text-[#171916] sm:text-3xl">
                  满意的图，随时接着改
                </h3>
                <p className="mt-3 max-w-md text-sm leading-7 text-[#484e45]">
                  成片和提示词都会存进历史记录。想下载原图、复制描述，或设为参考图出下一版，点一下就行。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { src: "/images/marquee-kyoto.webp", alt: "京都庭院作品" },
                  { src: "/images/marquee-riso.webp", alt: "植物版画作品" },
                  { src: "/images/marquee-3d-bloom.webp", alt: "微缩樱花作品" },
                ].map((thumb) => (
                  <div
                    key={thumb.src}
                    className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#eee9dc]"
                  >
                    <Image
                      src={thumb.src}
                      alt={thumb.alt}
                      fill
                      sizes="180px"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
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
            className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-[2.25rem] border border-[#171916]/10 bg-[#fbf9f3] shadow-[0_26px_74px_rgba(23,25,22,0.065)]"
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

            <div className="relative z-10 grid gap-10 p-6 sm:p-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:p-12">
              <div>
                <p className="flex items-center gap-2 font-display text-xs tracking-[0.2em] text-[#566c58] uppercase">
                  <MessageSquareText size={15} aria-hidden />
                  智能体对话
                  <span className="rounded-full bg-[#384a3a] px-2.5 py-0.5 font-sans text-[10px] font-medium text-[#faf7ef]">
                    会员专属
                  </span>
                </p>
                <h2 className="mt-4 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.2rem] xl:text-[2.4rem]">
                  说不清楚，就聊清楚。
                </h2>
                <p className="mt-4 text-sm leading-7 text-[#484e45]">
                  只有个模糊想法也没关系。先聊两句定方向，出图后点选哪张就能继续改，每一步扣多少分都写清楚。
                </p>

                <div className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#f4f0e5] p-1">
                  <button
                    type="button"
                    onClick={() => setAgentStep("v1")}
                    aria-pressed={agentStep === "v1"}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      agentStep === "v1" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                    }`}
                  >
                    第 1 轮 · 出首图
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentStep("v2")}
                    aria-pressed={agentStep === "v2"}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      agentStep === "v2" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                    }`}
                  >
                    第 2 轮 · 接着改
                  </button>
                </div>
              </div>

              <AgentChatPreview step={agentStep} />
            </div>
          </div>
        </section>

        {/* 4. RECORDS METRICS (#records) */}
        <section id="records" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div data-reveal className="reveal mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div>
              <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">RECORDS</p>
              <h2 className="mt-3 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.65rem]">
                用过的图，都留着。
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-7 text-[#484e45]">
                每次成图都会记下参数和说明，需要时随时翻出来用。
              </p>
              <Link
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#171916] underline-offset-4 transition hover:text-[#384a3a] hover:underline"
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

        {/* 5. PRICING (#pricing) */}
        <section id="pricing" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div data-reveal className="reveal mx-auto max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">PRICING</p>
                <h2 className="mt-3 max-w-3xl font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.65rem]">
                  一张图一分，先免费试。
                </h2>
                <p className="mt-3 max-w-md text-sm leading-7 text-[#484e45]">
                  注册送 5 张试用；开通会员按月给额度，并解锁 Agent 对话。
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

        {/* 6. CLOSING CTA */}
        <section className="relative z-10 px-6 pb-20 pt-8 lg:px-10 lg:pb-24">
          <div
            data-reveal
            className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-[2.25rem] border border-[#171916]/10 bg-[#fbf9f3] px-7 py-14 shadow-[0_24px_64px_rgba(23,25,22,0.055)] sm:px-12 sm:py-16"
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
                <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">START</p>
                <h2 className="mt-3 max-w-2xl font-display text-3xl font-normal leading-tight text-[#171916] sm:text-5xl">
                  第一张图，现在就能出。
                </h2>
                <p className="mt-3 text-sm leading-7 text-[#484e45]">
                  登录后送 5 张免费额度，打开就能用。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {isAuthenticated ? (
                  <Link
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#171916] px-7 py-3.5 text-sm font-medium text-[#faf7ef] transition hover:bg-[#2a2e28]"
                    href="/generate"
                  >
                    开始生成
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

      <footer className="border-t border-[#171916]/10 bg-[#f2eee2]/80 px-6 py-9 text-xs text-[#6d7368] lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <span className="font-display text-base tracking-[0.08em] text-[#171916]">PixGen</span>
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

      <div className="relative overflow-hidden rounded-[1.75rem] border border-[#171916]/12 bg-[#fbf9f3] shadow-[0_26px_64px_rgba(23,25,22,0.08)]">
        <div className="flex items-center justify-between border-b border-[#171916]/8 bg-[#f4f0e5]/90 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#b48a52]/45" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#566c58]/45" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#596e7c]/45" />
            <p className="ml-2 text-xs font-medium text-[#484e45]">Agent 对话</p>
          </div>
          <span className="rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-2.5 py-0.5 font-mono text-[10px] text-[#6d7368]">
            {step === "v1" ? "图 1 · v1" : "图 2 · v2"}
          </span>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-[1.06fr_0.94fr] sm:items-stretch">
          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-[1.15rem_1.15rem_4px_1.15rem] bg-[#171916] px-3.5 py-2.5 text-xs leading-6 text-[#faf7ef]">
                  {step === "v1"
                    ? "想做张夏日海报，画面清爽一点"
                    : "构图不错，把氛围换成暖一点的傍晚光"}
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-display text-[11px] tracking-[0.2em] text-[#6d7368]">AGENT</p>
                <div className="rounded-[4px_1.15rem_1.15rem_1.15rem] border border-[#171916]/8 bg-[#f4f0e5]/85 px-3.5 py-2.5 text-xs leading-6 text-[#171916]">
                  {step === "v1"
                    ? "好，先按明亮自然光和干净构图出一版看看。"
                    : "已基于 图 1 · v1 调暖了光线，保留了原来的构图。"}
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px] text-[#484e45]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#566c58]/25 bg-[#e7eee5] px-2.5 py-1 text-[#2d3e2f]">
                    <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#384a3a] text-[8px] text-white">
                      ✓
                    </span>
                    {step === "v1" ? "生成图片 · −1 积分" : "改图 · −1 积分"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-[#171916]/10 bg-[#f4f0e5]/80 px-3.5 py-2">
              <span className="flex-1 truncate text-xs text-[#6d7368]">
                继续说一句“出两个配色变体”
                <span className="flow-caret ml-0.5 inline-block h-3 w-[1.5px] bg-[#171916]/60 align-middle" aria-hidden />
              </span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#171916] text-[#faf7ef]" aria-hidden>
                <Send size={12} />
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-[#171916]/10 bg-[#f2eee2]/85 p-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#171916]/8 bg-[#eee9dc]">
              <Image
                src={step === "v1" ? "/images/marquee-pool.webp" : "/images/marquee-figs.webp"}
                alt={step === "v1" ? "智能体生成版本 v1 示例" : "智能体改图版本 v2 示例"}
                fill
                sizes="(max-width: 1024px) 100vw, 28vw"
                className="object-cover"
              />
              <span className="absolute left-2 top-2 rounded-full bg-[#171916]/72 px-2.5 py-0.5 font-mono text-[10px] text-[#faf7ef] backdrop-blur">
                {step === "v1" ? "图 1 · v1" : "图 2 · v2 · 基于 v1"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#6d7368]">
              <span>原版本自动保留</span>
              <span className="font-medium text-[#384a3a]">点选即可续改</span>
            </div>
          </div>
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
          <li>✓ 经典生成模式与参考图</li>
          <li className="text-[#92978b]">✗ Agent 对话（会员专属）</li>
        </ul>
      </div>

      {/* Paid Tiers */}
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
                推荐
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
            <div className="mt-7">
              {isAuthenticated ? (
                <Link className={paidCtaClass} href="/upgrade">
                  前往升级页
                  <ArrowRight size={15} aria-hidden />
                </Link>
              ) : (
                <GoogleLoginButton next="/upgrade" className={paidCtaClass} />
              )}
            </div>
            <ul className="mt-7 space-y-2.5 border-t border-[#171916]/8 pt-6 text-sm leading-6 text-[#484e45]">
              <li>✓ 每期 {monthly.quotaPerTranche} 张生成额度</li>
              <li>✓ Agent 对话工作台（会员专属）</li>
              <li>✓ 订阅积分优先，永久积分兜底</li>
            </ul>
          </div>
        );
      })}
    </div>
  );
}
