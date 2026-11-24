import { EventEmitter } from "node:events";
import type { IncomingHttpHeaders } from "node:http";
import type { RequestOptions } from "node:https";
import type { LookupAddress } from "node:dns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editImageBase64, generateImageBase64, MAX_IMAGE_DOWNLOAD_BYTES, safeLookup } from "@/lib/openai/images";

vi.mock("server-only", () => ({}));

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

const httpsMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("node:https", () => ({
  default: { request: httpsMocks.request },
  request: httpsMocks.request,
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

interface MockHttpsPlan {
  statusCode?: number;
  headers?: IncomingHttpHeaders;
  chunks?: Uint8Array[];
  /** Emit chunks one-by-one until destroyed (used to test streaming limit cancellation). */
  repeatChunk?: { chunk: Uint8Array; maxCount: number; onEmit?: () => void };
  /** Emit request error after lookup succeeds (e.g. AbortError / TimeoutError). */
  requestError?: unknown;
  /** Emit response error mid-stream. */
  responseError?: unknown;
  /** Keep response open without ending (used with fake timers for timeout test). */
  hang?: boolean;
  /** Controls whether the mocked net.connect invokes `options.lookup` with `all: true` or single-address mode. */
  lookupAll?: boolean;
  /** Captures the pinned IP(s) returned by `options.lookup`. */
  onPinnedAddress?: (result: string | LookupAddress[], family?: number) => void;
  onDestroy?: () => void;
}

function createFakeHttpsRequest(plan: MockHttpsPlan) {
  return (url: URL | string, options: RequestOptions, callback?: (res: EventEmitter) => void) => {
    const targetUrl = typeof url === "string" ? new URL(url) : url;
    const req = new EventEmitter() as EventEmitter & {
      destroyed: boolean;
      destroy: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    };
    req.destroyed = false;
    req.destroy = vi.fn(() => {
      if (!req.destroyed) {
        req.destroyed = true;
        plan.onDestroy?.();
      }
      return req;
    });

    req.end = vi.fn(() => {
      const proceedAfterLookup = () => {
        if (req.destroyed) return;

        if (plan.requestError !== undefined) {
          queueMicrotask(() => {
            if (!req.destroyed) {
              req.emit("error", plan.requestError);
            }
          });
          return;
        }

        const res = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: IncomingHttpHeaders;
          complete: boolean;
          destroyed: boolean;
          resume: ReturnType<typeof vi.fn>;
          destroy: ReturnType<typeof vi.fn>;
        };
        res.statusCode = plan.statusCode ?? 200;
        res.headers = plan.headers ?? {};
        res.complete = false;
        res.destroyed = false;
        res.resume = vi.fn(() => res);
        res.destroy = vi.fn(() => {
          res.destroyed = true;
          return res;
        });

        queueMicrotask(() => {
          if (req.destroyed) return;
          callback?.(res);

          if (res.destroyed || req.destroyed || plan.hang) {
            return;
          }

          if (plan.responseError !== undefined) {
            queueMicrotask(() => {
              if (!res.destroyed && !req.destroyed) {
                res.emit("error", plan.responseError);
              }
            });
            return;
          }

          if (plan.repeatChunk) {
            const { chunk, maxCount, onEmit } = plan.repeatChunk;
            for (let i = 0; i < maxCount; i += 1) {
              if (res.destroyed || req.destroyed) break;
              onEmit?.();
              res.emit("data", Buffer.from(chunk));
            }
            if (!res.destroyed && !req.destroyed) {
              res.complete = true;
              res.emit("end");
            }
            return;
          }

          for (const chunk of plan.chunks ?? []) {
            if (res.destroyed || req.destroyed) break;
            res.emit("data", Buffer.from(chunk));
          }
          if (!res.destroyed && !req.destroyed) {
            res.complete = true;
            res.emit("end");
          }
        });
      };

      const lookupFn = options.lookup;
      if (lookupFn) {
        const lookupOpts = plan.lookupAll ? { all: true } : {};
        lookupFn(targetUrl.hostname, lookupOpts, (err, address, family) => {
          if (err) {
            queueMicrotask(() => {
              if (!req.destroyed) {
                req.emit("error", err);
              }
            });
            return;
          }
          plan.onPinnedAddress?.(address, family);
          proceedAfterLookup();
        });
      } else {
        proceedAfterLookup();
      }
    });

    return req;
  };
}

describe("safeLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnsMocks.lookup.mockReset();
    httpsMocks.request.mockReset();
  });

  it("pins validated public IPs for both single-address and all-address lookup signatures", async () => {
    dnsMocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    const singleResult = await new Promise<{ address: string | LookupAddress[]; family?: number }>(
      (resolve, reject) => {
        safeLookup("cdn.relay.example.com", {}, (err, address, family) => {
          if (err) reject(err);
          else resolve({ address, family });
        });
      },
    );
    expect(singleResult).toEqual({ address: "93.184.216.34", family: 4 });

    const allResult = await new Promise<string | LookupAddress[]>((resolve, reject) => {
      safeLookup("cdn.relay.example.com", { all: true }, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    });
    expect(allResult).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it("rejects private IPs inside safeLookup callback", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);

    await expect(
      new Promise((resolve, reject) => {
        safeLookup("rebind.example.com", { all: true }, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      }),
    ).rejects.toThrow("resolved IP address is not allowed");
  });
});

describe("generateImageBase64", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnsMocks.lookup.mockReset();
    httpsMocks.request.mockReset();
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("passes an optional OpenAI-compatible relay base URL and png output format to the SDK", async () => {
    const image = await generateImageBase64({
      prompt: "A premium product image",
      size: "1024x1024",
    });

    expect(image).toBe("image-base64");
    expect(httpsMocks.request).not.toHaveBeenCalled();
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

  it("pins the validated DNS IP via a single lookup per hop to prevent DNS rebinding", async () => {
    const chunkA = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const chunkB = Uint8Array.from([0x0d, 0x0a, 0x1a, 0x0a]);
    const pinned: Array<{ address: string | LookupAddress[]; family?: number }> = [];

    // Even if a subsequent DNS lookup would rebind to metadata IP, only 1 lookup occurs per hop.
    dnsMocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);

    httpsMocks.request.mockImplementationOnce(
      createFakeHttpsRequest({
        chunks: [chunkA, chunkB],
        lookupAll: true,
        onPinnedAddress: (address, family) => pinned.push({ address, family }),
      }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/generated.png" }],
    });

    const image = await generateImageBase64({
      prompt: "A hosted relay image",
      size: "1024x1024",
    });

    expect(image).toBe(Buffer.concat([chunkA, chunkB]).toString("base64"));
    expect(dnsMocks.lookup).toHaveBeenCalledTimes(1);
    expect(dnsMocks.lookup).toHaveBeenCalledWith("cdn.relay.example.com", { all: true });
    expect(pinned).toEqual([{ address: [{ address: "93.184.216.34", family: 4 }], family: undefined }]);
    expect(httpsMocks.request).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "GET",
        agent: false,
        lookup: safeLookup,
        signal: expect.any(AbortSignal),
      }),
      expect.any(Function),
    );
  });

  it("rejects non-HTTPS protocols before issuing any network request", async () => {
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

    expect(httpsMocks.request).not.toHaveBeenCalled();
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
  });

  it("rejects localhost, .local, and private/loopback/metadata IP literals", async () => {
    const blockedUrls = [
      "https://localhost/image.png",
      "https://printer.local/image.png",
      "https://metadata.google.internal/computeMetadata/v1/",
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

    expect(httpsMocks.request).not.toHaveBeenCalled();
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
  });

  it("rejects hostnames when safeLookup resolves any private, loopback, or metadata IP", async () => {
    const onPinnedAddress = vi.fn();
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
      httpsMocks.request.mockImplementationOnce(createFakeHttpsRequest({ onPinnedAddress }));
      openaiMocks.generate.mockResolvedValueOnce({
        data: [{ url: "https://sneaky.relay.example.com/image.png" }],
      });

      await expect(generateImageBase64({ prompt: "dns rebind", size: "1024x1024" })).rejects.toThrow(
        "resolved IP address is not allowed",
      );
    }

    expect(onPinnedAddress).not.toHaveBeenCalled();
  });

  it("follows up to 3 validated HTTPS redirects and blocks redirects to private or non-HTTPS targets", async () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    httpsMocks.request
      .mockImplementationOnce(
        createFakeHttpsRequest({ statusCode: 302, headers: { location: "https://cdn-1.example.com/hop1.png" } }),
      )
      .mockImplementationOnce(
        createFakeHttpsRequest({ statusCode: 302, headers: { location: "https://cdn-2.example.com/hop2.png" } }),
      )
      .mockImplementationOnce(createFakeHttpsRequest({ chunks: [pngBytes] }));
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/start.png" }],
    });

    const image = await generateImageBase64({ prompt: "cdn redirect", size: "1024x1024" });

    expect(image).toBe(Buffer.from(pngBytes).toString("base64"));
    expect(httpsMocks.request).toHaveBeenCalledTimes(3);
    expect(dnsMocks.lookup).toHaveBeenCalledTimes(3);
    expect(dnsMocks.lookup).toHaveBeenCalledWith("cdn-1.example.com", { all: true });
    expect(dnsMocks.lookup).toHaveBeenCalledWith("cdn-2.example.com", { all: true });

    // 302 redirecting to metadata/private IP literal must be rejected before issuing a second HTTPS request.
    httpsMocks.request.mockReset();
    httpsMocks.request.mockImplementationOnce(
      createFakeHttpsRequest({
        statusCode: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data/" },
      }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/redirect-ssrf.png" }],
    });

    await expect(generateImageBase64({ prompt: "redirect ssrf", size: "1024x1024" })).rejects.toThrow(
      "IP address is not allowed",
    );
    expect(httpsMocks.request).toHaveBeenCalledTimes(1);

    // 302 downgrading to HTTP must be rejected before issuing a second HTTPS request.
    httpsMocks.request.mockReset();
    httpsMocks.request.mockImplementationOnce(
      createFakeHttpsRequest({
        statusCode: 302,
        headers: { location: "http://cdn.relay.example.com/downgrade.png" },
      }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/redirect-http.png" }],
    });

    await expect(generateImageBase64({ prompt: "redirect http", size: "1024x1024" })).rejects.toThrow(
      "only HTTPS URLs are allowed",
    );
    expect(httpsMocks.request).toHaveBeenCalledTimes(1);

    // 302 redirecting to a domain whose safeLookup resolves to loopback must be rejected before connecting.
    httpsMocks.request.mockReset();
    const onSecondHopConnected = vi.fn();
    dnsMocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    httpsMocks.request
      .mockImplementationOnce(
        createFakeHttpsRequest({
          statusCode: 302,
          headers: { location: "https://internal.example.com/secret" },
        }),
      )
      .mockImplementationOnce(createFakeHttpsRequest({ onPinnedAddress: onSecondHopConnected }));
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/redirect-dns.png" }],
    });

    await expect(generateImageBase64({ prompt: "redirect dns ssrf", size: "1024x1024" })).rejects.toThrow(
      "resolved IP address is not allowed",
    );
    expect(onSecondHopConnected).not.toHaveBeenCalled();

    // More than 3 redirect hops must be rejected.
    httpsMocks.request.mockReset();
    httpsMocks.request.mockImplementation(
      createFakeHttpsRequest({ statusCode: 302, headers: { location: "https://cdn.relay.example.com/loop.png" } }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/loop-start.png" }],
    });

    await expect(generateImageBase64({ prompt: "too many redirects", size: "1024x1024" })).rejects.toThrow(
      "too many redirects",
    );
    expect(httpsMocks.request).toHaveBeenCalledTimes(4);
  });

  it("rejects oversized responses via Content-Length header and destroys the request immediately", async () => {
    const onDestroy = vi.fn();
    httpsMocks.request.mockImplementationOnce(
      createFakeHttpsRequest({
        headers: { "content-length": String(MAX_IMAGE_DOWNLOAD_BYTES + 1) },
        chunks: [new Uint8Array(16)],
        onDestroy,
      }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/huge.png" }],
    });

    await expect(generateImageBase64({ prompt: "huge header", size: "1024x1024" })).rejects.toThrow(
      `exceeds ${MAX_IMAGE_DOWNLOAD_BYTES} byte limit`,
    );
    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the request when streamed chunks exceed the byte limit without Content-Length", async () => {
    const onDestroy = vi.fn();
    let emittedChunks = 0;
    httpsMocks.request.mockImplementationOnce(
      createFakeHttpsRequest({
        repeatChunk: {
          chunk: new Uint8Array(10 * 1024 * 1024),
          maxCount: 10,
          onEmit: () => {
            emittedChunks += 1;
          },
        },
        onDestroy,
      }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/chunked-huge.png" }],
    });

    await expect(generateImageBase64({ prompt: "huge stream", size: "1024x1024" })).rejects.toThrow(
      `exceeds ${MAX_IMAGE_DOWNLOAD_BYTES} byte limit`,
    );
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(emittedChunks).toBe(3);
  });

  it("throws a clear timeout error on AbortError, TimeoutError, and 60s deadline expiry", async () => {
    httpsMocks.request.mockImplementationOnce(
      createFakeHttpsRequest({
        requestError: new DOMException("The operation was aborted", "AbortError"),
      }),
    );
    openaiMocks.generate.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/slow.png" }],
    });

    await expect(generateImageBase64({ prompt: "slow request", size: "1024x1024" })).rejects.toThrow(
      "request timed out",
    );

    // Response stream TimeoutError
    httpsMocks.request.mockImplementationOnce(
      createFakeHttpsRequest({
        responseError: new DOMException("The operation timed out", "TimeoutError"),
      }),
    );

    await expect(generateImageBase64({ prompt: "slow stream", size: "1024x1024" })).rejects.toThrow(
      "request timed out",
    );

    // 60s AbortController timeout firing while response hangs
    vi.useFakeTimers();
    const onDestroy = vi.fn();
    httpsMocks.request.mockImplementationOnce(createFakeHttpsRequest({ hang: true, onDestroy }));

    const pending = generateImageBase64({ prompt: "hung stream", size: "1024x1024" });
    const assertion = expect(pending).rejects.toThrow("request timed out");
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when downloading a hosted image URL fails with non-2xx", async () => {
    httpsMocks.request.mockImplementationOnce(createFakeHttpsRequest({ statusCode: 502 }));
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
    dnsMocks.lookup.mockReset();
    httpsMocks.request.mockReset();
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("edits via the SDK images endpoint with png output format", async () => {
    const image = await editImageBase64({ prompt: "make it blue", images: ["aGk="] });

    expect(image).toBe("edited-base64");
    expect(httpsMocks.request).not.toHaveBeenCalled();
    expect(openaiMocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "make it blue",
        output_format: "png",
      }),
    );
  });

  it("downloads relay hosted image URLs for edited images with pinned DNS lookup", async () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);
    httpsMocks.request.mockImplementationOnce(createFakeHttpsRequest({ chunks: [pngBytes] }));
    openaiMocks.edit.mockResolvedValue({
      data: [{ url: "https://cdn.relay.example.com/edited.png" }],
    });

    const image = await editImageBase64({ prompt: "make it blue", images: ["aGk="] });

    expect(image).toBe(Buffer.from(pngBytes).toString("base64"));
    expect(dnsMocks.lookup).toHaveBeenCalledTimes(1);
    expect(httpsMocks.request).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ agent: false, lookup: safeLookup }),
      expect.any(Function),
    );
  });

  it("throws when edited image URL download returns non-2xx or payload has no image", async () => {
    httpsMocks.request.mockImplementationOnce(createFakeHttpsRequest({ statusCode: 503 }));
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

  it("detects JPEG, PNG, and WebP magic bytes and sets matching filename and MIME type for reference images", async () => {
    const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");
    const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const webpBase64 = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]).toString("base64");
    const unknownBase64 = Buffer.from("hello-world").toString("base64");

    await editImageBase64({
      prompt: "preserve formats",
      images: [jpegBase64, pngBase64, webpBase64, unknownBase64],
    });

    const args = openaiMocks.edit.mock.calls[0][0] as {
      image: Array<{ name: string; type: string }>;
    };

    expect(args.image).toHaveLength(4);
    expect(args.image.map((file) => ({ name: file.name, type: file.type }))).toEqual([
      { name: "input-1.jpg", type: "image/jpeg" },
      { name: "input-2.png", type: "image/png" },
      { name: "input-3.webp", type: "image/webp" },
      { name: "input-4.png", type: "image/png" },
    ]);
  });
});
