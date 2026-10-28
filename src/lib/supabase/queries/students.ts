import type { StudentProfile } from "@/types/student";
import { createClient } from "../client";

const supabase = createClient();

/**
 * Update student profile
 */
export async function updateStudentProfile(
  id: string,
  updates: Partial<StudentProfile>
): Promise<StudentProfile> {
  const { data, error } = await supabase
    .from("student_profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as StudentProfile;
}
