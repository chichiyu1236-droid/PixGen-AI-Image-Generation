import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppShell } from "@/components/app-shell";
import { EMPTY_BALANCE, type CreditBalance } from "@/lib/auth/balance";
import {
  buildSupportMailto,
  getSupportEmail,
  isSafeHttpsUrl,
} from "@/lib/billing/support";
import BillingPage from "@/app/billing/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

const {
  redirectMock,
  getUserMock,
  fromMock,
  ensureUserProfileMock,
  getCreditBalanceMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  ensureUserProfileMock: vi.fn(async () => undefined),
  getCreditBalanceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  usePathname: () => "/billing",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/auth-button", () => ({
  LogoutButton: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      退出登录
    </button>
  ),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ __admin: true })),
}));

vi.mock("@/lib/auth/ensure-profile", () => ({
  ensureUserProfile: ensureUserProfileMock,
}));

vi.mock("@/lib/auth/balance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/balance")>();
  return {
    ...actual,
    getCreditBalance: getCreditBalanceMock,
  };
});

function createQueryStub(result: { data: unknown; error?: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: result.data, error: result.error ?? null })),
    maybeSingle: vi.fn(async () => ({ data: result.data, error: result.error ?? null })),
  };
  return chain;
}

const originalSupportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

beforeEach(() => {
  redirectMock.mockClear();
  getUserMock.mockReset();
  fromMock.mockReset();
  ensureUserProfileMock.mockClear();
  getCreditBalanceMock.mockReset();
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@pixgen.example";
});

afterEach(() => {
  cleanup();
  if (originalSupportEmail === undefined) {
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  } else {
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = originalSupportEmail;
  }
});

describe("support helpers", () => {
  it("validates support emails and strictly enforces https for external checkout redirects", () => {
    expect(getSupportEmail()).toBe("support@pixgen.example");
    const mailto = buildSupportMailto("support@pixgen.example", { subject: "PixGen 退款" });
    expect(mailto).toContain("mailto:support@pixgen.example?subject=");
    expect(mailto).not.toContain("+");

    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "javascript:alert(1)";
    expect(getSupportEmail()).toBe("");
    expect(buildSupportMailto("not-an-email")).toBe("");

    expect(isSafeHttpsUrl("https://checkout.stripe.com/c/pay/cs_test_1")).toBe(true);
    expect(isSafeHttpsUrl("http://checkout.stripe.com/c/pay/cs_test_1")).toBe(false);
    expect(isSafeHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpsUrl("data:text/html,<h1>x</h1>")).toBe(false);
    expect(isSafeHttpsUrl("")).toBe(false);
  });
});

describe("Legal static pages (/terms and /privacy)", () => {
  it("renders key service, CNY single-payment, refund, UGC compliance sections and support email on /terms", () => {
    render(<TermsPage />);

    expect(screen.getByRole("heading", { name: "服务条款与退款规则" })).toBeDefined();
    expect(screen.getByText(/单次手动付款模式/)).toBeDefined();
    expect(screen.getByText(/不会开通任何形式的自动续费或周期免密代扣/)).toBeDefined();
    expect(screen.getByText(/标准年卡/)).toBeDefined();
    expect(screen.getByText(/¥199\.00/)).toBeDefined();
    expect(screen.getByText(/数字商品退款与争议处理政策/)).toBeDefined();
    expect(screen.getByText(/用户生成内容（UGC）合规责任/)).toBeDefined();

    const mailLink = screen.getByRole("link", { name: "support@pixgen.example" });
    expect(mailLink.getAttribute("href")).toContain("mailto:support@pixgen.example");
    expect(screen.getByRole("link", { name: "阅读隐私政策" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "查看会员方案" }).getAttribute("href")).toBe("/upgrade");
  });

  it("renders data collection, Stripe non-storage of cards, user rights and support email on /privacy", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { name: "隐私政策" })).toBeDefined();
    expect(screen.getByText(/不留存银行卡号与支付密码/)).toBeDefined();
    expect(screen.getByText(/绝不收集、不经手也不存储/)).toBeDefined();
    expect(screen.getByText(/行级安全策略（RLS）/)).toBeDefined();
    expect(screen.getByText(/删除个人账号与作品数据/)).toBeDefined();

    const mailLink = screen.getByRole("link", { name: "support@pixgen.example" });
    expect(mailLink.getAttribute("href")).toContain("mailto:support@pixgen.example");
    expect(screen.getByRole("link", { name: "阅读服务条款与退款规则" }).getAttribute("href")).toBe("/terms");
  });

  it("degrades gracefully when NEXT_PUBLIC_SUPPORT_EMAIL is unset", () => {
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

    render(<TermsPage />);
    expect(screen.queryByRole("link", { name: /@/ })).toBeNull();
    expect(screen.getByText(/保留注册邮箱与订单编号/)).toBeDefined();
  });
});

describe("AppShell navigation", () => {
  it("mounts /billing navigation item and legal footer links", () => {
    render(
      <AppShell balance={EMPTY_BALANCE}>
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "账单与明细" }).getAttribute("href")).toBe("/billing");
    expect(screen.getByRole("link", { name: "服务条款" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "隐私政策" }).getAttribute("href")).toBe("/privacy");
  });
});

describe("BillingPage (/billing)", () => {
  it("redirects unauthenticated visitors to /login?next=/billing", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });

    await expect(BillingPage()).rejects.toThrow("NEXT_REDIRECT:/login?next=/billing");
    expect(redirectMock).toHaveBeenCalledWith("/login?next=/billing");
  });

  it("renders empty states and free-tier dual-pool summary when user has no orders or events", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "user-empty", email: "free@example.com" } },
    });
    getCreditBalanceMock.mockResolvedValueOnce({
      permanentCredits: 5,
      subCredits: 0,
      subCreditsExpiresAt: null,
      planId: null,
      paidUntil: null,
      membershipActive: false,
      totalCredits: 5,
    } satisfies CreditBalance);

    fromMock.mockImplementation((table: string) => {
      if (table === "memberships") return createQueryStub({ data: null });
      return createQueryStub({ data: [] });
    });

    const page = await BillingPage();
    render(page);

    expect(ensureUserProfileMock).toHaveBeenCalledTimes(1);
    expect(getCreditBalanceMock).toHaveBeenCalledWith({ __admin: true }, "user-empty");
    expect(screen.getByRole("heading", { name: "账单与积分明细" })).toBeDefined();
    expect(screen.getByText("免费体验版")).toBeDefined();
    expect(screen.getByText("暂无订单记录")).toBeDefined();
    expect(screen.getByText("暂无积分变动记录")).toBeDefined();
    expect(screen.getByRole("link", { name: "support@pixgen.example" })).toBeDefined();
  });

  it("renders active annual membership, orders with lazy expiry handling, Stripe channel label, and all 6 credit event types", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "user-pro", email: "member@example.com" } },
    });
    getCreditBalanceMock.mockResolvedValueOnce({
      permanentCredits: 12,
      subCredits: 95,
      subCreditsExpiresAt: "2026-12-24T00:00:00.000Z",
      planId: "std-year",
      paidUntil: "2027-11-24T00:00:00.000Z",
      membershipActive: true,
      totalCredits: 107,
    } satisfies CreditBalance);

    const futureIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pastIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    fromMock.mockImplementation((table: string) => {
      if (table === "memberships") {
        return createQueryStub({
          data: {
            plan_id: "std-year",
            paid_until: "2027-11-24T00:00:00.000Z",
            next_grant_at: "2026-12-24T00:00:00.000Z",
            pending_tranches: [100, 100, 100],
          },
        });
      }

      if (table === "orders") {
        return createQueryStub({
          data: [
            {
              id: "ord-pending-active",
              pack_id: "pro-month",
              credits: 300,
              amount_fen: 4990,
              status: "pending",
              channel: "stripe",
              provider: "stripe",
              kind: "plan",
              plan_snapshot: { planId: "pro-month", quotaPerTranche: 300, tranches: 1, periodDays: 30 },
              expires_at: futureIso,
              created_at: "2026-11-24T10:00:00.000Z",
              paid_at: null,
            },
            {
              id: "ord-pending-stale",
              pack_id: "std-month",
              credits: 100,
              amount_fen: 1990,
              status: "pending",
              channel: "wechat",
              provider: "mock",
              kind: "plan",
              plan_snapshot: { planId: "std-month", quotaPerTranche: 100, tranches: 1, periodDays: 30 },
              expires_at: pastIso,
              created_at: "2026-11-23T10:00:00.000Z",
              paid_at: null,
            },
            {
              id: "ord-paid-stripe",
              pack_id: "std-year",
              credits: 100,
              amount_fen: 19900,
              status: "paid",
              channel: "stripe",
              provider: "stripe",
              kind: "plan",
              plan_snapshot: { planId: "std-year", quotaPerTranche: 100, tranches: 12, periodDays: 365 },
              expires_at: pastIso,
              created_at: "2026-11-20T10:00:00.000Z",
              paid_at: "2026-11-20T10:01:00.000Z",
            },
            {
              id: "ord-legacy-pack",
              pack_id: "starter-20",
              credits: 20,
              amount_fen: 990,
              status: "paid",
              channel: "alipay",
              provider: "lantu",
              kind: "pack",
              plan_snapshot: null,
              expires_at: pastIso,
              created_at: "2026-10-01T10:00:00.000Z",
              paid_at: "2026-10-01T10:01:00.000Z",
            },
          ],
        });
      }

      return createQueryStub({
        data: [
          {
            id: "evt-1",
            type: "membership_grant",
            amount: 100,
            reason: "Membership std-year order ord-paid-stripe first tranche",
            created_at: "2026-11-20T10:01:00.000Z",
          },
          {
            id: "evt-2",
            type: "generation_charge",
            amount: -1,
            reason: "Image generation (subscription pool)",
            created_at: "2026-11-20T11:00:00.000Z",
          },
          {
            id: "evt-3",
            type: "membership_expire",
            amount: -10,
            reason: "Subscription credits expired",
            created_at: "2026-11-19T00:00:00.000Z",
          },
          {
            id: "evt-4",
            type: "purchase",
            amount: 20,
            reason: "Credit pack purchase",
            created_at: "2026-10-01T10:01:00.000Z",
          },
          {
            id: "evt-5",
            type: "admin_adjustment",
            amount: 5,
            reason: "人工补偿",
            created_at: "2026-09-15T10:00:00.000Z",
          },
          {
            id: "evt-6",
            type: "signup_bonus",
            amount: 5,
            reason: "Welcome credits",
            created_at: "2026-09-01T10:00:00.000Z",
          },
        ],
      });
    });

    const page = await BillingPage();
    render(page);

    expect(screen.getAllByText("标准年卡").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/年卡待发剩余 3 期/)).toBeDefined();
    expect(screen.getByText("95")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();

    // Only the unexpired pending order should offer "继续支付"; the stale pending order flips to "已过期".
    const continueLinks = screen.getAllByRole("link", { name: "继续支付" });
    expect(continueLinks).toHaveLength(1);
    expect(continueLinks[0].getAttribute("href")).toBe("/pay/ord-pending-active");
    expect(screen.getByText("已过期")).toBeDefined();
    expect(screen.getAllByText("Stripe 在线支付").length).toBe(2);
    expect(screen.getByText(/历史积分包 \(starter-20\)/)).toBeDefined();

    // All 6 Chinese credit event labels appear.
    expect(screen.getByText("会员额度发放")).toBeDefined();
    expect(screen.getByText("生图消耗")).toBeDefined();
    expect(screen.getByText("订阅额度清零")).toBeDefined();
    expect(screen.getByText("积分包充值")).toBeDefined();
    expect(screen.getByText("人工调整")).toBeDefined();
    expect(screen.getByText("注册赠送")).toBeDefined();
    expect(screen.getByText("图像生成扣减（订阅池）")).toBeDefined();
    expect(screen.getByText("订阅周期到期自动清零")).toBeDefined();
  });

  it("renders expired membership summary and query error notices when orders or events fail to load", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "user-expired", email: "expired@example.com" } },
    });
    getCreditBalanceMock.mockResolvedValueOnce({
      permanentCredits: 3,
      subCredits: 0,
      subCreditsExpiresAt: "2026-10-01T00:00:00.000Z",
      planId: "std-month",
      paidUntil: "2026-10-01T00:00:00.000Z",
      membershipActive: false,
      totalCredits: 3,
    } satisfies CreditBalance);

    fromMock.mockImplementation((table: string) => {
      if (table === "memberships") {
        return createQueryStub({ data: null });
      }
      return createQueryStub({ data: null, error: { message: "db_timeout" } });
    });

    const page = await BillingPage();
    render(page);

    expect(screen.getAllByText("会员已过期").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/到期，续费即重新激活/)).toBeDefined();
    expect(screen.getByText("历史订单暂时加载失败，请刷新页面重试。")).toBeDefined();
    expect(screen.getByText("积分变动流水暂时加载失败，请刷新页面重试。")).toBeDefined();
  });
});
