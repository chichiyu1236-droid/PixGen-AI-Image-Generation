import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GenerationForm } from "@/components/generation-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill: _fill, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={rest.alt ?? ""} {...rest} />;
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GenerationForm visual controls", () => {
  it("replaces native selects with visual cards while preserving form field contracts", () => {
    const { container } = render(<GenerationForm credits={5} />);

    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "告诉我们你想要什么" })).toBeDefined();
    expect(screen.getByPlaceholderText("例如：一瓶高端护肤精华，透明玻璃瓶，银色瓶盖")).toBeDefined();
    expect(screen.getByText("参考与补充")).toBeDefined();
    expect(screen.getByRole("button", { name: "生成图片" })).toBeDefined();

    // Selecting visual ratio card updates the hidden aspectRatio input sent to /api/generate
    fireEvent.click(screen.getByRole("radio", { name: /4:5/ }));
    const ratioInput = container.querySelector<HTMLInputElement>('input[name="aspectRatio"]');
    expect(ratioInput?.value).toBe("portrait");

    fireEvent.click(screen.getByRole("radio", { name: /奢华商业/ }));
    const styleInput = container.querySelector<HTMLInputElement>('input[name="style"]');
    expect(styleInput?.value).toBe("luxury_commercial");
  });

  it("retries loading the generated artwork with cache-busting query param after an initial image error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/health/image-provider") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url === "/api/generate") {
        return new Response(
          JSON.stringify({
            generation: {
              id: "gen-retry-1",
              image_url: "https://cdn.example.test/art-1.png",
              final_prompt: "minimal bottle",
              feedback: null,
            },
            remainingCredits: { totalCredits: 4 },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    render(<GenerationForm credits={5} />);

    fireEvent.change(screen.getByPlaceholderText("例如：一瓶高端护肤精华，透明玻璃瓶，银色瓶盖"), {
      target: { value: "极简护肤品主图" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    const firstImg = await waitFor(() => screen.getByAltText("生成图片结果") as HTMLImageElement);
    expect(firstImg.getAttribute("src")).toBe("https://cdn.example.test/art-1.png");

    vi.useFakeTimers();
    fireEvent.error(firstImg);

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const retriedImg = screen.getByAltText("生成图片结果") as HTMLImageElement;
    expect(retriedImg.getAttribute("src")).toBe("https://cdn.example.test/art-1.png?_retry=1");
  });
});
