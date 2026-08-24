import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { deflateSync } from "node:zlib";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function projectRef(url: string): string {
  return new URL(url).hostname.split(".")[0];
}

function authCookie(session: unknown): { name: string; value: string; domain: string; path: string } {
  return {
    name: `sb-${projectRef(supabaseUrl)}-auth-token`,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    domain: "localhost",
    path: "/",
  };
}

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A valid 64x64 RGB PNG (filter-less scanlines, gradient fill) for upload flows. */
function makeReferencePng(size = 64): Buffer {
  const rowLength = 1 + size * 3;
  const raw = Buffer.alloc(size * rowLength);

  for (let y = 0; y < size; y++) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0;

    for (let x = 0; x < size; x++) {
      const i = rowStart + 1 + x * 3;
      raw[i] = (x * 4) % 256;
      raw[i + 1] = (y * 4) % 256;
      raw[i + 2] = 128;
    }
  }

  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) {
      c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([len, Buffer.from(type), data, tail]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const referencePng = makeReferencePng();

test.describe("Classic reference images", () => {
  const stamp = Date.now();
  const email = `e2e-ref-${stamp}@example.com`;
  const password = `E2e!Ref${stamp}`;
  let userId = "";

  test.beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("upload a reference, generate, then reuse the result from history with the 3-image cap", async ({ page }) => {
    // Cold Next.js compiles plus remote-Supabase latency exceed the default 30s.
    test.slow();
    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { session } } = await anon.auth.signInWithPassword({ email, password });
    expect(session).toBeTruthy();
    await page.context().addCookies([authCookie(session)]);

    // 1. Local upload drives the reference-based generation flow.
    await page.goto("/generate?mode=classic");
    await expect(page.getByRole("heading", { name: "告诉我们你想要什么" })).toBeVisible();

    await page.setInputFiles('input[type="file"]', [
      { name: "reference.png", mimeType: "image/png", buffer: referencePng },
    ]);
    await expect(page.getByAltText("参考图")).toBeVisible();

    await page.getByPlaceholder("例如：一瓶高端护肤精华，透明玻璃瓶，银色瓶盖").fill("照着参考图里的主体做一张广告图");
    await page.getByRole("button", { name: "生成图片" }).click();
    await expect(page.getByAltText("生成图片结果")).toBeVisible({ timeout: 120_000 });

    // 2. The finished generation can be reused as a reference from history.
    await page.goto("/history");
    await expect(page.getByText(/共 \d+ 张图片/)).toBeVisible();
    await page.getByRole("link", { name: "用作参考图" }).first().click();
    await page.waitForURL(/\/generate\?mode=classic&ref=/);

    // The history image is prefilled into the reference slot (fetch + compress).
    await expect(page.getByAltText("参考图")).toBeVisible({ timeout: 60_000 });

    // 3. Adding more uploads respects the 3-image cap.
    await page.setInputFiles('input[type="file"]', [
      { name: "extra-1.png", mimeType: "image/png", buffer: referencePng },
      { name: "extra-2.png", mimeType: "image/png", buffer: referencePng },
    ]);
    await expect(page.getByText("已达 3 张上限")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByAltText("参考图")).toHaveCount(3);
  });

  test("a foreign reference id is silently ignored", async ({ page }) => {
    test.slow();
    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { session } } = await anon.auth.signInWithPassword({ email, password });
    await page.context().addCookies([authCookie(session)]);

    await page.goto("/generate?mode=classic&ref=00000000-0000-0000-0000-000000000000");
    await expect(page.getByRole("heading", { name: "告诉我们你想要什么" })).toBeVisible();
    await expect(page.getByAltText("参考图")).toHaveCount(0);
    await expect(page.getByText("参考与补充")).toBeVisible();
  });
});
