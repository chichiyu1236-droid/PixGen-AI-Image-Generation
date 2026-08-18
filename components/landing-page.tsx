"use client";

import { ArrowRight, Check, ChevronRight, History, Layers3, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { GoogleLoginButton } from "@/components/auth-button";

const features = [
  {
    eyebrow: "快速开始",
    title: "不用反复琢磨描述，也能把画面说清楚。",
    copy: "选择用途、比例、质感和场景，再写下主体。系统会把零散想法整理成更完整的图片说明。",
    icon: SlidersHorizontal,
    panel: "controls",
  },
  {
    eyebrow: "更贴近预期",
    title: "每次生成前，先把画面方向理顺。",
    copy: "你只需要用自然语言表达想法，系统会补足构图、光线、质感和留白，让结果更稳定。",
    icon: Layers3,
    panel: "prompt",
  },
  {
    eyebrow: "方便复用",
    title: "喜欢的结果，可以下载、复制，也可以再生成一版。",
    copy: "历史记录会保存图片、画面描述和反馈。以后想继续调整同一组风格，不用从头开始。",
    icon: History,
    panel: "history",
  },
] as const;

const dataPoints = [
  { value: "7", label: "个创作选项", detail: "用途、比例、质感、场景、留白、主体和补充说明" },
  { value: "1", label: "张图消耗 1 积分", detail: "只有图片成功生成后才会扣除" },
  { value: "5", label: "个新用户积分", detail: "第一次登录即可开始体验" },
  { value: "3", label: "个常用动作", detail: "下载、反馈、重新生成" },
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
            <a className="transition hover:text-black" href="#features">
              功能
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
            <h1 className="font-display text-balance text-[clamp(4rem,9vw,7.2rem)] font-normal leading-[0.92] tracking-[0.01em] text-black">
              把想法
              <br />
              变成好看的图
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-black/64 md:text-xl">
              不用从零写复杂描述。选好用途、比例和画面风格，再写下主体，系统会帮你整理成更完整的图片说明。
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

      <section id="features" className="relative z-10 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div data-reveal className="reveal grid gap-6 lg:grid-cols-[0.78fr_1fr] lg:items-end">
            <div>
              <p className="font-display text-2xl tracking-[0.12em] text-black/42">创作流程</p>
              <h2 className="mt-4 text-balance text-[clamp(3rem,7vw,5.6rem)] font-normal leading-[0.96] tracking-[0.01em] text-black">
                少一点试错，多一点确定感。
              </h2>
            </div>
            <p className="text-lg leading-8 text-black/62">把常见图片需求拆成几个好选择的步骤，适合做商品图、封面、海报、头像和 Banner。</p>
          </div>

          <div className="mt-16 space-y-8">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                data-reveal
                className="reveal grid gap-8 border-t border-black/10 py-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center"
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

      <section id="records" className="relative z-10 px-6 py-24 lg:px-10">
        <div data-reveal className="reveal mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.055)]">
          <div className="grid gap-8 p-6 md:p-10 lg:grid-cols-[0.72fr_1.28fr] lg:p-12">
            <div>
              <p className="font-display text-2xl tracking-[0.14em] text-black/40">创作记录</p>
              <h2 className="mt-4 text-balance text-4xl font-light leading-tight md:text-6xl">每一张图，都能继续使用。</h2>
              <p className="mt-6 max-w-md text-pretty text-base leading-7 text-black/58">
                图片、生成时间和画面说明都会保存在历史里。你可以下载结果，也可以从满意的作品继续生成下一版。
              </p>
            </div>
            <dl className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/8 md:grid-cols-2">
              {dataPoints.map((item) => (
                <div key={item.label} className="bg-white p-6">
                  <dt className="font-display text-[4.5rem] leading-none tracking-[0.04em] text-black">{item.value}</dt>
                  <dd className="mt-4 text-lg font-semibold text-black">{item.label}</dd>
                  <p className="mt-2 text-sm leading-6 text-black/58">{item.detail}</p>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 py-24 lg:px-10">
        <div data-reveal className="reveal mx-auto max-w-6xl border-t border-black/10 pt-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="font-display text-2xl tracking-[0.14em] text-black/40">开始创作</p>
              <h2 className="mt-4 max-w-3xl text-balance text-4xl font-light leading-tight text-black md:text-6xl">试着生成第一张图片。</h2>
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
          <p className="mt-5 text-pretty text-lg leading-8">一张干净高级的商业产品图，主体清晰，光线柔和，构图留出标题空间，适合用于品牌宣传和电商展示。</p>
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
