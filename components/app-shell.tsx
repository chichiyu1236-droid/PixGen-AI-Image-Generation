"use client";

import { Clapperboard, Crown, Images, Menu, Palette, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/auth-button";
import { CreditBadge } from "@/components/credit-badge";
import type { CreditBalance } from "@/lib/auth/balance";

const NAV_ITEMS = [
  { href: "/generate", label: "创作工作台", sub: "Studio", icon: Palette },
  { href: "/history", label: "作品图库", sub: "Archive", icon: Images },
  { href: "/upgrade", label: "会员与积分", sub: "Plans", icon: Crown },
] as const;

export function BrandMark({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 text-[#171916] focus:outline-none">
      <span
        aria-hidden
        className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#171916]/12 bg-[#fbf9f3] shadow-[0_4px_14px_rgba(23,25,22,0.06)] transition group-hover:border-[#566c58]/40"
      >
        <span className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#b48a52_0%,#566c58_62%,#171916_100%)] opacity-85" />
      </span>
      <span className="flex flex-col leading-none">
        <span className={`font-display tracking-[0.06em] text-[#171916] ${compact ? "text-lg" : "text-[21px]"}`}>
          PixGen
        </span>
        {!compact ? (
          <span className="mt-1 text-[10px] tracking-[0.2em] text-[#6d7368] uppercase">Atelier</span>
        ) : null}
      </span>
    </Link>
  );
}

export function AppShell({
  balance,
  children,
  immersive = false,
}: {
  balance: CreditBalance;
  children: ReactNode;
  immersive?: boolean;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoNotice, setVideoNotice] = useState(false);

  return (
    <div
      className={
        immersive
          ? "flex min-h-screen flex-col text-[#171916] lg:h-screen lg:flex-row lg:overflow-hidden"
          : "flex min-h-screen flex-col text-[#171916] lg:flex-row"
      }
    >
      <aside className="sticky top-0 z-30 flex flex-col border-b border-[#171916]/10 bg-[#f4f0e5]/92 backdrop-blur-xl lg:static lg:h-screen lg:w-[228px] lg:shrink-0 lg:border-b-0 lg:border-r">
        {/* Brand header (desktop) / Top strip (mobile) */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:px-5 lg:pb-5 lg:pt-6">
          <BrandMark />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "收起导航菜单" : "展开导航菜单"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#171916]/12 bg-[#fbf9f3] text-[#171916] transition hover:border-[#171916]/25 lg:hidden"
          >
            {mobileMenuOpen ? <X size={17} aria-hidden /> : <Menu size={17} aria-hidden />}
          </button>
        </div>

        {/* Navigation links */}
        <nav
          aria-label="主导航"
          className={[
            mobileMenuOpen ? "flex" : "hidden",
            "flex-col gap-1 border-t border-[#171916]/8 px-3 py-3 lg:flex lg:flex-1 lg:border-t-0 lg:px-3.5 lg:py-2",
          ].join(" ")}
        >
          <p className="hidden px-3 pb-2 text-[10px] font-medium tracking-[0.22em] text-[#92978b] uppercase lg:block">
            Workspace
          </p>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={[
                  "group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition",
                  active
                    ? "bg-[#171916] font-medium text-[#faf7ef] shadow-[0_10px_24px_rgba(23,25,22,0.14)]"
                    : "text-[#484e45] hover:bg-[#eae4d4]/80 hover:text-[#171916]",
                ].join(" ")}
              >
                <Icon
                  size={16}
                  aria-hidden
                  className={active ? "text-[#d9e5d7]" : "text-[#6d7368] group-hover:text-[#171916]"}
                />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}

          {/* Reserved future Video Studio slot (/video) */}
          <div className="mt-2 border-t border-[#171916]/8 pt-2.5">
            <button
              type="button"
              onClick={() => setVideoNotice((show) => !show)}
              aria-expanded={videoNotice}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm text-[#6d7368] transition hover:bg-[#eae4d4]/60 hover:text-[#484e45]"
            >
              <Clapperboard size={16} aria-hidden className="shrink-0 text-[#92978b]" />
              <span className="flex-1">视频工作台</span>
              <span className="rounded-full border border-[#566c58]/25 bg-[#e7eee5] px-2 py-0.5 text-[10px] font-medium text-[#384a3a]">
                即将上线
              </span>
            </button>
            {videoNotice ? (
              <p className="mx-2 mt-1.5 rounded-xl border border-[#171916]/8 bg-[#fbf9f3]/90 px-3 py-2 text-[11px] leading-5 text-[#6d7368]">
                视频功能还在开发中，上线后会在这里开放。
              </p>
            ) : null}
          </div>
        </nav>

        {/* Account area: single CreditBadge & LogoutButton across desktop and mobile */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#171916]/8 bg-[#eee9dc]/65 px-4 py-2 lg:flex-col lg:items-stretch lg:gap-2.5 lg:bg-transparent lg:px-4 lg:py-4">
          <div className="min-w-0 flex-1 lg:flex-none">
            <CreditBadge balance={balance} compact />
          </div>
          <LogoutButton className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#171916]/12 bg-[#fbf9f3] px-3.5 py-2 text-xs font-medium text-[#484e45] transition hover:border-[#171916]/25 hover:text-[#171916] lg:w-full" />
        </div>
      </aside>

      <div
        className={
          immersive
            ? "flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden"
            : "flex min-w-0 flex-1 flex-col"
        }
      >
        {children}
      </div>
    </div>
  );
}
