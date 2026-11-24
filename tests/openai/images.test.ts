import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editImageBase64, generateImageBase64, MAX_IMAGE_DOWNLOAD_BYTES } from "@/lib/openai/images";

vi.mock("server-only", () => ({}));

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

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

function createStreamResponse(
  chunks: Uint8Array[],
  init: { status?: number; headers?: Record<string, string>; onCancel?: () => void } = {},
) {
  const status = init.status ?? 200;
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
      } else {
        controller.close();
      }
    },
    cancel() {
      init.onCancel?.();
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers),
    body,
  };
}

describe("generateImageBase64", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
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

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("passes an optional OpenAI-compatible relay base URL and png output format to the SDK", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const image = await generateImageBase64({
      prompt: "A premium product image",
      size: "1024x1024",
    });

    expect(image).toBe("image-base64");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
    expect(openaiMocks.OpenAI).toHaveBeenCalledWith({
      apiKey: "relay-key",
      baseURL: "https://relay.example.com/v1",
      maxRetries: 1,
      timeout: 90_000,
    });
    expect(openaiMocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image2",
        quality: "high",
        output_format: "png",
      }),
    );
  });

  it("downloads relay hosted HTTPS image URLs with manual redirects and encodes streamed bytes as base64", async () => {
    const chunkA = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const chunkB = Uint8Array.from([0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([chunkA, chunkB]));
    vi.stubGlobal("fetch", fetchMock);
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/generated.png" }],
    });

    const image = await generateImageBase64({
      prompt: "A hosted relay image",
      size: "1024x1024",
    });

    expect(image).toBe(Buffer.concat([chunkA, chunkB]).toString("base64"));
    expect(dnsMocks.lookup).toHaveBeenCalledWith("cdn.relay.example.com", { all: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.relay.example.com/generated.png",
      expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects non-HTTPS protocols before issuing any network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const url of [
      "http://cdn.relay.example.com/generated.png",
      "file:///etc/passwd",
      "data:image/png;base64,iVBORw0KGgo=",
    ]) {
      openaiMocks.generate.mockResolvedValueOnce({ data: [{ url }] });
      await expect(generateImageBase64({ prompt: "bad scheme", size: "1024x1024" })).rejects.toThrow(
        "only HTTPS URLs are allowed",
      );
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects localhost, .local, and private/loopback/metadata IP literals", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const blockedUrls = [
      "https://localhost/image.png",
      "https://printer.local/image.png",
      "https://169.254.169.254/latest/meta-data/",
      "https://127.0.0.1/internal.png",
      "https://10.0.0.5/internal.png",
      "https://172.16.0.1/internal.png",
      "https://192.168.1.1/internal.png",
      "https://100.64.0.1/internal.png",
      "https://0.0.0.1/internal.png",
      "https://[::1]/internal.png",
      "https://[fc00::1]/internal.png",
      "https://[fe80::1]/internal.png",
      "https://[::ffff:127.0.0.1]/internal.png",
      "https://[::ffff:169.254.169.254]/latest/meta-data/",
    ];

    for (const url of blockedUrls) {
      openaiMocks.generate.mockResolvedValueOnce({ data: [{ url }] });
      await expect(generateImageBase64({ prompt: "ssrf", size: "1024x1024" })).rejects.toThrow(/not allowed/);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
  });

  it("rejects hostnames whose DNS lookup returns any private, loopback, or metadata IP", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resolvedSets = [
      [{ address: "169.254.169.254", family: 4 }],
      [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.2", family: 4 },
      ],
      [{ address: "::ffff:192.168.0.10", family: 6 }],
      [{ address: "fe80::1", family: 6 }],
    ];

    for (const records of resolvedSets) {
      dnsMocks.lookup.mockResolvedValueOnce(records);
      openaiMocks.generate.mockResolvedValueOnce({
        data: [{ url: "https://sneaky.relay.example.com/image.png" }],
      });

      await expect(generateImageBase64({ prompt: "dns rebind", size: "1024x1024" })).rejects.toThrow(
        "resolved IP address is not allowed",
      );
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows up to 3 validated HTTPS redirects and blocks redirects to private or non-HTTPS targets", async () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createStreamResponse([], { status: 302, headers: { location: "https://cdn-1.example.com/hop1.png" } }),
      )
      .mockResolvedValueOnce(
        createStreamResponse([], { status: 302, headers: { location: "https://cdn-2.example.com/hop2.png" } }),
      )
      .mockResolvedValueOnce(createStreamResponse([pngBytes]));
    vi.stubGlobal("fetch", fetchMock);
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/start.png" }],
    });

    const image = await generateImageBase64({ prompt: "cdn redirect", size: "1024x1024" });

    expect(image).toBe(Buffer.from(pngBytes).toString("base64"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(dnsMocks.lookup).toHaveBeenCalledWith("cdn-1.example.com", { all: true });
    expect(dnsMocks.lookup).toHaveBeenCalledWith("cdn-2.example.com", { all: true });

    // 302 redirecting to metadata/private IP must be rejected before fetching the Location target.
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      createStreamResponse([], { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data/" } }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/redirect-ssrf.png" }],
    });

    await expect(generateImageBase64({ prompt: "redirect ssrf", size: "1024x1024" })).rejects.toThrow(
      "IP address is not allowed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 302 downgrading to HTTP must be rejected before fetching the Location target.
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      createStreamResponse([], { status: 302, headers: { location: "http://cdn.relay.example.com/downgrade.png" } }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/redirect-http.png" }],
    });

    await expect(generateImageBase64({ prompt: "redirect http", size: "1024x1024" })).rejects.toThrow(
      "only HTTPS URLs are allowed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 302 redirecting to a domain that resolves to loopback must also be rejected.
    fetchMock.mockReset();
    dnsMocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    fetchMock.mockResolvedValueOnce(
      createStreamResponse([], { status: 302, headers: { location: "https://internal.example.com/secret" } }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/redirect-dns.png" }],
    });

    await expect(generateImageBase64({ prompt: "redirect dns ssrf", size: "1024x1024" })).rejects.toThrow(
      "resolved IP address is not allowed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // More than 3 redirect hops must be rejected.
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      createStreamResponse([], { status: 302, headers: { location: "https://cdn.relay.example.com/loop.png" } }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/loop-start.png" }],
    });

    await expect(generateImageBase64({ prompt: "too many redirects", size: "1024x1024" })).rejects.toThrow(
      "too many redirects",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects oversized responses via Content-Length header before reading the body", async () => {
    const onCancel = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamResponse([new Uint8Array(16)], {
        headers: { "content-length": String(MAX_IMAGE_DOWNLOAD_BYTES + 1) },
        onCancel,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/huge.png" }],
    });

    await expect(generateImageBase64({ prompt: "huge header", size: "1024x1024" })).rejects.toThrow(
      `exceeds ${MAX_IMAGE_DOWNLOAD_BYTES} byte limit`,
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("aborts and cancels the stream when streamed chunks exceed the byte limit without Content-Length", async () => {
    const onCancel = vi.fn();
    const chunk = new Uint8Array(10 * 1024 * 1024);
    let pulledChunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulledChunks += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        onCancel();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body,
    });
    vi.stubGlobal("fetch", fetchMock);
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/chunked-huge.png" }],
    });

    await expect(generateImageBase64({ prompt: "huge stream", size: "1024x1024" })).rejects.toThrow(
      `exceeds ${MAX_IMAGE_DOWNLOAD_BYTES} byte limit`,
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(pulledChunks).toBeLessThanOrEqual(4);
  });

  it("throws a clear timeout error when image download aborts or times out", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValueOnce(abortError);
    vi.stubGlobal("fetch", fetchMock);
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/slow.png" }],
    });

    await expect(generateImageBase64({ prompt: "slow fetch", size: "1024x1024" })).rejects.toThrow(
      "request timed out",
    );

    // Timeout while streaming the response body
    const timeoutStream = new ReadableStream<Uint8Array>({
      pull() {
        return Promise.reject(new DOMException("The operation timed out", "TimeoutError"));
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: timeoutStream,
    });

    await expect(generateImageBase64({ prompt: "slow stream", size: "1024x1024" })).rejects.toThrow(
      "request timed out",
    );
  });

  it("throws a clear error when downloading a hosted image URL fails with non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([], { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/missing.png" }],
    });

    await expect(generateImageBase64({ prompt: "broken url", size: "1024x1024" })).rejects.toThrow(
      "Failed to download generated image: HTTP 502",
    );
  });

  it("throws a clear error when neither b64_json nor url is returned", async () => {
    openaiMocks.generate.mockResolvedValue({
      data: [{}],
    });

    await expect(generateImageBase64({ prompt: "empty payload", size: "1024x1024" })).rejects.toThrow(
      "OpenAI did not return an image.",
    );

    openaiMocks.generate.mockResolvedValue({
      data: [],
    });

    await expect(generateImageBase64({ prompt: "empty list", size: "1024x1024" })).rejects.toThrow(
      "OpenAI did not return an image.",
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
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
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

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("edits via the SDK images endpoint with png output format", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const image = await editImageBase64({ prompt: "make it blue", images: ["aGk="] });

    expect(image).toBe("edited-base64");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openaiMocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "make it blue",
        output_format: "png",
      }),
    );
  });

  it("downloads relay hosted image URLs for edited images", async () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([pngBytes]));
    vi.stubGlobal("fetch", fetchMock);
    openaiMocks.edit.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/edited.png" }],
    });

    const image = await editImageBase64({ prompt: "make it blue", images: ["aGk="] });

    expect(image).toBe(Buffer.from(pngBytes).toString("base64"));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.relay.example.com/edited.png",
      expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }),
    );
  });

  it("throws when edited image URL download returns non-2xx or payload has no image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([], { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    openaiMocks.edit.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/edited-503.png" }],
    });

    await expect(editImageBase64({ prompt: "fail", images: ["aGk="] })).rejects.toThrow(
      "Failed to download generated image: HTTP 503",
    );

    openaiMocks.edit.mockResolvedValue({
      data: [{}],
    });

    await expect(editImageBase64({ prompt: "empty", images: ["aGk="] })).rejects.toThrow(
      "OpenAI did not return an edited image.",
    );
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
