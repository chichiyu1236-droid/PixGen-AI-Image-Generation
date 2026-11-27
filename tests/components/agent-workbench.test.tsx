import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentWorkbench, mapAgentErrorMessage } from "@/components/agent-workbench";

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

describe("mapAgentErrorMessage", () => {
  it("maps known backend and client error codes to friendly Chinese without leaking raw codes", () => {
    expect(mapAgentErrorMessage("agent_turn_failed")).toBe("AI 对话服务暂时繁忙，请稍后重试（未出图不会扣积分）。");
    expect(mapAgentErrorMessage("agent_provider_unavailable")).toBe("AI 对话服务暂未就绪，请稍后重试。");
    expect(mapAgentErrorMessage("message_store_failed")).toBe("对话记录保存失败，请稍后重试。");
    expect(mapAgentErrorMessage("session_not_found")).toBe("当前对话不存在或已失效，请新建对话重试。");
    expect(mapAgentErrorMessage("not_authenticated")).toBe("登录状态已失效，请重新登录。");
    expect(mapAgentErrorMessage("invalid_request")).toBe("消息内容不符合要求，请调整后重试。");
    expect(mapAgentErrorMessage("insufficient_credits")).toContain("积分");
    expect(mapAgentErrorMessage("network_error")).toContain("网络");

    const unknown = mapAgentErrorMessage("some_internal_backend_error_500");
    expect(unknown).not.toContain("some_internal_backend_error_500");
    expect(unknown).toBe("发送失败，请稍后重试。");
    expect(mapAgentErrorMessage(null)).toBe("发送失败，请稍后重试。");
    expect(mapAgentErrorMessage(undefined)).toBe("发送失败，请稍后重试。");
  });
});

describe("AgentWorkbench error handling and orphan bubble cleanup", () => {
  it("maps agent_turn_failed to friendly Chinese, removes the optimistic bubble, and restores empty input", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/agent/sessions" && method === "GET") {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
      }
      if (url === "/api/agent/sessions" && method === "POST") {
        return new Response(
          JSON.stringify({ session: { id: "sess-fail-1", title: null, created_at: "2026-11-27T00:00:00Z" } }),
          { status: 200 },
        );
      }
      if (url === "/api/agent/sessions/sess-fail-1/messages" && method === "POST") {
        return new Response(
          JSON.stringify({ error: "agent_turn_failed", userMessageRemoved: true }),
          { status: 502 },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    render(<AgentWorkbench credits={10} membershipActive />);

    const textarea = screen.getByPlaceholderText("不知道想要什么也没关系，随便说一句…") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByText("AI 对话服务暂时繁忙，请稍后重试（未出图不会扣积分）。")).toBeDefined();
    });

    expect(screen.queryByText(/agent_turn_failed/)).toBeNull();
    // Optimistic bubble removed; welcome empty state restored; input refilled.
    expect(screen.queryByText("你好", { selector: "div" })).toBeNull();
    expect(textarea.value).toBe("你好");
  });

  it("does not overwrite newly typed input when rolling back a failed send", async () => {
    let rejectMessages!: (value: Response) => void;
    const pendingMessages = new Promise<Response>((resolve) => {
      rejectMessages = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/agent/sessions" && method === "GET") {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
      }
      if (url === "/api/agent/sessions" && method === "POST") {
        return new Response(JSON.stringify({ session: { id: "sess-fail-2" } }), { status: 200 });
      }
      if (url === "/api/agent/sessions/sess-fail-2/messages" && method === "POST") {
        return pendingMessages;
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    render(<AgentWorkbench credits={10} membershipActive />);

    const textarea = screen.getByPlaceholderText("不知道想要什么也没关系，随便说一句…") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "第一句" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByText("第一句")).toBeDefined();
    });

    fireEvent.change(textarea, { target: { value: "用户改写的新内容" } });

    rejectMessages(
      new Response(JSON.stringify({ error: "agent_turn_failed", userMessageRemoved: true }), { status: 502 }),
    );

    await waitFor(() => {
      expect(screen.getByText("AI 对话服务暂时繁忙，请稍后重试（未出图不会扣积分）。")).toBeDefined();
    });

    expect(screen.queryByText("第一句")).toBeNull();
    expect(textarea.value).toBe("用户改写的新内容");
  });

  it("keeps the user bubble and leaves input empty when backend reports userMessageRemoved: false", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/agent/sessions" && method === "GET") {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
      }
      if (url === "/api/agent/sessions" && method === "POST") {
        return new Response(JSON.stringify({ session: { id: "sess-fail-3" } }), { status: 200 });
      }
      if (url === "/api/agent/sessions/sess-fail-3/messages" && method === "POST") {
        return new Response(
          JSON.stringify({ error: "agent_turn_failed", userMessageRemoved: false }),
          { status: 502 },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    render(<AgentWorkbench credits={10} membershipActive />);

    const textarea = screen.getByPlaceholderText("不知道想要什么也没关系，随便说一句…") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "做一张已经出图的请求" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByText("AI 对话服务暂时繁忙，请稍后重试（未出图不会扣积分）。")).toBeDefined();
    });

    expect(screen.getByText("做一张已经出图的请求")).toBeDefined();
    expect(textarea.value).toBe("");
  });

  it("rolls back optimistic bubble and restores input when fetch throws a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/agent/sessions" && method === "GET") {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200 });
      }
      if (url === "/api/agent/sessions" && method === "POST") {
        return new Response(JSON.stringify({ session: { id: "sess-net-err" } }), { status: 200 });
      }

      throw new TypeError("Failed to fetch");
    });

    render(<AgentWorkbench credits={10} membershipActive />);

    const textarea = screen.getByPlaceholderText("不知道想要什么也没关系，随便说一句…") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "网络中断测试" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByText("网络连接异常，请检查网络后重试。")).toBeDefined();
    });

    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.queryByText("网络中断测试", { selector: "div" })).toBeNull();
    expect(textarea.value).toBe("网络中断测试");
  });
});
