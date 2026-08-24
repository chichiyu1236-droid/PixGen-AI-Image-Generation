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

  it("prepends reference guidance for a single reference image", () => {
    const prompt = buildImagePrompt({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "balanced",
      subject: "照这个产品出一张节日礼盒场景图",
      referenceImages: [{ data: "a".repeat(200) }],
    });

    expect(prompt).toContain("1 reference image is attached");
    expect(prompt).toContain("brand-new composition");
    expect(prompt).toContain("not as content to edit, crop, or collage");
    expect(prompt).toContain("Preserve the recognizable identity of the referenced subject");
    expect(prompt).toContain("节日礼盒场景图");
  });

  it("prepends pluralized reference guidance for multiple reference images", () => {
    const prompt = buildImagePrompt({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "balanced",
      subject: "产品加氛围参考",
      referenceImages: [
        { data: "a".repeat(200) },
        { data: "b".repeat(200), generationId: "5f0b1c2e-1111-4222-8333-444455556666" },
      ],
    });

    expect(prompt).toContain("2 reference images are attached");
    expect(prompt).toContain("use them as the visual basis");
  });

  it("keeps the prompt unchanged without reference images", () => {
    const prompt = buildImagePrompt({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "balanced",
      subject: "一瓶高端护肤精华",
      extra: "",
      referenceImages: [],
    });

    expect(prompt).not.toContain("reference");
    expect(prompt.startsWith("Create a high-quality")).toBe(true);
  });
});
