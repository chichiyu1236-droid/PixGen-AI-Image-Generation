import "server-only";

import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { getServerEnv, resolveImageProvider } from "@/lib/env";

/** 1x1 transparent PNG used by the mock image provider (dev/test only). */
const MOCK_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function imageClient() {
  const env = getServerEnv();

  return {
    client: new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL }),
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
  });

  const image = response.data?.[0]?.b64_json;

  if (!image) {
    throw new Error("OpenAI did not return an image.");
  }

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
  });

  const image = response.data?.[0]?.b64_json;

  if (!image) {
    throw new Error("OpenAI did not return an edited image.");
  }

  return image;
}
