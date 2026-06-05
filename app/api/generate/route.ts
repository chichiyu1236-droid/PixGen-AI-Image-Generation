import { NextResponse } from "next/server";
import { aspectRatios } from "@/lib/prompts/options";
import { buildImagePrompt } from "@/lib/prompts/builder";
import { generateRequestSchema } from "@/lib/validation/generate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureUserProfile } from "@/lib/auth/ensure-profile";
import { getProfileCredits } from "@/lib/auth/profile";
import { generateImageBase64 } from "@/lib/openai/images";
import { getImageProviderErrorReason, getImageProviderHealth, markImageProviderUnavailable } from "@/lib/openai/provider-health";
import { ensureGeneratedImagesBucket, uploadGeneratedImage } from "@/lib/storage/images";

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
  let base64Image: string;

  try {
    base64Image = await generateImageBase64({
      prompt: finalPrompt,
      size: aspectRatios[parsed.data.aspectRatio].size,
    });
  } catch (error) {
    const providerErrorReason = getImageProviderErrorReason(error);

    if (providerErrorReason) {
      markImageProviderUnavailable(providerErrorReason);
      console.error(error);
      return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });
    }

    console.error(error);
    return NextResponse.json({ error: "image_generation_failed" }, { status: 500 });
  }

  const uploaded = await uploadGeneratedImage(admin, { userId: user.id, base64Image });

  const { data: generation, error } = await admin.rpc("record_successful_generation", {
    p_user_id: user.id,
    p_image_url: uploaded.imageUrl,
    p_storage_path: uploaded.storagePath,
    p_final_prompt: finalPrompt,
    p_input_subject: parsed.data.subject,
    p_input_extra: parsed.data.extra,
    p_options_json: parsed.data,
    p_aspect_ratio: parsed.data.aspectRatio,
  });

  if (error) {
    return NextResponse.json({ error: "generation_record_failed" }, { status: 500 });
  }

  return NextResponse.json({ generation });
}
