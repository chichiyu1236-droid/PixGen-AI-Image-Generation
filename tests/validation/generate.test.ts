import { describe, expect, it } from "vitest";
import { generateRequestSchema } from "@/lib/validation/generate";

const baseRequest = {
  imageType: "ecommerce_hero",
  aspectRatio: "square",
  style: "premium_minimal",
  scene: "studio",
  whitespace: "balanced",
  subject: "一双白色运动鞋",
  extra: "",
};

describe("generateRequestSchema", () => {
  it("accepts a complete request", () => {
    const result = generateRequestSchema.safeParse({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "balanced",
      subject: "一双白色运动鞋",
      extra: "需要高级感",
    });

    expect(result.success).toBe(true);
  });

  it("rejects blank subject text", () => {
    const result = generateRequestSchema.safeParse({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "balanced",
      subject: "  ",
      extra: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts up to three reference images with optional history ids and defaults to an empty list", () => {
    const withReferences = generateRequestSchema.safeParse({
      ...baseRequest,
      referenceImages: [
        { data: "a".repeat(200), generationId: "5f0b1c2e-1111-4222-8333-444455556666" },
        { data: "b".repeat(200) },
        { data: "c".repeat(200) },
      ],
    });

    expect(withReferences.success).toBe(true);
    if (withReferences.success) {
      expect(withReferences.data.referenceImages).toHaveLength(3);
      expect(withReferences.data.referenceImages[0]?.generationId).toBe("5f0b1c2e-1111-4222-8333-444455556666");
      expect(withReferences.data.referenceImages[1]?.generationId).toBeUndefined();
    }

    const withoutReferences = generateRequestSchema.safeParse(baseRequest);

    expect(withoutReferences.success).toBe(true);
    if (withoutReferences.success) {
      expect(withoutReferences.data.referenceImages).toEqual([]);
    }
  });

  it("rejects more than three reference images", () => {
    const result = generateRequestSchema.safeParse({
      ...baseRequest,
      referenceImages: ["a", "b", "c", "d"].map((character) => ({ data: character.repeat(200) })),
    });

    expect(result.success).toBe(false);
  });

  it("rejects a single reference image exceeding the per-image size cap", () => {
    const result = generateRequestSchema.safeParse({
      ...baseRequest,
      referenceImages: [{ data: "a".repeat(1_500_001) }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects reference images whose combined size exceeds the total cap", () => {
    const result = generateRequestSchema.safeParse({
      ...baseRequest,
      referenceImages: [
        { data: "a".repeat(1_300_000) },
        { data: "b".repeat(1_300_000) },
        { data: "c".repeat(1_300_000) },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects reference image data with non-base64 characters", () => {
    const result = generateRequestSchema.safeParse({
      ...baseRequest,
      referenceImages: [{ data: "not!valid!base64!".repeat(10) }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a reference image with an invalid history generation id", () => {
    const result = generateRequestSchema.safeParse({
      ...baseRequest,
      referenceImages: [{ data: "a".repeat(200), generationId: "not-a-uuid" }],
    });

    expect(result.success).toBe(false);
  });
});
