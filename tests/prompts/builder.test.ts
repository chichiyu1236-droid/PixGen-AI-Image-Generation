import { describe, expect, it } from "vitest";
import { buildImagePrompt } from "@/lib/prompts/builder";

describe("buildImagePrompt", () => {
  it("builds a stable English prompt from Chinese UI option IDs and user text", () => {
    const prompt = buildImagePrompt({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "top_space",
      subject: "一瓶高端护肤精华，透明玻璃瓶，银色瓶盖",
      extra: "背景干净，适合小红书广告图",
    });

    expect(prompt).toContain("premium ecommerce product hero image");
    expect(prompt).toContain("premium minimal commercial photography");
    expect(prompt).toContain("clean professional studio environment");
    expect(prompt).toContain("square 1:1 composition");
    expect(prompt).toContain("leave clean negative space near the top");
    expect(prompt).toContain("一瓶高端护肤精华");
    expect(prompt).toContain("free of text unless explicitly requested");
  });

  it("omits the extra requirements sentence when extra is blank", () => {
    const prompt = buildImagePrompt({
      imageType: "social_post",
      aspectRatio: "portrait",
      style: "soft_realistic",
      scene: "lifestyle",
      whitespace: "balanced",
      subject: "一杯冰拿铁",
      extra: "",
    });

    expect(prompt).not.toContain("Additional requirements:");
    expect(prompt).toContain("vertical 4:5 composition");
  });
});
