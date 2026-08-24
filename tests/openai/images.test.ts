import { beforeEach, describe, expect, it, vi } from "vitest";
import { editImageBase64, generateImageBase64 } from "@/lib/openai/images";

vi.mock("server-only", () => ({}));

const openaiMocks = vi.hoisted(() => {
  const generate = vi.fn();
  const edit = vi.fn();
  const OpenAI = vi.fn(() => ({
    images: {
      generate,
      edit,
    },
  }));

  return { generate, edit, OpenAI };
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
    process.env.IMAGE_PROVIDER = "openai";
    process.env.ALLOW_MOCK_IN_PRODUCTION = "false";
    vi.stubEnv("NODE_ENV", "test");
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

  it("returns a placeholder without calling the SDK in mock mode", async () => {
    process.env.IMAGE_PROVIDER = "mock";

    const image = await generateImageBase64({ prompt: "anything", size: "1024x1024" });

    expect(image.length).toBeGreaterThan(20);
    expect(openaiMocks.OpenAI).not.toHaveBeenCalled();
  });

  it("rejects the mock provider in production unless explicitly allowed", async () => {
    process.env.IMAGE_PROVIDER = "mock";
    vi.stubEnv("NODE_ENV", "production");

    await expect(generateImageBase64({ prompt: "x", size: "1024x1024" })).rejects.toThrow(
      "mock_image_provider_forbidden_in_production",
    );

    process.env.ALLOW_MOCK_IN_PRODUCTION = "true";
    await expect(generateImageBase64({ prompt: "x", size: "1024x1024" })).resolves.toBeTruthy();
  });
});

describe("editImageBase64", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "relay-key";
    process.env.IMAGE_PROVIDER = "openai";
    vi.stubEnv("NODE_ENV", "test");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    openaiMocks.edit.mockResolvedValue({
      data: [{ b64_json: "edited-base64" }],
    });
  });

  it("edits via the SDK images endpoint", async () => {
    const image = await editImageBase64({ prompt: "make it blue", images: ["aGk="] });

    expect(image).toBe("edited-base64");
    expect(openaiMocks.edit).toHaveBeenCalledWith(expect.objectContaining({ prompt: "make it blue" }));
  });

  it("passes every reference image and the requested size to the SDK edit endpoint", async () => {
    const image = await editImageBase64({ prompt: "use references", images: ["aGk=", "aGk="], size: "1024x1536" });

    expect(image).toBe("edited-base64");
    const args = openaiMocks.edit.mock.calls[0][0] as { prompt: string; size: string; image: unknown[] };
    expect(args.prompt).toBe("use references");
    expect(args.size).toBe("1024x1536");
    expect(Array.isArray(args.image)).toBe(true);
    expect(args.image).toHaveLength(2);
  });

  it("keeps the size optional for edit calls", async () => {
    await editImageBase64({ prompt: "x", images: ["aGk="] });

    expect(openaiMocks.edit.mock.calls[0][0]).not.toHaveProperty("size");
  });

  it("returns a placeholder in mock mode", async () => {
    process.env.IMAGE_PROVIDER = "mock";

    expect(await editImageBase64({ prompt: "x", images: ["aGk=", "aGk="], size: "1024x1024" })).toBeTruthy();
    expect(openaiMocks.edit).not.toHaveBeenCalled();
  });
});
