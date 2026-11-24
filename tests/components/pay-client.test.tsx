import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PayClient, type PayOrderView } from "@/components/pay-client";

const { pushMock, refreshMock, qrToDataUrlMock, redirectExternalMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  qrToDataUrlMock: vi.fn(async () => "data:image/png;base64,fake-qr"),
  redirectExternalMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: refreshMock }),
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

vi.mock("qrcode", () => ({
  default: { toDataURL: qrToDataUrlMock },
}));

vi.mock("@/lib/billing/support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/support")>();
  return {
    ...actual,
    redirectToExternalUrl: redirectExternalMock,
  };
});

function makeOrder(overrides: Partial<PayOrderView> = {}): PayOrderView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "pending",
    payUrl: "mock://pay/wechat/11111111-1111-4111-8111-111111111111",
    channel: "wechat",
    provider: "mock",
    amountFen: 1990,
    credits: 100,
    packId: "std-month",
    kind: "plan",
    planSnapshot: {
      planId: "std-month",
      quotaPerTranche: 100,
      tranches: 1,
      periodDays: 30,
    },
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  qrToDataUrlMock.mockClear();
  redirectExternalMock.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PayClient", () => {
  it("preserves monthly card QR rendering and core cashier copy for non-Stripe orders", async () => {
    render(<PayClient order={makeOrder()} />);

    expect(screen.getByText("CHECKOUT")).toBeDefined();
    expect(screen.getByRole("heading", { name: "微信支付 · ¥19.90" })).toBeDefined();
    expect(screen.getByText("100 积分")).toBeDefined();
    expect(screen.getByText(/订单有效期剩余/)).toBeDefined();

    await waitFor(() => {
      expect(qrToDataUrlMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByAltText("微信支付支付二维码")).toBeDefined();
  });

  it("renders annual card 12-tranche installment copy for pending and paid states", () => {
    const yearlyOrder = makeOrder({
      packId: "std-year",
      amountFen: 19900,
      credits: 100,
      planSnapshot: {
        planId: "std-year",
        quotaPerTranche: 100,
        tranches: 12,
        periodDays: 365,
      },
    });

    const { rerender } = render(<PayClient order={yearlyOrder} />);

    expect(screen.getByText(/共/)).toBeDefined();
    expect(screen.getByText("12 期")).toBeDefined();
    expect(screen.getByText(/每 30 天发放/)).toBeDefined();
    expect(screen.getByText(/首期支付成功后立即到账/)).toBeDefined();

    rerender(<PayClient order={{ ...yearlyOrder, status: "paid" }} />);
    expect(screen.getByText("支付成功")).toBeDefined();
    expect(screen.getByText(/首期/)).toBeDefined();
    expect(screen.getByText(/共 12 期，每 30 天发放 100 积分/)).toBeDefined();
  });

  it("shows order id and clickable support email on failed and flagged orders", () => {
    const flaggedOrder = makeOrder({
      id: "22222222-2222-4222-8222-222222222222",
      status: "flagged",
    });

    render(<PayClient order={flaggedOrder} supportEmail="support@pixgen.example" />);

    expect(screen.getByRole("heading", { name: "订单异常" })).toBeDefined();
    expect(screen.getByText("22222222-2222-4222-8222-222222222222")).toBeDefined();
    const mailLink = screen.getByRole("link", { name: "support@pixgen.example" });
    expect(mailLink.getAttribute("href")).toContain("mailto:support@pixgen.example");
    expect(mailLink.getAttribute("href")).toContain("22222222-2222-4222-8222-222222222222");
  });

  it("skips QR generation for Stripe orders, shows hosted checkout button and canceled notice", () => {
    const stripeOrder = makeOrder({
      provider: "stripe",
      channel: "stripe",
      payUrl: "https://checkout.stripe.com/c/pay/cs_test_12345",
    });

    render(<PayClient order={stripeOrder} canceled />);

    expect(qrToDataUrlMock).not.toHaveBeenCalled();
    expect(screen.queryByAltText(/支付二维码/)).toBeNull();
    expect(screen.getByText(/Stripe 托管收银台/)).toBeDefined();
    expect(screen.getByText(/你已取消本次 Stripe 支付/)).toBeDefined();

    const payLink = screen.getByRole("link", { name: /前往 Stripe 收银台完成支付/ });
    expect(payLink.getAttribute("href")).toBe("https://checkout.stripe.com/c/pay/cs_test_12345");
  });

  it("blocks unsafe non-https payUrl on Stripe pending orders", () => {
    const unsafeStripeOrder = makeOrder({
      provider: "stripe",
      channel: "stripe",
      payUrl: "javascript:alert(1)",
    });

    render(<PayClient order={unsafeStripeOrder} />);

    expect(qrToDataUrlMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /前往 Stripe 收银台完成支付/ })).toBeNull();
    expect(screen.getByText(/当前托管支付链接不可用/)).toBeDefined();
  });

  it("immediately reconciles with stripe_session_id on mount for pending orders", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ order: { status: "paid" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const stripeOrder = makeOrder({
      id: "33333333-3333-4333-8333-333333333333",
      provider: "stripe",
      channel: "stripe",
      payUrl: "https://checkout.stripe.com/c/pay/cs_test_pending",
    });

    render(<PayClient order={stripeOrder} stripeSessionId="cs_test_pending_001" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/orders/33333333-3333-4333-8333-333333333333?stripe_session_id=cs_test_pending_001",
        { cache: "no-store" },
      );
    });

    await waitFor(() => {
      expect(screen.getByText("支付成功")).toBeDefined();
    });
    expect(screen.getByText("100 积分")).toBeDefined();
  });

  it("recovers near-expiry Stripe orders when returning with stripe_session_id", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ order: { status: "paid" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const expiredStripeOrder = makeOrder({
      id: "44444444-4444-4444-8444-444444444444",
      status: "expired",
      provider: "stripe",
      channel: "stripe",
      payUrl: "https://checkout.stripe.com/c/pay/cs_test_late",
      expiresAt: new Date(Date.now() - 5 * 1000).toISOString(),
    });

    render(<PayClient order={expiredStripeOrder} stripeSessionId="cs_test_late_999" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/orders/44444444-4444-4444-8444-444444444444?stripe_session_id=cs_test_late_999",
        { cache: "no-store" },
      );
    });

    await waitFor(() => {
      expect(screen.getByText("支付成功")).toBeDefined();
    });
  });

  it("allows manual Stripe payment recheck on expired orders when initial check is not yet paid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ order: { status: "expired" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ order: { status: "paid" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const expiredStripeOrder = makeOrder({
      id: "77777777-7777-4777-8777-777777777777",
      status: "expired",
      provider: "stripe",
      channel: "stripe",
      payUrl: "https://checkout.stripe.com/c/pay/cs_test_retry",
      expiresAt: new Date(Date.now() - 10 * 1000).toISOString(),
    });

    render(<PayClient order={expiredStripeOrder} stripeSessionId="cs_test_retry_001" />);

    const recheckBtn = await screen.findByRole("button", { name: /重新核验支付状态/ });
    await waitFor(() => {
      expect(recheckBtn.hasAttribute("disabled")).toBe(false);
    });

    fireEvent.click(recheckBtn);

    await waitFor(() => {
      expect(screen.getByText("支付成功")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("redirects externally on repurchase when checkout returns a safe https redirectUrl and blocks unsafe URLs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderId: "55555555-5555-4555-8555-555555555555",
          redirectUrl: "https://checkout.stripe.com/c/pay/cs_test_new",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderId: "66666666-6666-4666-8666-666666666666",
          redirectUrl: "javascript:alert(1)",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const expiredStripeOrder = makeOrder({
      status: "expired",
      provider: "stripe",
      channel: "stripe",
      packId: "pro-year",
    });

    render(<PayClient order={expiredStripeOrder} />);

    const repurchaseBtn = screen.getByRole("button", { name: /重新下单/ });
    fireEvent.click(repurchaseBtn);

    await waitFor(() => {
      expect(redirectExternalMock).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_new");
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "pro-year", channel: "stripe" }),
    });
    expect(pushMock).not.toHaveBeenCalled();

    // Second click returns an unsafe javascript: redirectUrl -> must NOT call external redirect, fallback to /pay/[orderId].
    fireEvent.click(repurchaseBtn);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/pay/66666666-6666-4666-8666-666666666666");
    });
    expect(redirectExternalMock).toHaveBeenCalledTimes(1);
  });
});
