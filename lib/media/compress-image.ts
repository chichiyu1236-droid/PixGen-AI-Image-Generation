const MAX_REFERENCE_EDGE = 1024;
const JPEG_QUALITY = 0.85;

export type ReferenceImageFile = {
  id: string;
  previewUrl: string;
  base64: string;
  generationId?: string;
};

/** Downscale so the longest edge fits the cap; never upscale small images. */
export function targetDimensions(width: number, height: number, maxEdge = MAX_REFERENCE_EDGE): { width: number; height: number } {
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / Math.max(width, height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Compress a local/remote image blob to JPEG and return base64 without the data URL prefix. */
export async function compressImageToBase64(source: Blob): Promise<string> {
  const bitmap = await createImageBitmap(source);
  const { width, height } = targetDimensions(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("canvas_unavailable");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
