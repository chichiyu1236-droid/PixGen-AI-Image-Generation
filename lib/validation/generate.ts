import { z } from "zod";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";

const enumKeys = <T extends Record<string, unknown>>(value: T) => Object.keys(value) as [keyof T & string, ...(keyof T & string)[]];

export const REFERENCE_IMAGE_LIMITS = {
  maxCount: 3,
  minDataChars: 100,
  maxDataChars: 1_500_000,
  maxTotalDataChars: 3_600_000,
} as const;

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

const referenceImageSchema = z.object({
  data: z
    .string()
    .min(REFERENCE_IMAGE_LIMITS.minDataChars)
    .max(REFERENCE_IMAGE_LIMITS.maxDataChars)
    .regex(base64Pattern),
  generationId: z.string().uuid().optional(),
});

export const generateRequestSchema = z
  .object({
    imageType: z.enum(enumKeys(imageTypes)),
    aspectRatio: z.enum(enumKeys(aspectRatios)),
    style: z.enum(enumKeys(styles)),
    scene: z.enum(enumKeys(scenes)),
    whitespace: z.enum(enumKeys(whitespaceOptions)),
    subject: z.string().trim().min(2).max(500),
    extra: z.string().trim().max(800).optional().default(""),
    referenceImages: z.array(referenceImageSchema).max(REFERENCE_IMAGE_LIMITS.maxCount).optional().default([]),
  })
  .superRefine((value, ctx) => {
    const totalDataChars = value.referenceImages.reduce((total, image) => total + image.data.length, 0);

    if (totalDataChars > REFERENCE_IMAGE_LIMITS.maxTotalDataChars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referenceImages"],
        message: "reference_images_too_large",
      });
    }
  });

export type ReferenceImageInput = z.infer<typeof referenceImageSchema>;

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
