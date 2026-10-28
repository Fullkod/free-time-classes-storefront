import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNotification, markRequestNotificationsRead } from "@/lib/notifications";
import { releaseLesson } from "@/lib/bookings/releaseLesson";
import { nowAsLessonTimestamp } from "@/lib/datetime/lessonTime";
import { pendingExpiresAt } from "@/lib/bookings/pendingExpiry";

export interface ExpirePendingResult {
  bookingsExpired: number;
  error?: string;
}

type PendingRow = {
  id: number;
  student_id: string;
  tutor_id: string;
  lesson_id: number | null;
  created_at: string;
  requested_scheduled_date_time: string | null;
  lesson: { scheduled_date_time: string } | { scheduled_date_time: string }[] | null;
};

/**
 * Expires the pending bookings that went past their deadline: the booking
 * becomes `expired`, its lesson is released and the student is told (only
 * when the class is still ahead; stale backlog expires silently).
 *
 * Idempotent and race-safe with respondToBooking (updates are conditioned on
 * `status = 'pending'`). Runs in the daily cron and, scoped to one user or
 * booking, before pending lists are read or a request is answered, because
 * the daily cron alone is too coarse for the "2 h before" cutoff.
 */
export async function expirePendingBookings(
  admin: SupabaseClient,
  scope: { tutorId?: string; studentId?: string; bookingId?: number } = {}
): Promise<ExpirePendingResult> {
  let query = admin
    .from("bookings")
    .select(
      "id, student_id, tutor_id, lesson_id, created_at, requested_scheduled_date_time, lesson:lessons(scheduled_date_time)"
    )
    .eq("status", "pending");
  if (scope.tutorId) query = query.eq("tutor_id", scope.tutorId);
  if (scope.studentId) query = query.eq("student_id", scope.studentId);
  if (scope.bookingId) query = query.eq("id", scope.bookingId);

  const { data, error } = await query;
  if (error) return { bookingsExpired: 0, error: error.message };

  const now = nowAsLessonTimestamp();
  const due = ((data || []) as PendingRow[])
    .map((row) => {
      const lesson = Array.isArray(row.lesson) ? row.lesson[0] : row.lesson;
      const start = lesson?.scheduled_date_time ?? row.requested_scheduled_date_time;
      return { row, start: start ? String(start).replace(" ", "T").slice(0, 19) : null };
    })
    .filter(({ row, start }) => pendingExpiresAt({ created_at: row.created_at, start }) <= now);

  if (due.length === 0) return { bookingsExpired: 0 };

  const tutorIds = [...new Set(due.map(({ row }) => row.tutor_id))];
  const { data: tutors } = await admin.from("users").select("id, username").in("id", tutorIds);
  const tutorName = new Map((tutors || []).map((u) => [u.id as string, u.username as string | null]));

  let expired = 0;
  for (const { row, start } of due) {
    const { data: updated, error: updateError } = await admin
      .from("bookings")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (updateError) {
      console.error("[expirePendingBookings] update failed:", row.id, updateError.message);
      continue;
    }
    if (!updated?.length) continue; // answered meanwhile
    expired += 1;
    await markRequestNotificationsRead(admin, row.id);

    if (row.lesson_id) {
      await releaseLesson(admin, row.lesson_id, {
        isCustomRequest: row.requested_scheduled_date_time != null,
      });
    }

    if (start && start > now) {
      await insertNotification(admin, {
        userId: row.student_id,
        type: "booking_expired",
        title: "Solicitud caducada",
        body: `${tutorName.get(row.tutor_id) ?? "Tu tutor"} no respondió a tiempo a tu solicitud de clase. Puedes reservar otra hora.`,
        data: {
          booking_id: row.id,
          lesson_id: row.lesson_id,
          scheduled_date_time: start,
          actor_name: tutorName.get(row.tutor_id) ?? null,
        },
      });
    }
  }

  return { bookingsExpired: expired };
}
