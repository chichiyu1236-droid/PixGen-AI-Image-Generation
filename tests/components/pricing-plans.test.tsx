import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PricingPlans } from "@/components/pricing-plans";
import { membershipPlans } from "@/lib/billing/plans";

const { pushMock, redirectExternalMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  redirectExternalMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill: _fill, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={rest.alt ?? ""} {...rest} />;
  },
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

vi.mock("@/lib/billing/support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/support")>();
  return {
    ...actual,
    redirectToExternalUrl: redirectExternalMock,
  };
});

beforeEach(() => {
  pushMock.mockReset();
  redirectExternalMock.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PricingPlans", () => {
  it("submits selected aggregator channel and navigates to /pay/[orderId] when provider is mock", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ orderId: "order-mock-1", reused: false }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PricingPlans
        plans={membershipPlans.map((plan) => ({ ...plan }))}
        billingProvider="mock"
        supportEmail="support@pixgen.example"
      />,
    );

    expect(screen.getByRole("button", { name: "微信支付" })).toBeDefined();
    expect(screen.getByRole("button", { name: "支付宝" })).toBeDefined();
    expect(screen.getByRole("link", { name: "服务条款与退款规则" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "隐私政策" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "support@pixgen.example" }).getAttribute("href")).toContain(
      "mailto:support@pixgen.example",
    );

    fireEvent.click(screen.getByRole("button", { name: "支付宝" }));
    const buyButtons = screen.getAllByRole("button", { name: "立即开通" });
    fireEvent.click(buyButtons[0]);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/pay/order-mock-1");
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "std-month", channel: "alipay" }),
    });
    expect(redirectExternalMock).not.toHaveBeenCalled();
  });

  it("submits channel=stripe and redirects externally when Stripe checkout returns a safe https redirectUrl", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        orderId: "order-stripe-1",
        reused: false,
        redirectUrl: "https://checkout.stripe.com/c/pay/cs_test_abc",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PricingPlans
        plans={membershipPlans.map((plan) => ({ ...plan }))}
        billingProvider="stripe"
      />,
    );

    expect(screen.queryByRole("button", { name: "微信支付" })).toBeNull();
    expect(screen.queryByRole("button", { name: "支付宝" })).toBeNull();
    expect(screen.getByText(/Stripe 安全收银台/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "年付省 17%" }));
    expect(screen.getByText("¥199.00")).toBeDefined();
    expect(screen.getByText("¥499.00")).toBeDefined();

    const buyButtons = screen.getAllByRole("button", { name: "立即开通" });
    fireEvent.click(buyButtons[1]);

    await waitFor(() => {
      expect(redirectExternalMock).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_abc");
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "pro-year", channel: "stripe" }),
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe redirectUrl protocols and falls back to /pay/[orderId]", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderId: "order-unsafe-js",
          redirectUrl: "javascript:alert(1)",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderId: "order-unsafe-http",
          redirectUrl: "http://evil.example/checkout",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PricingPlans
        plans={membershipPlans.map((plan) => ({ ...plan }))}
        billingProvider="stripe"
      />,
    );

    const firstBuy = screen.getAllByRole("button", { name: "立即开通" })[0];
    fireEvent.click(firstBuy);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/pay/order-unsafe-js");
    });
    expect(redirectExternalMock).not.toHaveBeenCalled();

    fireEvent.click(firstBuy);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/pay/order-unsafe-http");
    });
    expect(redirectExternalMock).not.toHaveBeenCalled();
  });

  it("displays user-facing error copy when checkout returns an error", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "too_many_pending_orders" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PricingPlans
        plans={membershipPlans.map((plan) => ({ ...plan }))}
        billingProvider="stripe"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "立即开通" })[0]);

    await waitFor(() => {
      expect(screen.getByText("你有太多未完成的订单，请先完成或等待它们过期。")).toBeDefined();
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(redirectExternalMock).not.toHaveBeenCalled();
  });
});
