"use client";

import {
  ArrowRight,
  Check,
  ChevronRight,
  Loader2,
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

const CLASSIC_STYLE_SAMPLES = [
  { id: "minimal", label: "极简高级", dot: "#4969a8", src: "/images/marquee-cobalt.webp", alt: "极简高级风格示例" },
  { id: "photo", label: "真实摄影", dot: "#3ea7b5", src: "/images/marquee-pool.webp", alt: "真实摄影风格示例" },
  { id: "print", label: "精致插画", dot: "#d95b38", src: "/images/marquee-riso.webp", alt: "精致插画风格示例" },
  { id: "3d", label: "柔和 3D", dot: "#d8a8b8", src: "/images/marquee-3d-bloom.webp", alt: "柔和 3D 风格示例" },
] as const;

const REFERENCE_SAMPLES = [
  {
    id: "window",
    thumb: "/images/marquee-window.webp",
    result: "/images/marquee-window.webp",
    alt: "地中海窗边海景参考图",
    note: "保留窗框和通透蓝调，光线放柔和一点。",
  },
  {
    id: "figs",
    thumb: "/images/marquee-figs.webp",
    result: "/images/marquee-figs.webp",
    alt: "夏日无花果与蜜桃静物参考图",
    note: "按这组暖调桌布光线，重新安排水果与花束。",
  },
  {
    id: "meadow",
    thumb: "/images/marquee-meadow.webp",
    result: "/images/marquee-meadow.webp",
    alt: "海岸野花与灯塔油画参考图",
    note: "延续浅色油画笔触和海岸色调，放宽远景视角。",
  },
] as const;

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

/** Autonomous screen-recording sequence for #agent preview */
type DemoKeyframe = {
  stageIndex: 0 | 1 | 2;
  cursorX: number;
  cursorY: number;
  clicking: boolean;
  ripple: boolean;
  composerText: string;
  userPrompt: string;
  agentReply: string;
  toolLabel: string;
  imageSrc: string;
  imageAlt: string;
  canvasSelected: boolean;
  generating: boolean;
  durationMs: number;
};

const AGENT_DEMO_FRAMES: readonly DemoKeyframe[] = [
  // Round 1: Type prompt -> move to send -> click -> generate pool poster
  {
    stageIndex: 0,
    cursorX: 27,
    cursorY: 86.4,
    clicking: false,
    ripple: false,
    composerText: "做一张夏日泳池海报，清爽一点",
    userPrompt: "",
    agentReply: "说说你的想法，我来帮你定方向并出图。",
    toolLabel: "",
    imageSrc: "/images/marquee-pool.webp",
    imageAlt: "夏日泳池海报",
    canvasSelected: false,
    generating: false,
    durationMs: 1200,
  },
  {
    stageIndex: 0,
    cursorX: 46.1,
    cursorY: 86.4,
    clicking: true,
    ripple: true,
    composerText: "做一张夏日泳池海报，清爽一点",
    userPrompt: "做一张夏日泳池海报，清爽一点",
    agentReply: "正在按晴朗自然光和干净构图出图…",
    toolLabel: "生成图片 · −1 积分",
    imageSrc: "/images/marquee-pool.webp",
    imageAlt: "夏日泳池海报",
    canvasSelected: false,
    generating: true,
    durationMs: 950,
  },
  {
    stageIndex: 0,
    cursorX: 68,
    cursorY: 46,
    clicking: false,
    ripple: false,
    composerText: "",
    userPrompt: "做一张夏日泳池海报，清爽一点",
    agentReply: "第一版好了，想调光线或换风格直接点图说。",
    toolLabel: "生成图片 · −1 积分",
    imageSrc: "/images/marquee-pool.webp",
    imageAlt: "夏日泳池海报",
    canvasSelected: false,
    generating: false,
    durationMs: 1450,
  },
  // Round 2: Cursor moves onto canvas image -> clicks to select -> sends warm-light edit -> figs artwork blooms
  {
    stageIndex: 1,
    cursorX: 74,
    cursorY: 42,
    clicking: true,
    ripple: true,
    composerText: "",
    userPrompt: "做一张夏日泳池海报，清爽一点",
    agentReply: "第一版好了，想调光线或换风格直接点图说。",
    toolLabel: "生成图片 · −1 积分",
    imageSrc: "/images/marquee-pool.webp",
    imageAlt: "夏日泳池海报",
    canvasSelected: true,
    generating: false,
    durationMs: 1050,
  },
  {
    stageIndex: 1,
    cursorX: 46.1,
    cursorY: 86.4,
    clicking: true,
    ripple: true,
    composerText: "换成傍晚暖光，桌上有无花果和蜜桃",
    userPrompt: "换成傍晚暖光，桌上有无花果和蜜桃",
    agentReply: "收到，按选中画面调整为傍晚暖光静物…",
    toolLabel: "改图 · −1 积分",
    imageSrc: "/images/marquee-pool.webp",
    imageAlt: "夏日泳池海报",
    canvasSelected: true,
    generating: true,
    durationMs: 950,
  },
  {
    stageIndex: 1,
    cursorX: 72,
    cursorY: 46,
    clicking: false,
    ripple: false,
    composerText: "",
    userPrompt: "换成傍晚暖光，桌上有无花果和蜜桃",
    agentReply: "暖光版本已放上画布，原版会一起留着。",
    toolLabel: "改图 · −1 积分",
    imageSrc: "/images/marquee-figs.webp",
    imageAlt: "傍晚暖光无花果与蜜桃静物",
    canvasSelected: true,
    generating: false,
    durationMs: 1650,
  },
  // Round 3: Cursor clicks canvas -> requests oil-painting coastal variant -> lighthouse oil painting blooms
  {
    stageIndex: 2,
    cursorX: 76,
    cursorY: 40,
    clicking: true,
    ripple: true,
    composerText: "",
    userPrompt: "换成傍晚暖光，桌上有无花果和蜜桃",
    agentReply: "暖光版本已放上画布，原版会一起留着。",
    toolLabel: "改图 · −1 积分",
    imageSrc: "/images/marquee-figs.webp",
    imageAlt: "傍晚暖光无花果与蜜桃静物",
    canvasSelected: true,
    generating: false,
    durationMs: 950,
  },
  {
    stageIndex: 2,
    cursorX: 46.1,
    cursorY: 86.4,
    clicking: true,
    ripple: true,
    composerText: "再出一张浅色油画风的海岸灯塔",
    userPrompt: "再出一张浅色油画风的海岸灯塔",
    agentReply: "正在绘制浅色油画笔触的新版本…",
    toolLabel: "变体 · −1 积分",
    imageSrc: "/images/marquee-figs.webp",
    imageAlt: "傍晚暖光无花果与蜜桃静物",
    canvasSelected: true,
    generating: true,
    durationMs: 950,
  },
  {
    stageIndex: 2,
    cursorX: 74,
    cursorY: 44,
    clicking: false,
    ripple: false,
    composerText: "",
    userPrompt: "再出一张浅色油画风的海岸灯塔",
    agentReply: "画好了，三张都保存在画布里随时切换。",
    toolLabel: "变体 · −1 积分",
    imageSrc: "/images/marquee-meadow.webp",
    imageAlt: "浅色油画海岸灯塔",
    canvasSelected: false,
    generating: false,
    durationMs: 2200,
  },
];

const AGENT_STAGE_ITEMS = [
  { num: "01", title: "说一句模糊想法", desc: "不用写长提示词，聊两句就出首图。", jumpFrame: 2 },
  { num: "02", title: "点选画面继续改", desc: "在画布上点中任意一张，直接说哪里要调。", jumpFrame: 5 },
  { num: "03", title: "批量出不同变体", desc: "同一构图快速试不同光线与风格，每步消耗透明。", jumpFrame: 8 },
] as const;

export function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [marqueePaused, setMarqueePaused] = useState(false);
  const [classicRatio, setClassicRatio] = useState<"1:1" | "4:5" | "16:9">("4:5");
  const [classicStyle, setClassicStyle] = useState<(typeof CLASSIC_STYLE_SAMPLES)[number]["id"]>("minimal");
  const [featureView, setFeatureView] = useState<"reference" | "prompt">("reference");
  const [activeRefId, setActiveRefId] = useState<(typeof REFERENCE_SAMPLES)[number]["id"]>("window");
  const [demoFrameIndex, setDemoFrameIndex] = useState(2);
  const [demoPaused, setDemoPaused] = useState(false);

  const activeClassicSample =
    CLASSIC_STYLE_SAMPLES.find((item) => item.id === classicStyle) ?? CLASSIC_STYLE_SAMPLES[0];
  const activeRefSample =
    REFERENCE_SAMPLES.find((item) => item.id === activeRefId) ?? REFERENCE_SAMPLES[0];

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

  // Auto-playing screen-recording loop for #agent (respects prefers-reduced-motion)
  useEffect(() => {
    if (demoPaused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const currentFrame = AGENT_DEMO_FRAMES[demoFrameIndex] ?? AGENT_DEMO_FRAMES[0];
    const timer = window.setTimeout(() => {
      setDemoFrameIndex((prev) => (prev + 1) % AGENT_DEMO_FRAMES.length);
    }, currentFrame.durationMs);

    return () => window.clearTimeout(timer);
  }, [demoFrameIndex, demoPaused]);

  const demoFrame = AGENT_DEMO_FRAMES[demoFrameIndex] ?? AGENT_DEMO_FRAMES[0];

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
                  className="hidden rounded-full border border-[#171916]/15 bg-[#fbf9f3]/80 px-3.5 py-2 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916] sm:inline-flex"
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
        {/* 1. HERO — Full-bleed oil canvas + 3-row tilted continuous showcase + painterly foreground */}
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
            <p className="mx-auto mt-3.5 max-w-xl text-balance text-sm leading-7 text-[#484e45] sm:text-base">
              选好比例和风格就能出图，拿不准方向直接和智能体聊。
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
                          <figcaption className="pointer-events-none absolute inset-x-2.5 bottom-2.5 hidden items-center justify-between gap-2 rounded-full border border-white/60 bg-[#fbf9f3]/90 px-3 py-1 text-[11px] text-[#171916] opacity-0 backdrop-blur-md transition duration-300 sm:flex sm:group-hover:opacity-100">
                            <span className="font-medium">{card.tag}</span>
                            <span className="text-[#6d7368]">{card.style}</span>
                          </figcaption>
                        </figure>
                      )),
                    )}
                  </div>
                ))}
              </div>

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

        {/* 2. FEATURES (#features) — Asymmetric Editorial Spread + Borderless Archive Strip */}
        <section id="features" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <div data-reveal className="reveal flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">FEATURES</p>
                <h2 className="mt-3 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.75rem]">
                  少写提示词，多看成片。
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-7 text-[#484e45] lg:pb-1">
                比例、风格和参考图点选即用，不用背英文词。
              </p>
            </div>

            {/* Asymmetric editorial pair: narrow stacked studio plate (0.82fr) + wide reference showcase (1.18fr) */}
            <div className="mt-12 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
              {/* 01 Classic Mode — Compact vertical specimen plate */}
              <article
                data-reveal
                className="reveal relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3] p-6 shadow-[0_20px_54px_rgba(23,25,22,0.05)]"
              >
                <div aria-hidden className="pointer-events-none absolute inset-0 opacity-55">
                  <Image
                    src="/images/oil-section-wash.webp"
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#fbf9f3]/70 via-[#fbf9f3]/90 to-[#fbf9f3]/95" />
                </div>

                <div className="relative z-10 space-y-3">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#eee9dc] shadow-[0_12px_30px_rgba(23,25,22,0.07)]">
                    <Image
                      key={activeClassicSample.src}
                      src={activeClassicSample.src}
                      alt={activeClassicSample.alt}
                      fill
                      sizes="(max-width: 1024px) 100vw, 36vw"
                      className="object-cover transition duration-500"
                    />
                  </div>

                  {/* Interactive ratio & style bar — clean 2-row rhythm, zero orphan chips */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {(["1:1", "4:5", "16:9"] as const).map((ratio) => {
                          const active = classicRatio === ratio;
                          return (
                            <button
                              key={ratio}
                              type="button"
                              onClick={() => setClassicRatio(ratio)}
                              aria-pressed={active}
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold tabular-nums transition ${
                                active
                                  ? "bg-[#171916] text-[#faf7ef]"
                                  : "border border-[#171916]/15 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/30"
                              }`}
                            >
                              {ratio}
                            </button>
                          );
                        })}
                      </div>
                      <span className="text-[11px] text-[#6d7368]">点选切换预览</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {CLASSIC_STYLE_SAMPLES.map((chip) => {
                        const active = classicStyle === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => setClassicStyle(chip.id)}
                            aria-pressed={active}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition ${
                              active
                                ? "border-[#566c58]/45 bg-[#e7eee5] font-semibold text-[#243426]"
                                : "border-[#171916]/10 bg-[#fbf9f3] text-[#484e45] hover:border-[#171916]/25"
                            }`}
                          >
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full border border-black/10"
                              style={{ backgroundColor: chip.dot }}
                            />
                            <span className="truncate">{chip.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-5 border-t border-[#171916]/10 pt-4">
                  <p className="font-display text-xs tracking-[0.2em] text-[#6d7368]">01 · 经典模式</p>
                  <h3 className="mt-1.5 font-display text-2xl font-normal text-[#171916]">
                    先定方向，一次出图
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#484e45]">
                    点选比例、风格和留白，写清主体就行。
                  </p>
                </div>
              </article>

              {/* 02 Reference Images — Wide interactive showcase (all 3 reference thumbnails clickable!) */}
              <article
                data-reveal
                className="reveal relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-[#171916]/10 bg-[#fbf9f3] p-6 shadow-[0_20px_54px_rgba(23,25,22,0.05)]"
                style={{ transitionDelay: "90ms" }}
              >
                <div aria-hidden className="pointer-events-none absolute inset-0 opacity-65">
                  <Image
                    src="/images/oil-section-wash.webp"
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 55vw"
                    className="scale-x-[-1] object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#fbf9f3]/70 via-[#fbf9f3]/85 to-[#fbf9f3]/95" />
                </div>

                <div className="relative z-10 grid gap-4 sm:grid-cols-[0.42fr_0.58fr] sm:items-stretch">
                  <div className="flex flex-col justify-between gap-3.5 rounded-2xl border border-[#171916]/10 bg-[#fbf9f3]/90 p-4 backdrop-blur">
                    <div className="inline-flex w-full rounded-full border border-[#171916]/10 bg-[#f4f0e5]/90 p-0.5">
                      <button
                        type="button"
                        onClick={() => setFeatureView("reference")}
                        aria-pressed={featureView === "reference"}
                        className={`flex-1 rounded-full py-1.5 text-[11px] font-medium transition ${
                          featureView === "reference" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                        }`}
                      >
                        带参考图
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeatureView("prompt")}
                        aria-pressed={featureView === "prompt"}
                        className={`flex-1 rounded-full py-1.5 text-[11px] font-medium transition ${
                          featureView === "prompt" ? "bg-[#171916] text-[#faf7ef]" : "text-[#484e45] hover:text-[#171916]"
                        }`}
                      >
                        直接描述
                      </button>
                    </div>

                    {featureView === "reference" ? (
                      <>
                        <div className="grid grid-cols-3 gap-2" role="group" aria-label="切换参考图样例">
                          {REFERENCE_SAMPLES.map((ref) => {
                            const selected = activeRefId === ref.id;
                            return (
                              <button
                                key={ref.id}
                                type="button"
                                onClick={() => setActiveRefId(ref.id)}
                                aria-pressed={selected}
                                aria-label={`选择${ref.alt}`}
                                className={[
                                  "relative aspect-square cursor-pointer overflow-hidden rounded-xl border-2 bg-[#eee9dc] transition duration-200 hover:scale-[1.04] active:scale-[0.97]",
                                  selected
                                    ? "border-[#171916] ring-2 ring-[#171916]/15 shadow-sm"
                                    : "border-transparent opacity-75 hover:opacity-100",
                                ].join(" ")}
                              >
                                <Image
                                  src={ref.thumb}
                                  alt={ref.alt}
                                  fill
                                  sizes="72px"
                                  loading="eager"
                                  className="object-cover"
                                />
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs leading-5 text-[#484e45]">{activeRefSample.note}</p>
                      </>
                    ) : (
                      <div className="flex flex-1 flex-col justify-between gap-2.5 rounded-xl border border-[#171916]/10 bg-[#f4f0e5]/75 p-3">
                        <p className="text-xs leading-6 text-[#171916]">
                          巴黎街角书店橱窗，清晨阳光，水粉插画风。
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-2 py-0.5 text-[10px] text-[#484e45]">
                            精致插画
                          </span>
                          <span className="rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-2 py-0.5 text-[10px] text-[#484e45]">
                            4:5
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-[#171916]/10 bg-[#eee9dc] shadow-[0_12px_30px_rgba(23,25,22,0.07)] sm:aspect-auto sm:min-h-[268px]">
                    <Image
                      key={featureView === "reference" ? activeRefSample.result : "prompt-bookshop"}
                      src={featureView === "reference" ? activeRefSample.result : "/images/marquee-bookshop.webp"}
                      alt={featureView === "reference" ? activeRefSample.alt : "文字描述生成效果"}
                      fill
                      sizes="(max-width: 1024px) 100vw, 34vw"
                      className="pix-canvas-bloom object-cover"
                    />
                  </div>
                </div>

                <div className="relative z-10 mt-5 border-t border-[#171916]/10 pt-4">
                  <p className="font-display text-xs tracking-[0.2em] text-[#6d7368]">02 · 参考图</p>
                  <h3 className="mt-1.5 font-display text-2xl font-normal text-[#171916]">
                    照着样图，接着出新图
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#484e45]">
                    点上面 3 张参考图试试效果，实际创作支持本地上传或从历史带入。
                  </p>
                </div>
              </article>
            </div>

            {/* 03 Borderless Editorial Strip — breaks the card-box rhythm */}
            <div
              data-reveal
              className="reveal mt-16 grid gap-8 border-t border-[#171916]/15 pt-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-center"
            >
              <div>
                <p className="font-display text-xs tracking-[0.2em] text-[#566c58]">03 · 作品留存</p>
                <h3 className="mt-2 font-display text-2xl font-normal text-[#171916] sm:text-3xl">
                  满意的图，随时接着改
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-7 text-[#484e45]">
                  成片和提示词都会存进历史记录。下载原图、复制描述，或设为参考图出下一版，点一下就行。
                </p>
              </div>
              <div className="grid grid-cols-3 items-end gap-4">
                {[
                  { src: "/images/marquee-kyoto.webp", alt: "京都庭院作品", aspect: "aspect-[4/3]" },
                  { src: "/images/marquee-riso.webp", alt: "植物版画作品", aspect: "aspect-[5/4]" },
                  { src: "/images/marquee-3d-bloom.webp", alt: "微缩樱花作品", aspect: "aspect-[4/3]" },
                ].map((thumb) => (
                  <div
                    key={thumb.src}
                    className={`group relative ${thumb.aspect} overflow-hidden rounded-2xl border border-white/80 bg-[#fbf9f3] p-1.5 shadow-[0_14px_34px_rgba(23,25,22,0.07)]`}
                  >
                    <div className="relative h-full w-full overflow-hidden rounded-xl">
                      <Image
                        src={thumb.src}
                        alt={thumb.alt}
                        fill
                        sizes="220px"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. AGENT (#agent) — Full-Bleed Tonal Studio Band + Autonomous Screen-Recording Demo */}
        <section
          id="agent"
          className="relative z-10 w-full overflow-hidden border-y border-[#171916]/10 bg-[#ece7da] py-24 lg:py-28"
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-45">
            <Image
              src="/images/oil-section-wash.webp"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#ece7da]/65 via-[#ece7da]/45 to-[#ece7da]/75" />
          </div>

          <div
            data-reveal
            className="reveal relative z-10 mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[0.74fr_1.26fr] lg:items-center lg:gap-12 lg:px-10"
          >
            <div>
              <p className="flex items-center gap-2 font-display text-xs tracking-[0.2em] text-[#384a3a] uppercase">
                <MessageSquareText size={15} aria-hidden />
                智能体对话
                <span className="rounded-full bg-[#384a3a] px-2.5 py-0.5 font-sans text-[10px] font-medium text-[#faf7ef]">
                  会员专属
                </span>
              </p>
              <h2 className="mt-4 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.35rem]">
                说不清楚，
                <br />
                就聊清楚。
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#484e45]">
                自动演示：从一句模糊描述出图，到点击画面选中继续改。
              </p>

              {/* Live 3-step ledger synced with autonomous screen recording */}
              <ol className="mt-7 space-y-2">
                {AGENT_STAGE_ITEMS.map((item, idx) => {
                  const active = demoFrame.stageIndex === idx;
                  return (
                    <li key={item.num}>
                      <button
                        type="button"
                        onClick={() => setDemoFrameIndex(item.jumpFrame)}
                        className={[
                          "flex w-full items-start gap-3.5 rounded-2xl border px-4 py-3 text-left transition",
                          active
                            ? "border-[#171916]/15 bg-[#fbf9f3]/95 shadow-[0_10px_28px_rgba(23,25,22,0.06)]"
                            : "border-transparent bg-transparent opacity-70 hover:bg-[#fbf9f3]/50 hover:opacity-100",
                        ].join(" ")}
                      >
                        <span
                          className={`mt-0.5 font-mono text-xs font-semibold ${
                            active ? "text-[#384a3a]" : "text-[#7c8276]"
                          }`}
                        >
                          {item.num}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-[#171916]">{item.title}</p>
                          <p className="mt-0.5 text-xs leading-5 text-[#484e45]">{item.desc}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <AgentScreenRecording
              frame={demoFrame}
              paused={demoPaused}
              onTogglePause={() => setDemoPaused((p) => !p)}
            />
          </div>
        </section>

        {/* 4. RECORDS (#records) — Full-Bleed Borderless Watercolor Panorama + Open Frosted Ledger */}
        <section id="records" className="relative z-10 w-full overflow-hidden py-28 lg:py-36">
          {/* Full-bleed illustrated backdrop melting smoothly into page canvas top & bottom */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <Image
              src="/images/oil-records-bg.webp"
              alt=""
              fill
              sizes="100vw"
              className="object-cover object-left-bottom opacity-95"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(246,243,234,0.96) 0%, rgba(246,243,234,0.18) 18%, rgba(246,243,234,0.14) 80%, rgba(246,243,234,0.98) 100%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(95deg, rgba(246,243,234,0.74) 0%, rgba(246,243,234,0.34) 44%, rgba(246,243,234,0.42) 100%)",
              }}
            />
          </div>

          <div
            data-reveal
            className="reveal relative z-10 mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:gap-14 lg:px-10"
          >
            {/* Open typography sitting directly on the watercolor landscape */}
            <div>
              <p className="font-display text-xs tracking-[0.22em] text-[#384a3a] uppercase">RECORDS</p>
              <h2 className="mt-3 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.6rem]">
                用过的图，
                <br />
                都留着。
              </h2>
              <p className="mt-4 max-w-[16rem] text-sm leading-7 text-[#2d332a]">
                每次成图都会记下参数与说明，需要时随时翻出来用。
              </p>
              <Link
                className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-[#171916] px-5 py-2.5 text-xs font-medium text-[#faf7ef] shadow-[0_12px_28px_rgba(23,25,22,0.16)] transition hover:bg-[#2a2e28]"
                href="/history"
              >
                打开历史记录
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>

            {/* Translucent frosted ledger floating over bright right watercolor sky — preserves OpenSpec indented fixed-width numeric column */}
            <div className="rounded-[1.75rem] border border-white/80 bg-[#fbf9f3]/80 px-3 py-2 shadow-[0_22px_56px_rgba(23,25,22,0.08)] backdrop-blur-md sm:px-5">
              <dl>
                {dataPoints.map((item, idx) => (
                  <div
                    key={item.label}
                    className={[
                      "grid grid-cols-[5.75rem_1fr] items-baseline gap-x-6 py-5 pl-4 sm:pl-8 lg:pl-14",
                      idx > 0 ? "border-t border-[#171916]/10" : "",
                    ].join(" ")}
                  >
                    <dt className="flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
                      <span className="font-display text-[2.6rem] leading-none text-[#171916]">{item.value}</span>
                      <span className="text-sm font-medium text-[#6d7368]">{item.unit}</span>
                    </dt>
                    <dd className="text-sm leading-6 text-[#484e45]">
                      <span className="block text-base font-semibold text-[#171916]">{item.label}</span>
                      {item.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* 5. PRICING (#pricing) — Architectural 3-Column Table with High-Contrast Deep Pine Pro Column */}
        <section id="pricing" className="relative z-10 px-6 py-24 lg:px-10 lg:py-28">
          <div data-reveal className="reveal mx-auto max-w-6xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-display text-xs tracking-[0.22em] text-[#566c58] uppercase">PRICING</p>
                <h2 className="mt-3 font-display text-3xl font-normal leading-tight text-[#171916] sm:text-[2.75rem]">
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

        {/* 6. CLOSING CTA — Borderless Centered Monograph Finale (no rounded box!) */}
        <section className="relative z-10 overflow-hidden border-t border-[#171916]/10 px-6 py-28 text-center lg:px-10 lg:py-32">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <Image
              src="/images/oil-section-wash.webp"
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-55"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(246,243,234,0.9) 0%, rgba(246,243,234,0.52) 50%, rgba(242,238,226,0.92) 100%)",
              }}
            />
          </div>

          <div data-reveal className="reveal relative z-10 mx-auto max-w-2xl">
            <p className="font-display text-xs tracking-[0.24em] text-[#566c58] uppercase">START</p>
            <h2 className="mt-4 font-display text-4xl font-normal leading-tight text-[#171916] sm:text-5xl">
              第一张图，现在就能出。
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#484e45]">
              登录后送 5 张免费额度，打开就能用。
            </p>
            <div className="mt-8 flex justify-center">
              {isAuthenticated ? (
                <Link
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#171916] px-8 py-3.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.18)] transition hover:bg-[#2a2e28]"
                  href="/generate"
                >
                  开始生成
                  <ArrowRight size={16} aria-hidden />
                </Link>
              ) : (
                <GoogleLoginButton className="inline-flex items-center justify-center gap-2 rounded-full bg-[#171916] px-8 py-3.5 text-sm font-medium text-[#faf7ef] shadow-[0_14px_34px_rgba(23,25,22,0.18)] transition hover:bg-[#2a2e28]" />
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#171916]/10 bg-[#f2eee2] px-6 py-9 text-xs text-[#6d7368] lg:px-10">
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

function AgentScreenRecording({
  frame,
  paused,
  onTogglePause,
}: {
  frame: DemoKeyframe;
  paused: boolean;
  onTogglePause: () => void;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[1.75rem] border border-[#171916]/15 bg-[#fbf9f3] shadow-[0_32px_80px_rgba(23,25,22,0.12)]"
      aria-label="Agent 自动演示录屏"
    >
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-[#171916]/10 bg-[#f4f0e5]/95 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#c9a27c]/65" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#7c947d]/65" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#7d919d]/65" />
          <p className="ml-2 text-xs font-medium text-[#484e45]">Agent 对话工作台</p>
        </div>
        <button
          type="button"
          onClick={onTogglePause}
          aria-pressed={paused}
          className="inline-flex items-center gap-1 rounded-full border border-[#171916]/10 bg-[#fbf9f3] px-2.5 py-1 text-[11px] font-medium text-[#484e45] transition hover:text-[#171916]"
        >
          {paused ? <Play size={10} aria-hidden /> : <Pause size={10} aria-hidden />}
          <span>{paused ? "播放演示" : "演示中"}</span>
        </button>
      </div>

      {/* Simulated Interactive Stage + Floating Automated Mouse Cursor */}
      <div className="relative grid gap-4 p-5 sm:grid-cols-[1.04fr_0.96fr] sm:items-stretch">
        {/* Left: Chat & Composer */}
        <div className="flex min-h-[275px] flex-col justify-between gap-4">
          <div className="space-y-3">
            {frame.userPrompt ? (
              <div className="flex justify-end">
                <div className="max-w-[92%] rounded-[1.15rem_1.15rem_4px_1.15rem] bg-[#171916] px-3.5 py-2.5 text-xs leading-6 text-[#faf7ef] transition">
                  {frame.userPrompt}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="font-display text-[11px] tracking-[0.2em] text-[#6d7368]">AGENT</p>
              <div className="rounded-[4px_1.15rem_1.15rem_1.15rem] border border-[#171916]/10 bg-[#f4f0e5]/85 px-3.5 py-2.5 text-xs leading-6 text-[#171916]">
                {frame.agentReply}
              </div>

              {frame.toolLabel ? (
                <div className="flex flex-wrap gap-1.5 text-[11px] text-[#484e45]">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#566c58]/25 bg-[#e7eee5] px-2.5 py-1 text-[#2d3e2f]">
                    {frame.generating ? (
                      <Loader2 size={11} className="animate-spin text-[#384a3a]" aria-hidden />
                    ) : (
                      <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#384a3a] text-[8px] text-white">
                        ✓
                      </span>
                    )}
                    {frame.toolLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Composer bar */}
          <div
            className={`flex items-center gap-2 rounded-full border px-3.5 py-2 transition ${
              frame.composerText
                ? "border-[#384a3a]/40 bg-[#fbf9f3]"
                : "border-[#171916]/10 bg-[#f4f0e5]/80"
            }`}
          >
            <span className="flex-1 truncate text-xs text-[#171916]">
              {frame.composerText || <span className="text-[#92978b]">点选画布图片，继续说怎么改…</span>}
              {frame.composerText ? (
                <span className="flow-caret ml-0.5 inline-block h-3 w-[1.5px] bg-[#171916] align-middle" aria-hidden />
              ) : null}
            </span>
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#171916] text-[#faf7ef] transition ${
                frame.clicking && frame.cursorX < 55 ? "scale-90 bg-[#384a3a]" : ""
              }`}
              aria-hidden
            >
              <Send size={12} />
            </span>
          </div>
        </div>

        {/* Right: Artwork Canvas (no "图 1 · v1" labels) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#171916]/10 bg-[#f2eee2]/85 p-3">
          <div
            className={[
              "relative aspect-[4/3] w-full overflow-hidden rounded-xl border-2 bg-[#eee9dc] transition duration-300",
              frame.canvasSelected
                ? "border-[#384a3a] shadow-[0_0_0_3px_rgba(56,74,58,0.16)]"
                : "border-[#171916]/10",
            ].join(" ")}
          >
            <Image
              key={frame.imageSrc}
              src={frame.imageSrc}
              alt={frame.imageAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 32vw"
              className="pix-canvas-bloom object-cover"
            />

            {frame.generating ? (
              <div className="absolute inset-0 grid place-items-center bg-[#fbf9f3]/55 backdrop-blur-[2px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#171916]/85 px-3 py-1.5 text-[11px] font-medium text-[#faf7ef] shadow-sm">
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  生成中…
                </span>
              </div>
            ) : null}

            {frame.canvasSelected && !frame.generating ? (
              <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[#384a3a]/90 px-2.5 py-0.5 text-[10px] font-medium text-[#faf7ef] backdrop-blur">
                <Check size={10} strokeWidth={3} aria-hidden /> 已选中
              </span>
            ) : null}
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#6d7368]">
            <span>历史版本自动保留</span>
            <span className="font-medium text-[#384a3a]">
              {frame.generating ? "正在更新画面" : frame.canvasSelected ? "已锁定修改对象" : "就绪"}
            </span>
          </div>
        </div>

        {/* Autonomous Simulated Mouse Cursor & Click Ripple (desktop/sm+) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 hidden overflow-hidden sm:block"
        >
          {frame.ripple ? (
            <span
              key={`${frame.cursorX}-${frame.cursorY}-${frame.stageIndex}-${frame.generating}`}
              className="pix-click-ripple absolute h-10 w-10 rounded-full border-2 border-[#384a3a] bg-[#384a3a]/20"
              style={{ left: `${frame.cursorX}%`, top: `${frame.cursorY}%` }}
            />
          ) : null}

          <div
            className="absolute transition-[left,top] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ left: `${frame.cursorX}%`, top: `${frame.cursorY}%` }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className={`-ml-1 -mt-1 drop-shadow-[0_4px_8px_rgba(23,25,22,0.28)] transition-transform duration-150 ${
                frame.clicking ? "scale-[0.85]" : "scale-100"
              }`}
            >
              <path
                d="M5.5 3.5L18.5 11.2L12.6 12.8L9.6 18.6L5.5 3.5Z"
                fill="#171916"
                stroke="#FAF7EF"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
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
  const invertedCtaClass =
    "inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#faf7ef] px-5 py-3 text-sm font-semibold text-[#171916] transition hover:bg-white";

  return (
    <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:items-stretch">
      {/* Free Tier — Quiet open border */}
      <div className="flex flex-col rounded-[1.75rem] border border-[#171916]/15 bg-transparent p-7">
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
        <ul className="mt-7 space-y-2.5 border-t border-[#171916]/10 pt-6 text-sm leading-6 text-[#484e45]">
          <li>✓ 5 张一次性试用积分，不刷新</li>
          <li>✓ 经典生成模式与参考图</li>
          <li className="text-[#92978b]">✗ Agent 对话（会员专属）</li>
        </ul>
      </div>

      {/* Paid Tiers — Standard warm parchment + Pro inverted deep pine charcoal focus */}
      {pricingTiers.map((tier) => {
        const monthly = planForTier(tier.quota, 30);
        const yearly = planForTier(tier.quota, 365);

        if (!monthly || !yearly) {
          return null;
        }

        const isDarkFocus = tier.popular;

        return (
          <div
            key={tier.quota}
            className={[
              "relative flex flex-col rounded-[1.75rem] border p-7 transition",
              isDarkFocus
                ? "border-[#1c221d] bg-[#1c221d] text-[#faf7ef] shadow-[0_28px_68px_rgba(23,25,22,0.2)]"
                : "border-[#171916]/10 bg-[#fbf9f3] text-[#171916] shadow-[0_18px_46px_rgba(23,25,22,0.045)]",
            ].join(" ")}
          >
            {isDarkFocus ? (
              <span className="absolute -top-3 left-7 rounded-full bg-[#b48a52] px-3.5 py-1 text-[11px] font-semibold tracking-wide text-[#faf7ef]">
                推荐
              </span>
            ) : null}
            <p className={`font-display text-xs tracking-[0.22em] ${isDarkFocus ? "text-[#b6c3b5]" : "text-[#6d7368]"}`}>
              {tier.label.toUpperCase()}
            </p>
            <h3 className="mt-2 font-display text-2xl font-normal">{tier.title}</h3>
            <p className="mt-4 font-display text-4xl font-normal tabular-nums">
              {formatFenAsCny(monthly.amountFen)}
              <span className={`ml-1 font-sans text-sm font-normal ${isDarkFocus ? "text-[#b6c3b5]" : "text-[#6d7368]"}`}>
                /月
              </span>
            </p>
            <p className={`mt-2 text-sm tabular-nums ${isDarkFocus ? "text-[#d5b98b]" : "text-[#566c58]"}`}>
              年付 {formatFenAsCny(yearly.amountFen)}/年，省 {YEARLY_DISCOUNT_PERCENT}%
            </p>
            <div className="mt-7">
              {isAuthenticated ? (
                <Link className={isDarkFocus ? invertedCtaClass : paidCtaClass} href="/upgrade">
                  前往升级页
                  <ArrowRight size={15} aria-hidden />
                </Link>
              ) : (
                <GoogleLoginButton next="/upgrade" className={isDarkFocus ? invertedCtaClass : paidCtaClass} />
              )}
            </div>
            <ul
              className={`mt-7 space-y-2.5 border-t pt-6 text-sm leading-6 ${
                isDarkFocus ? "border-white/15 text-[#dde3dc]" : "border-[#171916]/10 text-[#484e45]"
              }`}
            >
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
