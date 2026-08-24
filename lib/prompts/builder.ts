import type { ReferenceImageInput } from "@/lib/validation/generate";
import {
  aspectRatios,
  imageTypes,
  scenes,
  styles,
  whitespaceOptions,
  type AspectRatioId,
  type ImageTypeId,
  type SceneId,
  type StyleId,
  type WhitespaceId,
} from "@/lib/prompts/options";

export type PromptInput = {
  imageType: ImageTypeId;
  aspectRatio: AspectRatioId;
  style: StyleId;
  scene: SceneId;
  whitespace: WhitespaceId;
  subject: string;
  extra?: string;
  referenceImages?: ReferenceImageInput[];
};

export function buildImagePrompt(input: PromptInput) {
  const lines: string[] = [];
  const referenceCount = input.referenceImages?.length ?? 0;

  if (referenceCount > 0) {
    const plural = referenceCount > 1;
    lines.push(
      `Visual references: ${referenceCount} reference image${plural ? "s are" : " is"} attached; use ${plural ? "them" : "it"} as the visual basis for a brand-new composition, not as content to edit, crop, or collage.`,
      "Preserve the recognizable identity of the referenced subject: silhouette, colors, materials, and any text or logo must stay faithful to the reference.",
    );
  }

  lines.push(
    `Create a high-quality ${imageTypes[input.imageType].prompt} in ${styles[input.style].prompt} style.`,
    `Main subject: ${input.subject.trim()}.`,
    `Scene and environment: ${scenes[input.scene].prompt}.`,
    `Composition: ${aspectRatios[input.aspectRatio].prompt}, ${whitespaceOptions[input.whitespace].prompt}.`,
  );

  const extra = input.extra?.trim();
  if (extra) {
    lines.push(`Additional requirements: ${extra}.`);
  }

  lines.push("The image should be commercially usable, visually polished, coherent, and free of text unless explicitly requested.");

  return lines.join("\n");
}
