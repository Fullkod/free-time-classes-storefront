import {
  addMinutesToLessonTimestamp,
  dateAsLessonTimestamp,
  nowAsLessonTimestamp,
} from "@/lib/datetime/lessonTime";

// Product decision (FRE0007, F014): a pending request expires 48 h after it
// was made, or 2 h before the class starts, whichever comes first.
export const PENDING_TTL_MINUTES = 48 * 60;
export const PENDING_CUTOFF_BEFORE_START_MINUTES = 120;

export interface PendingExpiryInput {
  created_at: string;
  /** Madrid wall-clock start: the lesson's, or the requested one for custom requests. */
  start: string | null;
}

/** Madrid wall-clock moment at which a pending booking expires. */
export function pendingExpiresAt({ created_at, start }: PendingExpiryInput): string {
  const byTtl = dateAsLessonTimestamp(
    new Date(new Date(created_at).getTime() + PENDING_TTL_MINUTES * 60_000)
  );
  if (!start) return byTtl;
  const byStart = addMinutesToLessonTimestamp(
    String(start).replace(" ", "T"),
    -PENDING_CUTOFF_BEFORE_START_MINUTES
  );
  return byStart < byTtl ? byStart : byTtl;
}

export function isPendingExpired(input: PendingExpiryInput): boolean {
  return pendingExpiresAt(input) <= nowAsLessonTimestamp();
}
