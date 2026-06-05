import "server-only";

import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

export async function generateImageBase64(input: { prompt: string; size: string }) {
  const env = getServerEnv();
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  const response = await openai.images.generate({
    model: env.OPENAI_IMAGE_MODEL,
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
