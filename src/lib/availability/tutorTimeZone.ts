import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTimeZone } from "@/lib/datetime/zonedTime";

/**
 * Zone of the tutor's agenda (PRP-002): tutor_profiles.timezone, or Madrid
 * when it is not set or not valid.
 */
export async function loadTutorTimeZone(admin: SupabaseClient, tutorId: string): Promise<string> {
  const { data } = await admin
    .from("tutor_profiles")
    .select("timezone")
    .eq("id", tutorId)
    .maybeSingle();
  return resolveTimeZone((data?.timezone as string | null | undefined) ?? null);
}
