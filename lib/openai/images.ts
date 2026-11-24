import "server-only";

import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { getServerEnv, resolveImageProvider } from "@/lib/env";
import { markImageProviderHealthy } from "@/lib/openai/provider-health";

/** The relay can hang for minutes before Cloudflare kills it; fail faster. */
const IMAGE_REQUEST_TIMEOUT_MS = 90_000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_IMAGE_DOWNLOAD_REDIRECTS = 3;
export const MAX_IMAGE_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** 1x1 transparent PNG used by the mock image provider (dev/test only). */
const MOCK_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }

  return [nums[0], nums[1], nums[2], nums[3]];
}

function isBlockedIpv4Octets([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24
  if (a >= 224) return true; // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved
  return false;
}

function parseIpv6Groups(ip: string): number[] | null {
  const halves = ip.toLowerCase().split("::");
  if (halves.length > 2) {
    return null;
  }
  if (halves.length === 2 && halves[0].includes(".")) {
    return null;
  }

  const parseHalf = (part: string): number[] | null => {
    if (!part) return [];
    const tokens = part.split(":");
    const groups: number[] = [];

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.includes(".")) {
        if (i !== tokens.length - 1) return null;
        const octets = parseIpv4Octets(token);
        if (!octets) return null;
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
        groups.push(Number.parseInt(token, 16));
      }
    }

    return groups;
  };

  const left = parseHalf(halves[0]);
  if (!left) return null;

  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const right = parseHalf(halves[1]);
  if (!right) return null;

  const missing = 8 - (left.length + right.length);
  if (missing < 1) {
    return null;
  }

  return [...left, ...Array<number>(missing).fill(0), ...right];
}

function ipv4FromTwoGroups(hi: number, lo: number): [number, number, number, number] {
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
}

function isBlockedIpv6Groups(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;

  // ::/96 (unspecified ::, loopback ::1, deprecated IPv4-compatible)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return true;
  // ::ffff:0:0/96 (IPv4-mapped)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isBlockedIpv4Octets(ipv4FromTwoGroups(g6, g7));
  }
  // ::ffff:0:0:0/96 (IPv4-translated)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) {
    return isBlockedIpv4Octets(ipv4FromTwoGroups(g6, g7));
  }
  // 64:ff9b::/96 (NAT64 well-known) and 64:ff9b:1::/48 (NAT64 local-use)
  if (g0 === 0x0064 && g1 === 0xff9b) {
    if (g2 === 0x0001) return true;
    if (g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
      return isBlockedIpv4Octets(ipv4FromTwoGroups(g6, g7));
    }
  }
  // 100::/64 (discard-only)
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true;
  // 2001::/32 (Teredo) and 2001:db8::/32 (documentation)
  if (g0 === 0x2001 && (g1 === 0x0000 || g1 === 0x0db8)) return true;
  // 2002::/16 (6to4)
  if (g0 === 0x2002) {
    return isBlockedIpv4Octets(ipv4FromTwoGroups(g1, g2));
  }
  // fc00::/7 (ULA), fe80::/10 (link-local), fec0::/10 (site-local), ff00::/8 (multicast)
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xffc0) === 0xfec0) return true;
  if ((g0 & 0xff00) === 0xff00) return true;

  return false;
}

function isBlockedIp(ip: string): boolean {
  const trimmed = ip.trim();
  if (!trimmed || trimmed.includes("%")) {
    return true;
  }

  const version = isIP(trimmed);
  if (version === 4) {
    const octets = parseIpv4Octets(trimmed);
    return octets === null || isBlockedIpv4Octets(octets);
  }
  if (version === 6) {
    const groups = parseIpv6Groups(trimmed);
    return groups === null || isBlockedIpv6Groups(groups);
  }

  return true;
}

function normalizeHostname(hostname: string): string {
  const rawHost = hostname.trim().toLowerCase();
  const bareHost = rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;
  return bareHost.replace(/\.+$/, "");
}

function isBlockedHostname(host: string): boolean {
  return (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

/**
 * Validates URL syntax, protocol, host blocklist, and IP literals synchronously
 * without performing a pre-flight DNS lookup (DNS resolution happens once inside
 * `safeLookup` when the HTTPS socket connects, preventing DNS rebinding).
 */
function assertSafeImageUrlSyntax(url: URL): void {
  if (url.protocol !== "https:") {
    throw new Error("Failed to download generated image: only HTTPS URLs are allowed");
  }

  if (url.username || url.password) {
    throw new Error("Failed to download generated image: URL credentials are not allowed");
  }

  const host = normalizeHostname(url.hostname);
  if (isBlockedHostname(host)) {
    throw new Error("Failed to download generated image: host is not allowed");
  }

  if (isIP(host) !== 0 && isBlockedIp(host)) {
    throw new Error("Failed to download generated image: IP address is not allowed");
  }
}

/**
 * Custom DNS lookup for `node:https` that validates all resolved records and pins
 * the validated public IP(s) directly to the underlying socket (eliminating TOCTOU).
 */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  const host = normalizeHostname(hostname);

  if (isBlockedHostname(host)) {
    callback(new Error("Failed to download generated image: host is not allowed"), "");
    return;
  }

  const ipVersion = isIP(host);
  if (ipVersion !== 0) {
    if (isBlockedIp(host)) {
      callback(new Error("Failed to download generated image: IP address is not allowed"), "");
      return;
    }

    if (options?.all) {
      callback(null, [{ address: host, family: ipVersion }]);
    } else {
      callback(null, host, ipVersion);
    }
    return;
  }

  void lookup(host, { all: true })
    .then((records) => {
      if (!records || records.length === 0) {
        callback(new Error("Failed to download generated image: unable to resolve host"), "");
        return;
      }

      for (const record of records) {
        if (isBlockedIp(record.address)) {
          callback(new Error("Failed to download generated image: resolved IP address is not allowed"), "");
          return;
        }
      }

      const requestedFamily = options?.family === 4 || options?.family === 6 ? options.family : 0;
      const matched = requestedFamily ? records.filter((record) => record.family === requestedFamily) : records;
      if (matched.length === 0) {
        callback(new Error("Failed to download generated image: unable to resolve host"), "");
        return;
      }

      if (options?.all) {
        callback(
          null,
          matched.map((record) => ({ address: record.address, family: record.family })),
        );
      } else {
        callback(null, matched[0].address, matched[0].family);
      }
    })
    .catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error(String(error)), "");
    });
};

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

type HttpsHopResult =
  | { kind: "redirect"; statusCode: number; location: string | undefined }
  | { kind: "ok"; base64: string };

function requestHttpsOnce(url: URL, signal: AbortSignal): Promise<HttpsHopResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      return;
    }

    let settled = false;
    let activeRes: IncomingMessage | null = null;
    let req: ReturnType<typeof httpsRequest> | null = null;

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      activeRes?.destroy();
      req?.destroy();
      reject(error);
    };

    const succeed = (result: HttpsHopResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => {
      fail(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
    };

    try {
      req = httpsRequest(
        url,
        {
          method: "GET",
          agent: false,
          signal,
          lookup: safeLookup,
          headers: {
            Accept: "image/*",
          },
        },
        (res) => {
          activeRes = res;
          res.on("error", (error) => {
            fail(error);
          });

          const statusCode = res.statusCode ?? 0;

          if (REDIRECT_STATUSES.has(statusCode)) {
            const rawLocation = res.headers.location;
            const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
            succeed({ kind: "redirect", statusCode, location });
            res.resume();
            res.destroy();
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            fail(new Error(`Failed to download generated image: HTTP ${statusCode}`));
            return;
          }

          const rawContentLength = res.headers["content-length"];
          const contentLengthHeader = Array.isArray(rawContentLength) ? rawContentLength[0] : rawContentLength;
          if (contentLengthHeader !== undefined && contentLengthHeader.trim() !== "") {
            const contentLength = Number(contentLengthHeader);
            if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_DOWNLOAD_BYTES) {
              fail(
                new Error(`Failed to download generated image: response exceeds ${MAX_IMAGE_DOWNLOAD_BYTES} byte limit`),
              );
              return;
            }
          }

          const chunks: Buffer[] = [];
          let totalBytes = 0;

          res.on("data", (chunk: Buffer | Uint8Array | string) => {
            if (settled) return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (buf.byteLength === 0) return;

            totalBytes += buf.byteLength;
            if (totalBytes > MAX_IMAGE_DOWNLOAD_BYTES) {
              fail(
                new Error(`Failed to download generated image: response exceeds ${MAX_IMAGE_DOWNLOAD_BYTES} byte limit`),
              );
              return;
            }

            chunks.push(buf);
          });

          res.on("end", () => {
            if (settled) return;
            if (res.complete === false) {
              fail(new Error("Failed to download generated image: response stream terminated prematurely"));
              return;
            }
            succeed({ kind: "ok", base64: Buffer.concat(chunks, totalBytes).toString("base64") });
          });

          res.on("aborted", () => {
            fail(new Error("Failed to download generated image: response aborted"));
          });

          res.on("close", () => {
            if (!settled) {
              fail(new Error("Failed to download generated image: response closed unexpectedly"));
            }
          });
        },
      );

      req.on("error", (error) => {
        fail(error);
      });

      signal.addEventListener("abort", onAbort, { once: true });
      req.end();
    } catch (error) {
      fail(error);
    }
  });
}

async function downloadImageAsBase64(rawUrl: string): Promise<string> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new Error("Failed to download generated image: invalid URL");
  }

  assertSafeImageUrlSyntax(currentUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("The operation timed out", "TimeoutError"));
  }, IMAGE_DOWNLOAD_TIMEOUT_MS);

  try {
    for (let redirects = 0; ; redirects += 1) {
      const result = await requestHttpsOnce(currentUrl, controller.signal);

      if (result.kind === "ok") {
        return result.base64;
      }

      if (redirects >= MAX_IMAGE_DOWNLOAD_REDIRECTS) {
        throw new Error("Failed to download generated image: too many redirects");
      }

      if (!result.location) {
        throw new Error(`Failed to download generated image: redirect HTTP ${result.statusCode} missing Location header`);
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(result.location, currentUrl);
      } catch {
        throw new Error("Failed to download generated image: invalid redirect URL");
      }

      assertSafeImageUrlSyntax(nextUrl);
      currentUrl = nextUrl;
    }
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      throw new Error(`Failed to download generated image: request timed out after ${IMAGE_DOWNLOAD_TIMEOUT_MS}ms`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Relays differ: some inline the image as base64, others return a hosted URL.
 * Normalise both shapes to base64 so callers keep a single contract.
 */
async function toBase64(data: { b64_json?: string | null; url?: string | null } | undefined) {
  if (data?.b64_json) {
    return data.b64_json;
  }

  if (!data?.url) {
    return null;
  }

  return downloadImageAsBase64(data.url);
}

function imageClient() {
  const env = getServerEnv();

  return {
    client: new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
      timeout: IMAGE_REQUEST_TIMEOUT_MS,
      maxRetries: 1,
    }),
    model: env.OPENAI_IMAGE_MODEL,
  };
}

export async function generateImageBase64(input: { prompt: string; size: string }) {
  if (resolveImageProvider() === "mock") {
    return MOCK_IMAGE_BASE64;
  }

  const { client, model } = imageClient();

  const response = await client.images.generate({
    model,
    prompt: input.prompt,
    quality: "high",
    n: 1,
    size: input.size as "1024x1024" | "1024x1536" | "1536x1024",
    // Storage and the reference-edit path both assume PNG.
    output_format: "png",
  });

  const image = await toBase64(response.data?.[0]);

  if (!image) {
    throw new Error("OpenAI did not return an image.");
  }

  markImageProviderHealthy();

  return image;
}

/** Reference-based generation via one or more input images (gpt-image /images/edits). */
export async function editImageBase64(input: { prompt: string; images: string[]; size?: string }) {
  if (resolveImageProvider() === "mock") {
    return MOCK_IMAGE_BASE64;
  }

  const { client, model } = imageClient();

  const response = await client.images.edit({
    model,
    prompt: input.prompt,
    image: await Promise.all(
      input.images.map((data, index) => toFile(Buffer.from(data, "base64"), `input-${index + 1}.png`, { type: "image/png" })),
    ),
    n: 1,
    ...(input.size ? { size: input.size as "1024x1024" | "1024x1536" | "1536x1024" } : {}),
    output_format: "png",
  });

  const image = await toBase64(response.data?.[0]);

  if (!image) {
    throw new Error("OpenAI did not return an edited image.");
  }

  markImageProviderHealthy();

  return image;
}
