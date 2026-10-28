import type { LessonStatus, LessonWithRelations } from "@/types/lesson";
import { createClient } from "../client";

const supabase = createClient();

export interface LessonFilters {
  status?: LessonStatus;
  scheduled_date_time_gte?: string; // ISO datetime string
  scheduled_date_time_lte?: string; // ISO datetime string
  tutor_id?: string;
  student_id?: string;
  subject_id?: number;
}

/**
 * Get lesson by ID with relations
 */
export async function getLessonWithRelations(
  id: number
): Promise<LessonWithRelations | null> {
  const { data, error } = await supabase
    .from("lessons")
    .select(
      `
      *,
      subject:subjects (
        id,
        name,
        description,
        icon
      ),
      tutor:tutor_profiles!lessons_tutor_id_fkey (
        id,
        user:users!tutor_profiles_id_fkey (
          id,
          username,
          profile_picture
        )
      ),
      student:student_profiles!lessons_student_id_fkey (
        id,
        user:users!student_profiles_id_fkey (
          id,
          username
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data as LessonWithRelations;
}

/**
 * Delete lesson
 */
export async function deleteLesson(id: number): Promise<void> {
  const { error } = await supabase.from("lessons").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

/**
 * Lesson status choices (constants, no longer from backend)
 */
export const LESSON_STATUS_CHOICES: Array<{
  value: LessonStatus;
  displayName: string;
}> = [
  { value: "available", displayName: "Available" },
  { value: "scheduled", displayName: "Scheduled" },
  { value: "in_progress", displayName: "In Progress" },
  { value: "completed", displayName: "Completed" },
  { value: "cancelled", displayName: "Cancelled" },
];
