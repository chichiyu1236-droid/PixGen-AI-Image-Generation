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
};

export function buildImagePrompt(input: PromptInput) {
  const lines = [
    `Create a high-quality ${imageTypes[input.imageType].prompt} in ${styles[input.style].prompt} style.`,
    `Main subject: ${input.subject.trim()}.`,
    `Scene and environment: ${scenes[input.scene].prompt}.`,
    `Composition: ${aspectRatios[input.aspectRatio].prompt}, ${whitespaceOptions[input.whitespace].prompt}.`,
  ];

  const extra = input.extra?.trim();
  if (extra) {
    lines.push(`Additional requirements: ${extra}.`);
  }

  lines.push("The image should be commercially usable, visually polished, coherent, and free of text unless explicitly requested.");

  return lines.join("\n");
}
