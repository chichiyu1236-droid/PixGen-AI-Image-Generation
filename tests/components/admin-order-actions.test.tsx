import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminOrderActions, mapAdminOrderErrorMessage } from "@/components/admin-order-actions";

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("mapAdminOrderErrorMessage", () => {
  it("maps known admin order error codes to Chinese and never leaks unknown raw English errors", () => {
    expect(mapAdminOrderErrorMessage("forbidden")).toContain("无管理员权限");
    expect(mapAdminOrderErrorMessage("not_authenticated")).toContain("登录状态已失效");
    expect(mapAdminOrderErrorMessage("order_not_found")).toContain("未找到该订单");
    expect(mapAdminOrderErrorMessage("provider_query_failed")).toContain("向支付平台查询订单状态失败");
    expect(mapAdminOrderErrorMessage("fulfill_failed")).toContain("订单补发失败");
    expect(mapAdminOrderErrorMessage("provider_mismatch")).toContain("支付通道与当前配置不一致");
    expect(mapAdminOrderErrorMessage("provider_mismatch", "订单属于 stripe，当前激活的是 mock")).toBe(
      "订单属于 stripe，当前激活的是 mock",
    );
    expect(mapAdminOrderErrorMessage("unexpected_internal_code")).toBe("操作失败，请稍后重试。");
    expect(mapAdminOrderErrorMessage(undefined)).toBe("操作失败，请稍后重试。");
  });
});

describe("AdminOrderActions", () => {
  it("renders completed badge for paid orders without action buttons", () => {
    render(<AdminOrderActions order={{ id: "ord-paid", status: "paid" }} />);

    expect(screen.getByText("已完结")).toBeDefined();
    expect(screen.queryByRole("button", { name: "查询平台" })).toBeNull();
    expect(screen.queryByRole("button", { name: "手工补发" })).toBeNull();
  });

  it("displays localized Chinese error message instead of raw body.error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "provider_query_failed" }), { status: 502 })),
    );

    render(<AdminOrderActions order={{ id: "ord-1", status: "pending" }} />);
    fireEvent.click(screen.getByRole("button", { name: "查询平台" }));

    await waitFor(() => {
      expect(screen.getByText("向支付平台查询订单状态失败，请稍后重试。")).toBeDefined();
    });
    expect(screen.queryByText("provider_query_failed")).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("renders Chinese provider_mismatch detail when returned by server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "provider_mismatch",
              message: "订单属于 stripe，当前激活的是 mock",
            }),
            { status: 409 },
          ),
      ),
    );

    render(<AdminOrderActions order={{ id: "ord-2", status: "pending" }} />);
    fireEvent.click(screen.getByRole("button", { name: "查询平台" }));

    await waitFor(() => {
      expect(screen.getByText("订单属于 stripe，当前激活的是 mock")).toBeDefined();
    });
  });

  it("handles non-JSON error responses and unknown error codes without exposing English tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })),
    );

    render(<AdminOrderActions order={{ id: "ord-3", status: "flagged" }} />);
    fireEvent.click(screen.getByRole("button", { name: "手工补发" }));

    await waitFor(() => {
      expect(screen.getByText("操作失败，请稍后重试。")).toBeDefined();
    });
  });

  it("displays localized result feedback and refreshes the router on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: "fulfilled" }), { status: 200 })),
    );

    render(<AdminOrderActions order={{ id: "ord-4", status: "pending" }} />);
    fireEvent.click(screen.getByRole("button", { name: "手工补发" }));

    await waitFor(() => {
      expect(screen.getByText("已发货")).toBeDefined();
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
