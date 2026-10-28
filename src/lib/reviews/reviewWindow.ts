import { addMinutesToLessonTimestamp, nowAsLessonTimestamp } from "@/lib/datetime/lessonTime";

// Product decision (FRE0007, F036): a completed class can be reviewed for 30
// days. Mirrors the reviews_student_insert policy (migration 045).
export const REVIEW_WINDOW_DAYS = 30;

/** True while a class that started at `start` (Madrid wall-clock) can be reviewed. */
export function isWithinReviewWindow(start: string | null | undefined): boolean {
  if (!start) return false;
  const now = nowAsLessonTimestamp();
  const windowStart = addMinutesToLessonTimestamp(now, -REVIEW_WINDOW_DAYS * 24 * 60);
  const normalized = String(start).replace(" ", "T").slice(0, 19);
  return normalized >= windowStart && normalized <= now;
}
