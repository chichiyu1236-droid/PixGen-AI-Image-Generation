import { describe, expect, it } from "vitest";
import { generateRequestSchema } from "@/lib/validation/generate";

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
});
