"use client";

import { ArrowRight, Check, ChevronRight, History, Layers3, Send, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GoogleLoginButton } from "@/components/auth-button";

const features = [
  {
    eyebrow: "快速开始",
    title: "把描述的功夫，交给选项。",
    copy: "选择用途、比例、质感和场景，再写下主体。系统会把零散想法整理成更完整的图片说明。",
    icon: SlidersHorizontal,
    panel: "controls",
  },
  {
    eyebrow: "更贴近预期",
    title: "先定方向，不靠运气。",
    copy: "你只需要用自然语言表达想法，系统会补足构图、光线、质感和留白，让结果更稳定。",
    icon: Layers3,
    panel: "prompt",
  },
  {
    eyebrow: "方便复用",
    title: "满意的图，不该只有一次。",
    copy: "历史记录会保存图片、画面描述和反馈。以后想继续调整同一组风格，不用从头开始。",
    icon: History,
    panel: "history",
  },
] as const;

const dataPoints = [
  { value: "7", unit: "个", label: "创作选项", detail: "用途、比例、质感、场景、留白、主体和补充说明" },
  { value: "1", unit: "积分", label: "每张图的消耗", detail: "只有图片成功生成后才会扣除" },
  { value: "5", unit: "个", label: "新用户积分", detail: "第一次登录即可开始体验" },
  { value: "3", unit: "个", label: "常用动作", detail: "下载、反馈、重新生成" },
] as const;

export function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
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
      { rootMargin: "0px 0px -10% 0px", threshold: 0.18 },
    );

    elements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) {
        element.classList.add("is-visible");
        return;
      }
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--page-bg)] text-[var(--ink)]">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(180deg,rgba(17,17,17,0.025)_1px,transparent_1px)] bg-[size:100%_44px]" />

      <nav className="fixed left-1/2 top-4 z-30 w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2 rounded-full border border-black/8 bg-white/78 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.07)] backdrop-blur-xl md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link className="font-display text-2xl leading-none tracking-[0.08em] text-black" href="/">
            PromptCraft
          </Link>
          <div className="hidden items-center gap-6 text-sm text-black/60 md:flex">
            <a className="transition hover:text-black" href="#flow">
              创作
            </a>
            <a className="transition hover:text-black" href="#features">
              功能
            </a>
            <a className="transition hover:text-black" href="#agent">
              智能体
            </a>
            <a className="transition hover:text-black" href="#records">
              记录
            </a>
            <Link className="transition hover:text-black" href="/history">
              历史
            </Link>
          </div>
          {isAuthenticated ? (
            <Link className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/90" href="/generate">
              开始生成
              <ChevronRight size={16} />
            </Link>
          ) : (
            <GoogleLoginButton className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/90" />
          )}
        </div>
      </nav>

      <section className="relative z-10 px-6 pb-14 pt-32 lg:px-10">
        <div className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-6xl gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div data-reveal className="reveal">
            <p className="mb-6 max-w-max rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/58">AI 图片创作助手</p>
            <h1 className="font-display text-[clamp(2.75rem,5.5vw,5rem)] font-normal leading-[0.95] tracking-[0.01em] text-black">
              从一句模糊，
              <br />
              到一张成品。
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-black/64 md:text-xl">
              不必斟酌提示词：选好用途、比例与风格，写下主体，构图、光线和留白由系统补全；说不清想要什么，就和智能体聊。
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Link className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/90" href="/generate">
                  去生成图片
                  <ArrowRight size={17} />
                </Link>
              ) : (
                <GoogleLoginButton className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/90" />
              )}
              <Link className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-black transition hover:border-black/20" href="/history">
                查看历史
              </Link>
            </div>
          </div>

          <div data-reveal className="reveal [transition-delay:120ms]">
            <HeroGallery />
          </div>
        </div>
      </section>

      <section id="flow" className="relative z-10 px-6 pt-28 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div data-reveal className="reveal">
            <p className="font-display text-2xl tracking-[0.12em] text-black/42">创作流程</p>
            <h2 className="mt-4 text-balance text-[clamp(3rem,7vw,5.6rem)] font-normal leading-[0.96] tracking-[0.01em] text-black">
              少一点试错，多一点确定感。
            </h2>
            <p className="mt-5 text-lg leading-8 text-black/62">每一步都是选择题，不是作文题。</p>
          </div>

          <div data-reveal className="reveal mt-14 lg:mt-20">
            <FeatureFlow />
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 px-6 pb-28 pt-16 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mt-16 space-y-10 lg:mt-20">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                data-reveal
                className="reveal grid gap-10 border-t border-black/10 py-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-center"
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="mb-7 inline-grid h-11 w-11 place-items-center rounded-full border border-black/10 bg-white">
                    <feature.icon size={20} />
                  </div>
                  <p className="font-display text-lg tracking-[0.16em] text-black/42">{feature.eyebrow}</p>
                  <h3 className="mt-4 max-w-xl text-balance text-3xl font-light leading-tight text-black md:text-5xl">{feature.title}</h3>
                  <p className="mt-5 max-w-xl text-base leading-7 text-black/62">{feature.copy}</p>
                </div>
                <FeaturePanel type={feature.panel} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="agent" className="relative z-10 px-6 py-28 lg:px-10">
        <div data-reveal className="reveal mx-auto max-w-6xl rounded-[2rem] border border-black/10 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.055)]">
          <div className="grid gap-10 p-6 md:p-10 lg:grid-cols-[0.78fr_1.22fr] lg:p-12">
            <div>
              <p className="flex items-center gap-2.5 font-display text-2xl tracking-[0.14em] text-black/40">
                智能体对话
                <span className="rounded-full bg-[#47624c] px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white">NEW</span>
              </p>
              <h2 className="mt-4 text-balance text-4xl font-light leading-tight md:text-6xl">说不清楚，就聊清楚。</h2>
              <p className="mt-6 max-w-md text-pretty text-base leading-7 text-black/58">
                哪怕只有一句模糊的感觉也没关系。智能体会用几个小问题把想法聊成画面方向，生成后还能选中结果继续改。每一步计划和积分消耗，都摆在明面上。
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["先聊清楚，再出图", "选中结果继续改", "每步消耗透明"].map((chip) => (
                  <span key={chip} className="rounded-full border border-black/10 bg-[#f8faf7] px-3 py-1.5 text-xs text-black/58">
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <AgentChatPreview />
          </div>
        </div>
      </section>

      <section id="records" className="relative z-10 px-6 py-28 lg:px-10">
        <div data-reveal className="reveal mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div>
            <p className="font-display text-2xl tracking-[0.14em] text-black/40">创作记录</p>
            <h2 className="mt-4 text-balance text-4xl font-light leading-tight md:text-6xl">每一张图，都能继续使用。</h2>
            <p className="mt-6 max-w-md text-pretty text-base leading-7 text-black/58">
              图片、生成时间和画面说明都会保存在历史里。你可以下载结果，也可以从满意的作品继续生成下一版。
            </p>
            <Link
              className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-black underline-offset-4 transition hover:underline"
              href="/history"
            >
              打开历史记录
              <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
          <dl>
            {dataPoints.map((item) => (
              <div key={item.label} className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 border-t border-black/10 py-5 lg:py-6">
                <dt className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className="font-display text-[2.75rem] leading-none text-black">{item.value}</span>
                  <span className="text-sm font-semibold text-black/60">{item.unit}</span>
                </dt>
                <dd className="text-sm leading-6 text-black/55">
                  <span className="block text-base font-semibold text-black">{item.label}</span>
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="relative z-10 px-6 py-28 lg:px-10">
        <div data-reveal className="reveal mx-auto max-w-6xl border-t border-black/10 pt-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="font-display text-2xl tracking-[0.14em] text-black/40">开始创作</p>
              <h2 className="mt-4 max-w-3xl text-balance text-4xl font-light leading-tight text-black md:text-6xl">第一张图，从一句话开始。</h2>
            </div>
            {isAuthenticated ? (
              <Link className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/90" href="/generate">
                继续生成
                <ArrowRight size={17} />
              </Link>
            ) : (
              <GoogleLoginButton className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/90" />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroGallery() {
  return (
    <div className="relative mx-auto grid max-w-[660px] grid-cols-[0.72fr_1fr] gap-4">
      <div className="space-y-4 pt-14">
        <div className="overflow-hidden rounded-[1.6rem] border border-black/10 bg-white p-3 shadow-[0_22px_70px_rgba(0,0,0,0.08)]">
          <Image className="aspect-[4/5] w-full rounded-[1.2rem] object-cover" src="/images/hero-art-2.png" alt="高级产品静物图" width={720} height={900} priority />
        </div>
        <div className="rounded-[1.4rem] border border-black/10 bg-white/88 p-4 text-sm leading-6 text-black/62 shadow-[0_16px_45px_rgba(0,0,0,0.06)] backdrop-blur">
          <p className="font-display text-2xl text-black">清透白底</p>
          <p className="mt-1">适合商品图、封面、海报和品牌视觉。</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="overflow-hidden rounded-[2rem] border border-black/10 bg-white p-3 shadow-[0_30px_90px_rgba(0,0,0,0.1)]">
          <Image className="aspect-[4/5] w-full rounded-[1.55rem] object-cover" src="/images/hero-art-1.png" alt="白底艺术风生成样张" width={900} height={1125} priority />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div className="rounded-[1.5rem] border border-black/10 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-black/40">Prompt Preview</p>
            <p className="mt-3 text-sm leading-6 text-black/68">干净光线、柔和阴影、清晰主体、自然留白。</p>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white p-2">
            <Image className="h-28 w-28 rounded-[1.1rem] object-cover" src="/images/hero-art-3.png" alt="清新产品视觉样张" width={320} height={320} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureFlow() {
  // ?v=2 busts the image-optimizer cache: replacing a public file under the
  // same name is otherwise served stale from .next/cache/images in dev.
  const styles = [
    { key: "minimal", label: "极简白底", thumb: "/images/flow-style-minimal.png?v=2", result: "/images/flow-result.png?v=2" },
    { key: "bright", label: "明亮生活", thumb: "/images/flow-style-bright.png?v=2", result: "/images/flow-result-bright.png?v=2" },
    { key: "moody", label: "沉稳质感", thumb: "/images/flow-style-moody.png?v=2", result: "/images/flow-result-moody.png?v=2" },
  ];

  const [styleKey, setStyleKey] = useState("minimal");
  const [generating, setGenerating] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Switching styles replays a short "generating" beat, then the finished
  // image for that style fades in crisp — the flow demos itself.
  function choose(nextKey: string) {
    if (nextKey === styleKey || generating) return;

    setStyleKey(nextKey);
    setHasInteracted(true);
    setGenerating(true);
    window.setTimeout(() => setGenerating(false), 900);
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_3.5rem_1fr_3.5rem_0.72fr] lg:gap-5 xl:gap-6">
      <div className="flow-node" style={{ transitionDelay: "350ms" }}>
          <p className="font-mono text-[11px] tracking-[0.22em] text-black/40">01 · 方向</p>
          <p className="mt-1.5 text-[15px] font-semibold text-black">选一种画面质感</p>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {styles.map((style) => {
              const selected = style.key === styleKey;

              return (
                <button
                  key={style.key}
                  type="button"
                  onClick={() => choose(style.key)}
                  aria-pressed={selected}
                  aria-label={`${style.label}风格`}
                  className={`flow-swap relative overflow-hidden rounded-[0.9rem] border ${selected ? "border-black/55" : "border-black/10 hover:border-black/35"}`}
                >
                  <Image
                    className={`flow-swap aspect-square w-full object-cover ${selected ? "opacity-100 grayscale-0" : "opacity-60 grayscale hover:opacity-80"}`}
                    src={style.thumb}
                    alt={`${style.label}风格示例`}
                    width={256}
                    height={256}
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-2 pb-1.5 pt-5 text-[10px] font-semibold text-white">
                    {style.label}
                  </span>
                  <span
                    className={`flow-swap absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black text-white ${selected ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
                  >
                    <Check size={11} strokeWidth={3} aria-hidden />
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[11px] text-black/50">
            案例
            {["小红书封面", "1:1"].map((chip) => (
              <span key={chip} className="rounded-full border border-black/10 bg-[#f8faf7] px-2 py-0.5 text-black/60">
                {chip}
              </span>
            ))}
            <span className="text-black/38">点一点左侧缩略图试试</span>
          </p>
        </div>

        <FlowSign sign="+" />

        <div className="flow-node" style={{ transitionDelay: "670ms" }}>
          <p className="font-mono text-[11px] tracking-[0.22em] text-black/40">02 · 主体</p>
          <p className="mt-1.5 text-[15px] font-semibold text-black">一句话说清画面</p>
          <div className="mt-4 rounded-[1rem] border border-black/10 bg-[#f8faf7] p-4">
            <p className="text-[11px] font-semibold text-black/45">主体描述</p>
            <p className="mt-2 flex min-h-6 items-center text-sm leading-6 text-black">
              <span className="flow-type">一只奶白陶瓶，手工拉坯质感</span>
              <span className="flow-caret ml-0.5 inline-block h-4 w-[2px] shrink-0 bg-black" aria-hidden />
            </p>
            <p className="mt-3 text-[11px] leading-5 text-black/45">参考图和补充说明，也可以一并带上</p>
          </div>
        </div>

        <FlowSign sign="=" />

        <div className="flow-node" style={{ transitionDelay: "990ms" }}>
          <p className="font-mono text-[11px] tracking-[0.22em] text-black/40">03 · 成品</p>
          <p className="mt-1.5 text-[15px] font-semibold text-black">直接能用的图</p>
          <div className="relative mt-4 aspect-square w-full overflow-hidden rounded-[1rem] border border-black/10 bg-[#f8faf7]">
            {styles.map((style) => (
              <Image
                key={style.key}
                className={`flow-swap absolute inset-0 h-full w-full object-cover ${style.key === styleKey ? "opacity-100" : "opacity-0"} ${
                  generating && style.key === styleKey ? "scale-105 blur-md" : "scale-100 blur-0"
                }`}
                src={style.result}
                alt={`${style.label}风格成品`}
                width={480}
                height={480}
              />
            ))}
            <span
              className="flow-shimmer absolute inset-0 bg-[linear-gradient(105deg,transparent_35%,rgba(255,255,255,0.55)_50%,transparent_65%)]"
              aria-hidden
            />
            {generating ? (
              <>
                <span key={styleKey} className="flow-shimmer-replay absolute inset-0 bg-[linear-gradient(105deg,transparent_35%,rgba(255,255,255,0.55)_50%,transparent_65%)]" aria-hidden />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-black shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
                  正在生成…
                </span>
              </>
            ) : hasInteracted ? (
              <span
                key={styleKey}
                className="flow-done-replay absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-black shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
              >
                <Check size={11} strokeWidth={3} aria-hidden /> 已生成 · −1 积分
              </span>
            ) : (
              <span className="flow-done absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-black shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
                <Check size={11} strokeWidth={3} aria-hidden /> 已生成 · −1 积分
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-1.5 text-[11px] text-black/60">
            {["下载", "再来一版"].map((action) => (
              <span key={action} className="rounded-full border border-black/10 bg-white px-2.5 py-1">
                {action}
              </span>
            ))}
          </div>
        </div>
      </div>
  );
}

function FlowSign({ sign }: { sign: "+" | "=" }) {
  return (
    <div aria-hidden className="flex justify-center py-2 font-display text-xl leading-none text-black/30 lg:w-14 lg:py-0 lg:pt-14 lg:text-[1.75rem]">
      {sign}
    </div>
  );
}

function AgentChatPreview() {
  return (
    <div className="relative">
      {/* Layered back card for depth (youware-style stack). */}
      <div aria-hidden className="absolute -right-3 -top-4 h-full w-full rotate-2 rounded-[1.5rem] border border-black/10 bg-white/70" />

      <div className="relative overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-[0_30px_80px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-2 border-b border-black/10 bg-[#f8faf7] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
          <p className="ml-2 text-xs font-semibold text-black/55">PromptCraft · 智能体对话</p>
        </div>

        <div className="grid gap-4 p-5">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-[1.25rem_1.25rem_6px_1.25rem] bg-black px-4 py-2.5 text-sm leading-6 text-[#fffdf8]">
              我想发个小红书，但完全没想好要什么图
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="font-display text-[12px] tracking-[0.18em] text-black/38">智能体</p>
            <div className="max-w-[92%] rounded-[6px_1.25rem_1.25rem_1.25rem] border border-black/10 bg-[#f8faf7] px-4 py-2.5 text-sm leading-6 text-black">
              没问题，先聊两句：主推一件单品，还是一组生活方式？画面偏明亮清新，还是沉稳克制？
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-black/55">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1">
                <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-black text-[8px] text-white">✓</span>
                理清画面方向
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1">
                <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-black text-[8px] text-white">✓</span>
                生成图片 · −1 积分
              </span>
            </div>
            <div className="relative w-36 overflow-hidden rounded-[1rem] border border-black/10 bg-white">
              <Image className="block h-auto w-full" src="/images/hero-art-2.png" alt="智能体生成的图片示例" width={320} height={400} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-black/10 bg-white px-4 py-3">
          <div className="flex h-9 flex-1 items-center rounded-full border border-black/10 bg-[#f8faf7] px-4 text-[13px] text-black/40">
            选中图片后，说一句“换个暖色调”试试
            <span className="flow-caret ml-0.5 inline-block h-3.5 w-[2px] bg-black/60" aria-hidden />
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black text-white" aria-hidden>
            <Send size={14} />
          </span>
        </div>
      </div>

      {/* Floating completion toast (youware-style notification). */}
      <div className="agent-toast absolute -bottom-6 left-5 flex items-center gap-2.5 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#47624c] text-white">
          <Check size={14} strokeWidth={3} aria-hidden />
        </span>
        <div className="text-left">
          <p className="text-[13px] font-semibold text-black">图片已生成</p>
          <p className="text-[11px] text-black/50">继续对话就能改图或出变体</p>
        </div>
      </div>
    </div>
  );
}

function FeaturePanel({ type }: { type: string }) {
  if (type === "controls") {
    return (
      <div className="rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.045)]">
        <div className="grid gap-3">
          {[
            ["图片用途", "小红书封面"],
            ["画面质感", "极简高级"],
            ["场景", "影棚"],
            ["留白", "顶部留白"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-full border border-black/10 bg-[#f8faf7] px-5 py-4 text-sm text-black/70">
              <span>{label}</span>
              <span className="font-semibold text-black">{value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "prompt") {
    return (
      <div className="overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.045)]">
        <Image className="h-56 w-full object-cover" src="/images/hero-art-3.png" alt="图片说明示例" width={900} height={520} />
        <div className="p-6 text-black">
          <p className="font-display text-3xl tracking-[0.08em] text-black/42">画面说明</p>
          <p className="mt-5 text-pretty text-base leading-7">一张干净高级的商业产品图，主体清晰，光线柔和，构图留出标题空间，适合用于品牌宣传和电商展示。</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["商业产品图", "柔和光线", "干净留白", "高级质感"].map((chip) => (
              <span key={chip} className="rounded-full border border-black/10 bg-[#f8faf7] px-3 py-1 text-xs text-black/58">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.045)]">
      <div className="space-y-3">
        {["下载图片", "复制说明", "重新生成"].map((action) => (
          <div key={action} className="flex items-center justify-between rounded-2xl border border-black/10 bg-[#f8faf7] p-4 text-black">
            <span className="font-semibold">{action}</span>
            <ArrowRight size={16} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <span className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">满意</span>
        <span className="rounded-full border border-black/10 px-4 py-2 text-sm text-black/72">不满意</span>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/60">
        <Check size={16} />
        历史页会保存你的每一次成功生成
      </div>
    </div>
  );
}
