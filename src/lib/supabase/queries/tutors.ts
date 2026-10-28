import type { Subject } from "@/types/subject";
import type { TutorProfile, TutorSubject } from "@/types/tutor";
import type { User } from "@/types/user";
import { createClient } from "../client";

const supabase = createClient();

/**
 * Get tutor profile with user data
 */
export type TutorDisplayRow = {
  tutorId: string;
  user: Pick<User, "id" | "username" | "profile_picture">;
};

/**
 * Update tutor profile
 */
export async function updateTutorProfile(
  id: string,
  updates: Partial<TutorProfile>
): Promise<TutorProfile> {
  const { data, error } = await supabase
    .from("tutor_profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as TutorProfile;
}

/**
 * Get detailed subjects taught by a tutor
 */
export async function getTutorSubjectDetails(
  tutorId: string
): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("tutor_subjects")
    .select(
      `
      subject:subjects (
        id,
        name,
        description,
        icon,
        created_at,
        updated_at
      )
    `
    )
    .eq("tutor_id", tutorId);

  if (error) {
    throw error;
  }

  const rows = (data || []) as { subject: Subject[] | null }[];
  return rows
    .flatMap((row) => row.subject || [])
    .filter((subject): subject is Subject => subject !== null);
}

/**
 * Add subject to tutor
 */
export async function addTutorSubject(
  tutorId: string,
  subjectId: number
): Promise<TutorSubject> {
  const { data, error } = await supabase
    .from("tutor_subjects")
    .insert({ tutor_id: tutorId, subject_id: subjectId })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as TutorSubject;
}

/**
 * Remove subject from tutor
 */
export async function removeTutorSubject(
  tutorId: string,
  subjectId: number
): Promise<void> {
  const { error } = await supabase
    .from("tutor_subjects")
    .delete()
    .eq("tutor_id", tutorId)
    .eq("subject_id", subjectId);

  if (error) {
    throw error;
  }
}
