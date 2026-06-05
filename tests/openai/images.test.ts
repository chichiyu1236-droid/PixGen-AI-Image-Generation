import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateImageBase64 } from "@/lib/openai/images";

vi.mock("server-only", () => ({}));

const openaiMocks = vi.hoisted(() => {
  const generate = vi.fn();
  const OpenAI = vi.fn(() => ({
    images: {
      generate,
    },
  }));

  return { generate, OpenAI };
});

vi.mock("openai", () => ({
  default: openaiMocks.OpenAI,
}));

describe("generateImageBase64", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "relay-key";
    process.env.OPENAI_BASE_URL = "https://relay.example.com/v1";
    process.env.OPENAI_IMAGE_MODEL = "gpt-image2";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    openaiMocks.generate.mockResolvedValue({
      data: [{ b64_json: "image-base64" }],
    });
  });

  it("passes an optional OpenAI-compatible relay base URL to the SDK", async () => {
    const image = await generateImageBase64({
      prompt: "A premium product image",
      size: "1024x1024",
    });

    expect(image).toBe("image-base64");
    expect(openaiMocks.OpenAI).toHaveBeenCalledWith({
      apiKey: "relay-key",
      baseURL: "https://relay.example.com/v1",
    });
    expect(openaiMocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image2",
        quality: "high",
      }),
    );
  });
});
