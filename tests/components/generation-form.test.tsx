import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
