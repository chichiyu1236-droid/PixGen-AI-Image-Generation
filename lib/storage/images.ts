import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const BUCKET = "generated-images";

export async function uploadGeneratedImage(
  supabase: SupabaseClient<Database>,
  input: { userId: string; base64Image: string; contentType?: string },
) {
  const contentType = input.contentType ?? "image/png";
  const bytes = Buffer.from(input.base64Image, "base64");
  const storagePath = `${input.userId}/${crypto.randomUUID()}.png`;

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Unable to upload image: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    storagePath,
    imageUrl: data.publicUrl,
  };
}
