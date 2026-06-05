import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const GENERATED_IMAGES_BUCKET = "generated-images";

export async function ensureGeneratedImagesBucket(supabase: SupabaseClient<Database>) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(`Unable to check image bucket: ${listError.message}`);
  }

  if (buckets.some((bucket) => bucket.name === GENERATED_IMAGES_BUCKET)) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(GENERATED_IMAGES_BUCKET, {
    public: true,
    allowedMimeTypes: ["image/png"],
    fileSizeLimit: "10MB",
  });

  if (createError) {
    throw new Error(`Unable to create image bucket: ${createError.message}`);
  }
}

export async function uploadGeneratedImage(
  supabase: SupabaseClient<Database>,
  input: { userId: string; base64Image: string; contentType?: string },
) {
  const contentType = input.contentType ?? "image/png";
  const bytes = Buffer.from(input.base64Image, "base64");
  const storagePath = `${input.userId}/${crypto.randomUUID()}.png`;

  const { error } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Unable to upload image: ${error.message}`);
  }

  const { data } = supabase.storage.from(GENERATED_IMAGES_BUCKET).getPublicUrl(storagePath);

  return {
    storagePath,
    imageUrl: data.publicUrl,
  };
}
