type CreditsClient = {
  from: (table: "profiles") => {
    select: (columns: "credits") => {
      eq: (column: "id", value: string) => {
        single: () => Promise<{
          data: { credits: number } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export async function getProfileCredits(supabase: unknown, userId: string) {
  const client = supabase as CreditsClient;
  const { data, error } = await client
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(`Unable to load credits: ${error.message}`);
  }

  if (!data) {
    throw new Error("Unable to load credits: profile not found");
  }

  return data.credits;
}
