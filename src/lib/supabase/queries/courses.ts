import type { Course, CourseWithRelations } from "@/types/course";
import { resolveCourseTutorUser } from "@/lib/supabase/course-tutor";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../client";

const browserClient = createClient();

const MAX_SEARCH_LENGTH = 80;

/**
 * Keeps letters, digits, spaces, apostrophes and hyphens. Commas, dots,
 * parentheses or wildcards would otherwise break the PostgREST `or()` filter.
 */
function sanitizeSearch(raw: string | undefined): string {
  return (raw ?? "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}

export interface CourseFilters {
  tutor_id?: string;
  subject_id?: number;
  level?: "beginner" | "intermediate" | "advanced";
  is_active?: boolean;
  search?: string; // Search in title or description

  // Numeric range filters
  min_price_per_session?: number;
  max_price_per_session?: number;
  min_duration_minutes?: number;
  max_duration_minutes?: number;
  min_rating?: number;

  /** Max rows to return. */
  limit?: number;

  // Sorting
  sort?:
    | "created_desc"
    | "price_asc"
    | "price_desc"
    | "duration_asc"
    | "duration_desc";
}

/**
 * Get all courses with optional filters
 */
/** Every course column, listed explicitly (F091: no `select("*")`). */
export const COURSE_COLUMNS =
  "id, tutor_id, subject_id, title, description, price_per_session, duration_minutes, max_students, level, is_active, created_at, updated_at, rating, total_reviews, cover_image";

/** Most courses a catalog list returns at once (initial render and the filter API). */
export const CATALOG_MAX_RESULTS = 100;

/**
 * Get courses with relations (tutor, subject)
 */
export async function getCoursesWithRelations(
  filters?: CourseFilters,
  client: SupabaseClient = browserClient
): Promise<CourseWithRelations[]> {
  let query = client.from("courses").select(
    `
      ${COURSE_COLUMNS},
      tutor_profile:tutor_profiles!courses_tutor_id_fkey (
        id,
        user:users!tutor_profiles_id_fkey (
          id,
          username,
          profile_picture
        )
      ),
      subject:subjects (
        id,
        name,
        description,
        icon
      )
    `
  );

  if (filters?.tutor_id) {
    query = query.eq("tutor_id", filters.tutor_id);
  }

  if (filters?.subject_id) {
    query = query.eq("subject_id", filters.subject_id);
  }

  if (filters?.level) {
    query = query.eq("level", filters.level);
  }

  if (filters?.is_active !== undefined) {
    query = query.eq("is_active", filters.is_active);
  }

  const search = sanitizeSearch(filters?.search);
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  if (filters?.min_price_per_session !== undefined) {
    query = query.gte("price_per_session", filters.min_price_per_session);
  }
  if (filters?.max_price_per_session !== undefined) {
    query = query.lte("price_per_session", filters.max_price_per_session);
  }

  if (filters?.min_duration_minutes !== undefined) {
    query = query.gte("duration_minutes", filters.min_duration_minutes);
  }
  if (filters?.max_duration_minutes !== undefined) {
    query = query.lte("duration_minutes", filters.max_duration_minutes);
  }

  if (filters?.min_rating !== undefined) {
    query = query.gte("rating", filters.min_rating);
  }

  if (filters?.limit !== undefined) {
    query = query.limit(filters.limit);
  }

  const sort = filters?.sort ?? "created_desc";
  const { data, error } =
    sort === "price_asc"
      ? await query.order("price_per_session", { ascending: true })
      : sort === "price_desc"
        ? await query.order("price_per_session", { ascending: false })
        : sort === "duration_asc"
          ? await query.order("duration_minutes", { ascending: true })
          : sort === "duration_desc"
            ? await query.order("duration_minutes", { ascending: false })
            : await query.order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data || []) as unknown as Array<
    Course & {
      tutor_profile?: {
        user?: {
          id: string;
          username: string;
          profile_picture?: string | null;
        } | null;
      } | null;
      subject?: CourseWithRelations["subject"];
    }
  >;

  return rows.map((row) => ({
    ...row,
    tutor: resolveCourseTutorUser(row.tutor_profile),
  })) as CourseWithRelations[];
}

async function courseApi<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || "Course request failed.");
  return json;
}

/**
 * Create a new course (through /api/courses: validated server-side and the
 * catalog cache is refreshed there).
 */
export async function createCourse(
  courseData: Omit<Course, "id" | "created_at" | "updated_at">
): Promise<Course> {
  return courseApi<Course>("/api/courses", {
    method: "POST",
    body: JSON.stringify(courseData),
  });
}

/**
 * Update course
 */
export async function updateCourse(
  id: number | string,
  updates: Partial<Omit<Course, "id" | "created_at">>
): Promise<Course> {
  return courseApi<Course>(`/api/courses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/**
 * Delete course. Courses with classes or bookings are archived instead.
 */
export async function deleteCourse(
  id: number | string
): Promise<{ archived: boolean }> {
  return courseApi<{ archived: boolean }>(`/api/courses/${id}`, { method: "DELETE" });
}

/**
 * Get courses by tutor ID
 */
export async function getCoursesByTutor(
  tutorId: string
): Promise<CourseWithRelations[]> {
  return getCoursesWithRelations({ tutor_id: tutorId });
}
