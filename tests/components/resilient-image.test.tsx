import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  buildRetryImageUrl,
  getSafeOriginalImageUrl,
  ResilientImage,
} from "@/components/resilient-image";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ResilientImage URL helpers", () => {
  it("appends or replaces _retry query param on http/https and relative URLs while leaving blob/data untouched", () => {
    expect(buildRetryImageUrl("https://cdn.example.test/a.png", 0)).toBe("https://cdn.example.test/a.png");
    expect(buildRetryImageUrl("https://cdn.example.test/a.png", 1)).toBe("https://cdn.example.test/a.png?_retry=1");
    expect(buildRetryImageUrl("https://cdn.example.test/a.png?token=xyz&_retry=1", 2)).toBe(
      "https://cdn.example.test/a.png?token=xyz&_retry=2",
    );
    expect(buildRetryImageUrl("/images/sample.webp?v=1#frag", 3)).toBe("/images/sample.webp?v=1&_retry=3#frag");
    expect(buildRetryImageUrl("blob:https://example.test/1234", 1)).toBe("blob:https://example.test/1234");
    expect(buildRetryImageUrl("data:image/png;base64,AAAA", 2)).toBe("data:image/png;base64,AAAA");
  });

  it("permits only safe https, http, and single-slash relative URLs for original links", () => {
    expect(getSafeOriginalImageUrl("https://cdn.example.test/a.png")).toBe("https://cdn.example.test/a.png");
    expect(getSafeOriginalImageUrl("http://localhost:3000/a.png")).toBe("http://localhost:3000/a.png");
    expect(getSafeOriginalImageUrl("/images/a.png")).toBe("/images/a.png");
    expect(getSafeOriginalImageUrl("//evil.example.test/a.png")).toBeNull();
    expect(getSafeOriginalImageUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeOriginalImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(getSafeOriginalImageUrl("blob:https://example.test/1234")).toBeNull();
  });
});

describe("ResilientImage component", () => {
  it("automatically retries with _retry=1 after initial error and recovers on subsequent load", async () => {
    vi.useFakeTimers();
    const onLoad = vi.fn();

    render(<ResilientImage src="https://cdn.example.test/art.png" alt="成片预览" onLoad={onLoad} />);

    const initialImg = screen.getByAltText("成片预览") as HTMLImageElement;
    expect(initialImg.getAttribute("src")).toBe("https://cdn.example.test/art.png");

    // Trigger first load error: broken img unmounts while waiting for backoff, restrained retry status is shown.
    fireEvent.error(initialImg);
    expect(screen.queryByAltText("成片预览")).toBeNull();
    expect(screen.getByText(/正在重新加载图片/)).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(599);
    });
    expect(screen.queryByAltText("成片预览")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const retriedImg = screen.getByAltText("成片预览") as HTMLImageElement;
    expect(retriedImg.getAttribute("src")).toBe("https://cdn.example.test/art.png?_retry=1");

    fireEvent.load(retriedImg);
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/正在重新加载图片/)).toBeNull();
    expect(screen.queryByText("图片加载失败")).toBeNull();
  });

  it("shows manual reload button and safe original link after exhausting 3 automatic retries, and recovers on click", async () => {
    vi.useFakeTimers();
    const onImageClick = vi.fn();

    render(
      <ResilientImage
        src="https://cdn.example.test/flaky.png"
        alt="画布主图"
        onImageClick={onImageClick}
        imageClickLabel="放大查看"
      />,
    );

    // Attempt 0 fails -> 600ms backoff -> attempt 1
    fireEvent.error(screen.getByAltText("画布主图"));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByAltText("画布主图").getAttribute("src")).toBe("https://cdn.example.test/flaky.png?_retry=1");

    // Attempt 1 fails -> 1500ms backoff -> attempt 2
    fireEvent.error(screen.getByAltText("画布主图"));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByAltText("画布主图").getAttribute("src")).toBe("https://cdn.example.test/flaky.png?_retry=2");

    // Attempt 2 fails -> 3000ms backoff -> attempt 3
    fireEvent.error(screen.getByAltText("画布主图"));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByAltText("画布主图").getAttribute("src")).toBe("https://cdn.example.test/flaky.png?_retry=3");

    // Attempt 3 fails -> exhausted -> shows manual reload button and safe original link
    fireEvent.error(screen.getByAltText("画布主图"));
    expect(screen.getByText("图片加载失败")).toBeDefined();

    const openLink = screen.getByRole("link", { name: /新窗口打开原图/ }) as HTMLAnchorElement;
    expect(openLink.getAttribute("href")).toBe("https://cdn.example.test/flaky.png");

    const reloadButton = screen.getByRole("button", { name: /重新加载图片/ });
    fireEvent.click(reloadButton);

    // Clicking manual reload must not bubble into outer image click handler
    expect(onImageClick).not.toHaveBeenCalled();

    const reloadedImg = screen.getByAltText("画布主图") as HTMLImageElement;
    expect(reloadedImg.getAttribute("src")).toBe("https://cdn.example.test/flaky.png?_retry=4");

    fireEvent.load(reloadedImg);
    expect(screen.queryByText("图片加载失败")).toBeNull();

    // After recovery, clicking the image invokes onImageClick as expected
    fireEvent.click(screen.getByRole("button", { name: "放大查看" }));
    expect(onImageClick).toHaveBeenCalledTimes(1);
  });

  it("omits the original-image link for unsafe URLs and avoids adding _retry to data URLs", async () => {
    vi.useFakeTimers();

    render(
      <ResilientImage
        src="data:image/png;base64,INVALID"
        alt="内联图片"
        retryDelaysMs={[100]}
      />,
    );

    fireEvent.error(screen.getByAltText("内联图片"));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const retried = screen.getByAltText("内联图片");
    expect(retried.getAttribute("src")).toBe("data:image/png;base64,INVALID");

    fireEvent.error(retried);
    expect(screen.getByRole("button", { name: /重新加载图片/ })).toBeDefined();
    expect(screen.queryByRole("link", { name: /新窗口打开原图/ })).toBeNull();
  });

  it("retries automatically in compact mode and renders non-button fallback on exhaustion", async () => {
    vi.useFakeTimers();

    render(
      <button type="button">
        <ResilientImage src="https://cdn.example.test/thumb.png" alt="缩略图 1" compact retryDelaysMs={[100]} />
      </button>,
    );

    fireEvent.error(screen.getByAltText("缩略图 1"));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const retried = screen.getByAltText("缩略图 1");
    expect(retried.getAttribute("src")).toBe("https://cdn.example.test/thumb.png?_retry=1");

    fireEvent.error(retried);
    expect(screen.getByRole("img", { name: "缩略图 1（加载失败）" })).toBeDefined();
    // Only the outer wrapper button exists; compact mode never nests a <button>.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
