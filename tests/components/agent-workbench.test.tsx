import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentWorkbench } from "@/components/agent-workbench";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill: _fill, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={rest.alt ?? ""} {...rest} />;
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AgentWorkbench history switcher", () => {
  it("silently degrades to empty session list when GET /api/agent/sessions fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network_down"));

    render(<AgentWorkbench credits={10} membershipActive />);

    expect(screen.getByText("DIALOGUE")).toBeDefined();
    expect(screen.getByText("和 Agent 聊")).toBeDefined();
    expect(screen.getByText("聊出来的图会出现在这里")).toBeDefined();

    // Expanding history drawer should show empty hint without rendering an error banner
    fireEvent.click(screen.getByRole("button", { name: /历史对话/ }));
    await waitFor(() => {
      expect(screen.getByText(/暂无历史会话/)).toBeDefined();
    });
    expect(screen.queryByText(/失败/)).toBeNull();
  });

  it("lists historical sessions and switches session messages and canvas on click", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/agent/sessions") {
        return new Response(
          JSON.stringify({
            sessions: [
              { id: "sess-1", title: "香氛海报草稿", last_message_at: "2026-11-23T10:00:00Z" },
              { id: "sess-2", title: "茶具主图迭代", last_message_at: "2026-11-22T09:00:00Z" },
            ],
          }),
          { status: 200 },
        );
      }

      if (url === "/api/agent/sessions/sess-1") {
        return new Response(
          JSON.stringify({
            session: { id: "sess-1", title: "香氛海报草稿" },
            messages: [{ id: "m1", role: "user", content: "做一个香氛主图", created_at: "2026-11-23T10:00:00Z" }],
            canvas: [],
          }),
          { status: 200 },
        );
      }

      if (url === "/api/agent/sessions/sess-2") {
        return new Response(
          JSON.stringify({
            session: { id: "sess-2", title: "茶具主图迭代" },
            messages: [{ id: "m2", role: "user", content: "东方青瓷茶具静物", created_at: "2026-11-22T09:00:00Z" }],
            canvas: [
              {
                generationId: "gen-2",
                imageUrl: "/images/showcase-perfume.webp",
                origin: "agent",
                version: "图 1 · v1",
                basedOn: null,
                promptSummary: "tea set",
                createdAt: "2026-11-22T09:01:00Z",
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    render(<AgentWorkbench credits={20} membershipActive />);

    await waitFor(() => {
      expect(screen.getByText("做一个香氛主图")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /历史对话/ }));
    await waitFor(() => {
      expect(screen.getByText("茶具主图迭代")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /茶具主图迭代/ }));

    await waitFor(() => {
      expect(screen.getByText("东方青瓷茶具静物")).toBeDefined();
      expect(screen.getByAltText("画布作品 图 1 · v1")).toBeDefined();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/agent/sessions/sess-2", { cache: "no-store" });
  });
});
