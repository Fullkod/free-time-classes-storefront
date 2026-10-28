import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadBookableCourse,
  loadOpenStartTimes,
} from "@/lib/availability/loadOpenStartTimes";
import { findScheduleConflict } from "@/lib/bookings/scheduleConflict";
import { insertNotification } from "@/lib/notifications";
import { addMinutesToLessonTimestamp } from "@/lib/datetime/lessonTime";

export type CourseBookingResult = {
  httpStatus: number;
  payload: Record<string, unknown>;
};

const START_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Books `course` at `start` (Madrid wall-clock) for a student (PRP-001).
 * The class row is created now, copying the course's subject, price and
 * duration; the booking starts as `pending` for the tutor to confirm.
 * The start must be one of the course's open start times.
 */
export async function requestCourseBooking(
  admin: SupabaseClient,
  args: { studentId: string; courseId: number; start: string }
): Promise<CourseBookingResult> {
  if (!START_RE.test(args.start)) {
    return { httpStatus: 400, payload: { error: "Invalid start.", code: "invalid_start" } };
  }
  const start = `${args.start.slice(0, 16)}:00`;

  const course = await loadBookableCourse(admin, args.courseId);
  if (!course) {
    return { httpStatus: 404, payload: { error: "Course not found.", code: "course_not_found" } };
  }
  if (course.tutor_id === args.studentId) {
    return {
      httpStatus: 409,
      payload: { error: "You cannot book your own course.", code: "own_course" },
    };
  }

  const day = start.slice(0, 10);
  const open = await loadOpenStartTimes(admin, course, { fromDate: day, toDate: day });
  if (!open.includes(start)) {
    return {
      httpStatus: 409,
      payload: { error: "This time is no longer available.", code: "slot_unavailable" },
    };
  }

  const conflict = await findScheduleConflict(admin, {
    tutorId: course.tutor_id,
    studentId: args.studentId,
    start,
    durationMinutes: course.duration_minutes,
  });
  if (conflict) {
    return {
      httpStatus: 409,
      payload: {
        error:
          conflict === "tutor_busy"
            ? "The tutor already has a class at that time."
            : "You already have a class at that time.",
        code: conflict,
      },
    };
  }

  // Transition: pre-generated free slots of the old model that overlap this
  // class are withdrawn so they cannot be booked twice.
  const end = addMinutesToLessonTimestamp(start, course.duration_minutes);
  const { data: legacySlots } = await admin
    .from("lessons")
    .select("id, scheduled_date_time, duration_minutes")
    .eq("tutor_id", course.tutor_id)
    .eq("status", "available")
    .gte("scheduled_date_time", addMinutesToLessonTimestamp(start, -240))
    .lt("scheduled_date_time", end);
  const overlapping = (legacySlots ?? [])
    .filter((slot) => {
      const slotStart = String(slot.scheduled_date_time).replace(" ", "T").slice(0, 19);
      const slotEnd = addMinutesToLessonTimestamp(slotStart, slot.duration_minutes ?? 0);
      return slotStart < end && slotEnd > start;
    })
    .map((slot) => slot.id as number);
  if (overlapping.length > 0) {
    await admin
      .from("lessons")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("id", overlapping)
      .eq("status", "available");
  }

  const { data: lesson, error: lessonError } = await admin
    .from("lessons")
    .insert({
      tutor_id: course.tutor_id,
      student_id: args.studentId,
      subject_id: course.subject_id,
      course_id: course.id,
      price: course.price_per_session,
      duration_minutes: course.duration_minutes,
      scheduled_date_time: start,
      status: "scheduled",
    })
    .select("id")
    .single();

  // 23P01: lessons_tutor_no_overlap, 23505: lessons_tutor_start_live_key —
  // a concurrent request took this time first.
  if (lessonError?.code === "23P01" || lessonError?.code === "23505") {
    return {
      httpStatus: 409,
      payload: { error: "This time is no longer available.", code: "slot_unavailable" },
    };
  }
  if (lessonError || !lesson) {
    console.error("[requestCourseBooking] lesson insert failed:", lessonError);
    return { httpStatus: 400, payload: { error: "Failed to create the class." } };
  }

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .insert({
      student_id: args.studentId,
      tutor_id: course.tutor_id,
      lesson_id: lesson.id,
      course_id: course.id,
      requested_date: new Date().toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  if (bookingError || !booking) {
    await admin.from("lessons").delete().eq("id", lesson.id);
    console.error("[requestCourseBooking] booking insert failed:", bookingError);
    return { httpStatus: 400, payload: { error: "Failed to create booking." } };
  }

  const { data: studentUser } = await admin
    .from("users")
    .select("username")
    .eq("id", args.studentId)
    .single();

  await insertNotification(admin, {
    userId: course.tutor_id,
    type: "booking_request",
    title: "Nueva solicitud de clase",
    body: `${studentUser?.username ?? "Un estudiante"} ha solicitado una clase de «${course.title}» (${course.duration_minutes} min) contigo.`,
    data: {
      booking_id: booking.id,
      lesson_id: lesson.id,
      course_id: course.id,
      student_id: args.studentId,
      scheduled_date_time: start,
      actor_name: studentUser?.username ?? null,
      subject_name: course.title,
      duration_minutes: course.duration_minutes,
    },
  });

  return {
    httpStatus: 200,
    payload: { ok: true, bookingId: booking.id, lessonId: lesson.id },
  };
}
