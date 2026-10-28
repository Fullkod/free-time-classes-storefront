import type { Subject } from "@/types/subject";
import { createClient } from "../client";

const supabase = createClient();

const SUBJECTS_TTL_MS = 10 * 60_000;
let subjectsCache: { promise: Promise<Subject[]>; at: number } | null = null;

/**
 * Get all subjects. The list is shared in memory for 10 minutes so tabs that
 * remount do not refetch it (F078); pass `{ fresh: true }` after creating or
 * deleting a subject.
 */
export function getSubjects(options?: { fresh?: boolean }): Promise<Subject[]> {
  if (!options?.fresh && subjectsCache && Date.now() - subjectsCache.at < SUBJECTS_TTL_MS) {
    return subjectsCache.promise;
  }
  const promise = (async () => {
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, language_id, description, icon, created_at, updated_at")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data || []) as Subject[];
  })();
  subjectsCache = { promise, at: Date.now() };
  // A failed load is not kept, so the next call retries.
  promise.catch(() => {
    if (subjectsCache?.promise === promise) subjectsCache = null;
  });
  return promise;
}
