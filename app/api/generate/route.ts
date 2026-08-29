import { NextResponse } from "next/server";
import { aspectRatios } from "@/lib/prompts/options";
import { buildImagePrompt } from "@/lib/prompts/builder";
import { generateRequestSchema } from "@/lib/validation/generate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getProfileCredits } from "@/lib/auth/profile";
import { editImageBase64, generateImageBase64 } from "@/lib/openai/images";
import { getImageProviderErrorReason, getImageProviderHealth, markImageProviderFailure } from "@/lib/openai/provider-health";
import { GENERATED_IMAGES_BUCKET, ensureGeneratedImagesBucket, uploadGeneratedImage } from "@/lib/storage/images";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const parsed = generateRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let credits: number;

  try {
    await ensureUserProfile(user);
    credits = await getProfileCredits(admin, user.id);
  } catch {
    return NextResponse.json({ error: "profile_unavailable" }, { status: 500 });
  }

  if (credits < 1) {
    return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
  }

  const providerHealth = getImageProviderHealth();

  if (!providerHealth.ok) {
    return NextResponse.json({ error: "provider_unavailable", retryAfterSeconds: providerHealth.retryAfterSeconds }, { status: 503 });
  }

  try {
    await ensureGeneratedImagesBucket(admin);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }

  const finalPrompt = buildImagePrompt(parsed.data);
  const referenceImages = parsed.data.referenceImages;
  const hasReferences = referenceImages.length > 0;
  const size = aspectRatios[parsed.data.aspectRatio].size;
  let base64Image: string;

  try {
    base64Image = hasReferences
      ? await editImageBase64({
          prompt: finalPrompt,
          images: referenceImages.map((image) => image.data),
          size,
        })
      : await generateImageBase64({
          prompt: finalPrompt,
          size,
        });
  } catch (error) {
    const providerErrorReason = getImageProviderErrorReason(error);

    if (providerErrorReason) {
      markImageProviderFailure(providerErrorReason);
      console.error(error);
      return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });
    }

    console.error(error);
    return NextResponse.json({ error: "image_generation_failed" }, { status: 500 });
  }

  let uploaded: Awaited<ReturnType<typeof uploadGeneratedImage>>;

  try {
    uploaded = await uploadGeneratedImage(admin, { userId: user.id, base64Image });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }

  // Reference images are one-shot inputs: persist only source metadata, never the base64 payloads.
  const referenceMetadata = referenceImages.map((image) =>
    image.generationId ? { source: "history", generationId: image.generationId } : { source: "upload" },
  );
  const parentGenerationId = referenceImages.find((image) => image.generationId)?.generationId ?? null;

  const { data: generation, error } = await admin.rpc("record_successful_generation", {
    p_user_id: user.id,
    p_image_url: uploaded.imageUrl,
    p_storage_path: uploaded.storagePath,
    p_final_prompt: finalPrompt,
    p_input_subject: parsed.data.subject,
    p_input_extra: parsed.data.extra,
    p_options_json: { ...parsed.data, referenceImages: referenceMetadata },
    p_aspect_ratio: parsed.data.aspectRatio,
    p_parent_generation_id: parentGenerationId ?? undefined,
  });

  if (error) {
    console.error(error);

    // The image was uploaded but the charge failed (e.g. a concurrent request
    // spent the last credit) - remove the orphaned object and report honestly.
    await admin.storage.from(GENERATED_IMAGES_BUCKET).remove([uploaded.storagePath]).catch(() => undefined);

    if (error.message.includes("insufficient_credits")) {
      return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
    }

    return NextResponse.json({ error: "generation_record_failed" }, { status: 500 });
  }

  const remainingCredits = await getProfileCredits(admin, user.id).catch(() => null);

  return NextResponse.json({ generation, remainingCredits });
}
