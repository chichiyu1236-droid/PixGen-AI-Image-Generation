import { z } from "zod";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";

const enumKeys = <T extends Record<string, unknown>>(value: T) => Object.keys(value) as [keyof T & string, ...(keyof T & string)[]];

export const generateRequestSchema = z.object({
  imageType: z.enum(enumKeys(imageTypes)),
  aspectRatio: z.enum(enumKeys(aspectRatios)),
  style: z.enum(enumKeys(styles)),
  scene: z.enum(enumKeys(scenes)),
  whitespace: z.enum(enumKeys(whitespaceOptions)),
  subject: z.string().trim().min(2).max(500),
  extra: z.string().trim().max(800).optional().default(""),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
