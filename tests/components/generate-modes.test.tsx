import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GenerateModes } from "@/components/generate-modes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function renderModes(membershipActive: boolean) {
  return render(
    <GenerateModes
      initialMode="classic"
      membershipActive={membershipActive}
      classicForm={<div>classic-pane</div>}
      agentWorkbench={<div>agent-pane</div>}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("GenerateModes", () => {
  it("shows the locked member-only badge for non-members", () => {
    renderModes(false);

    expect(screen.getByText("会员专属")).toBeDefined();
  });

  it("does not show the lock badge for members", () => {
    renderModes(true);

    expect(screen.queryByText("会员专属")).toBeNull();
  });

  it("opens the upgrade dialog instead of entering agent mode for non-members", () => {
    renderModes(false);

    fireEvent.click(screen.getByRole("button", { name: /Agent 对话/ }));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Agent 对话是会员专属")).toBeDefined();
    expect(screen.getByText("classic-pane")).toBeDefined();
    // The agent pane stays in the DOM but hidden (CSS), and the dialog blocks agent entry.
    expect(screen.getByText("agent-pane").parentElement?.className).toContain("hidden");
  });

  it("lets members switch into agent mode without any dialog", () => {
    renderModes(true);

    fireEvent.click(screen.getByRole("button", { name: /Agent 对话/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("agent-pane")).toBeDefined();
  });

  it("links the upgrade dialog to the pricing page and closes on demand", () => {
    renderModes(false);

    fireEvent.click(screen.getByRole("button", { name: /Agent 对话/ }));
    expect(screen.getByRole("link", { name: "查看会员方案" }).getAttribute("href")).toBe("/upgrade");

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
