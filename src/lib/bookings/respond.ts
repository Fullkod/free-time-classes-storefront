import type { SupabaseClient } from "@supabase/supabase-js";
import { createMeetEvent, hasGoogleConnection } from "@/lib/google-calendar";
import { insertNotification } from "@/lib/notifications";
import { releaseLesson } from "@/lib/bookings/releaseLesson";
import { isValidMeetLink } from "@/lib/bookings/meetLink";
import { findScheduleConflict } from "@/lib/bookings/scheduleConflict";
import { expirePendingBookings } from "@/lib/bookings/expirePending";
import type { BookingRejectionReason } from "@/types/booking";

export type RespondAction = "confirm" | "reject";

// Mirrors booking_rejections_reason_check.
const REJECTION_REASONS: readonly BookingRejectionReason[] = [
  "tutor unavailable",
  "sick tutor",
  "sick student",
  "scheduling conflict",
  "emergency",
  "technical issues",
  "other",
];

export interface RespondResult {
  httpStatus: number;
  payload: Record<string, unknown>;
}

const ALREADY_HANDLED: RespondResult = {
  httpStatus: 409,
  payload: { error: "Only pending bookings can be updated." },
};

/**
 * Core confirm/reject logic for a booking, shared by the tutor API route
 * (auth via session) and the WhatsApp webhook (auth via @lid match).
 *
 * The caller is responsible for authorizing `tutorId` — this function still
 * re-checks that the booking belongs to that tutor and is pending.
 *
 * Returns an HTTP-shaped result so the API route can return it verbatim and
 * the webhook can branch on `httpStatus === 200`.
 */
export async function respondToBooking(
  admin: SupabaseClient,
  args: {
    bookingId: number;
    tutorId: string;
    action: RespondAction;
    /** Optional manual Meet link; when absent, auto-create via Google if connected. */
    meetLink?: string;
    /** Optional rejection reason (one of booking_rejections_reason_check). */
    reason?: string;
  },
): Promise<RespondResult> {
  const { bookingId, tutorId, action } = args;

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id,tutor_id,student_id,lesson_id,course_id,status,requested_subject_id,requested_scheduled_date_time,requested_duration_minutes",
    )
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    return { httpStatus: 404, payload: { error: "Booking not found." } };
  }

  if (booking.tutor_id !== tutorId) {
    return { httpStatus: 403, payload: { error: "Forbidden." } };
  }

  if (booking.status !== "pending") return ALREADY_HANDLED;

  // F014: a request past its deadline expires instead of being answered.
  const expiry = await expirePendingBookings(admin, { bookingId });
  if (expiry.bookingsExpired > 0) {
    return {
      httpStatus: 410,
      payload: { error: "This request has expired.", code: "request_expired" },
    };
  }

  const isCustomRequest = booking.lesson_id == null;

  if (
    isCustomRequest &&
    (!booking.requested_subject_id ||
      !booking.requested_scheduled_date_time ||
      !booking.requested_duration_minutes)
  ) {
    return {
      httpStatus: 409,
      payload: { error: "Custom request is missing required fields." },
    };
  }

  if (action === "confirm") {
    const requestedMeetLink = typeof args.meetLink === "string" ? args.meetLink.trim() : "";
    if (requestedMeetLink && !isValidMeetLink(requestedMeetLink)) {
      return {
        httpStatus: 400,
        payload: {
          error: "The video call link must be an https:// URL.",
          code: "invalid_meet_link",
        },
      };
    }

    let lessonIdForFlow: number | null = booking.lesson_id ?? null;

    if (isCustomRequest) {
      const duration = booking.requested_duration_minutes as number;
      let computedPrice = 0;
      if (booking.course_id) {
        // PRP-001: course requests are priced by the course (closes F023).
        const { data: course } = await admin
          .from("courses")
          .select("price_per_session")
          .eq("id", booking.course_id)
          .single();
        computedPrice = Number(course?.price_per_session ?? 0);
      } else {
        // Legacy requests without a course: tutor hourly rate, if any.
        const { data: tutorProfile } = await admin
          .from("tutor_profiles")
          .select("hourly_rate")
          .eq("id", tutorId)
          .single();
        const hourlyRate = Number(tutorProfile?.hourly_rate ?? 0);
        computedPrice =
          hourlyRate > 0 ? Math.round(((hourlyRate * duration) / 60) * 100) / 100 : 0;
      }

      const conflict = await findScheduleConflict(admin, {
        tutorId,
        studentId: booking.student_id,
        start: String(booking.requested_scheduled_date_time),
        durationMinutes: duration,
      });
      if (conflict) {
        return {
          httpStatus: 409,
          payload: {
            error:
              conflict === "tutor_busy"
                ? "You already have a class at that time."
                : "The student already has a class at that time.",
            code: conflict,
          },
        };
      }

      const { data: createdLesson, error: lessonInsertError } = await admin
        .from("lessons")
        .insert({
          tutor_id: tutorId,
          student_id: booking.student_id,
          subject_id: booking.requested_subject_id,
          course_id: booking.course_id ?? null,
          scheduled_date_time: booking.requested_scheduled_date_time,
          duration_minutes: duration,
          price: computedPrice,
          status: "scheduled",
        })
        .select("id")
        .single();

      // 23505: lessons_tutor_start_live_key — the tutor already has a lesson
      // starting at that time.
      if (lessonInsertError?.code === "23505" || lessonInsertError?.code === "23P01") {
        return {
          httpStatus: 409,
          payload: {
            error: "You already have a class at that time.",
            code: "slot_conflict",
          },
        };
      }

      if (lessonInsertError || !createdLesson) {
        console.error(
          "[respondToBooking] custom request lesson insert failed:",
          lessonInsertError,
        );
        return {
          httpStatus: 400,
          payload: {
            error: lessonInsertError?.message || "Failed to create lesson for request.",
          },
        };
      }

      lessonIdForFlow = createdLesson.id;
    }

    // Guarded on status so two concurrent responses cannot both win.
    const { data: confirmedRows, error: updateError } = await admin
      .from("bookings")
      .update({
        status: "confirmed",
        ...(isCustomRequest && lessonIdForFlow ? { lesson_id: lessonIdForFlow } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("status", "pending")
      .select("id");

    if (updateError || !confirmedRows?.length) {
      if (isCustomRequest && lessonIdForFlow) {
        await admin.from("lessons").delete().eq("id", lessonIdForFlow);
      }
      return updateError
        ? {
            httpStatus: 400,
            payload: { error: updateError.message || "Failed to confirm booking." },
          }
        : ALREADY_HANDLED;
    }

    const manualMeetLink = requestedMeetLink;
    let finalMeetLink = manualMeetLink;
    let googleEventId: string | null = null;
    // Reported back so the tutor UI can warn when the automatic Meet failed.
    let meetStatus: "manual" | "created" | "failed" | "not_connected" | "none" =
      manualMeetLink ? "manual" : "none";

    if (!manualMeetLink && lessonIdForFlow) {
      const googleConnected = await hasGoogleConnection(tutorId);
      meetStatus = googleConnected ? "failed" : "not_connected";
      if (googleConnected) {
        const { data: lessonData } = await admin
          .from("lessons")
          .select("scheduled_date_time,duration_minutes,student_id,subject_id")
          .eq("id", lessonIdForFlow)
          .single();

        if (lessonData?.scheduled_date_time) {
          let studentEmail = "";
          if (lessonData.student_id) {
            const { data: studentUser } = await admin
              .from("users")
              .select("email")
              .eq("id", lessonData.student_id)
              .single();
            studentEmail = studentUser?.email ?? "";
          }

          const { data: subject } = await admin
            .from("subjects")
            .select("name")
            .eq("id", lessonData.subject_id)
            .single();

          try {
            const result = await createMeetEvent({
              tutorId,
              summary: `FreeTime Class: ${subject?.name ?? "Lesson"}`,
              description: "Clase creada automáticamente desde FreeTime Classes",
              startTime: lessonData.scheduled_date_time,
              durationMinutes: lessonData.duration_minutes,
              attendeeEmails: studentEmail ? [studentEmail] : [],
            });

            if (result) {
              finalMeetLink = result.meetLink;
              googleEventId = result.eventId;
              meetStatus = "created";
            }
          } catch (meetErr) {
            console.error("[respondToBooking] Google Meet auto-create failed:", meetErr);
          }
        }
      }
    }

    if (lessonIdForFlow && (finalMeetLink || googleEventId)) {
      const lessonUpdate: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (finalMeetLink) lessonUpdate.meet_link = finalMeetLink;
      if (googleEventId) lessonUpdate.google_event_id = googleEventId;

      await admin.from("lessons").update(lessonUpdate).eq("id", lessonIdForFlow);
    }

    // Notify student about confirmation
    const { data: tutorUser } = await admin
      .from("users")
      .select("username")
      .eq("id", tutorId)
      .single();

    // Resolve the scheduled time for the student message: from the request for
    // custom bookings, otherwise from the (existing) lesson.
    let scheduledForNotify: string | null = isCustomRequest
      ? (booking.requested_scheduled_date_time as string | null)
      : null;
    if (!scheduledForNotify && lessonIdForFlow) {
      const { data: lessonForNotify } = await admin
        .from("lessons")
        .select("scheduled_date_time")
        .eq("id", lessonIdForFlow)
        .single();
      scheduledForNotify = lessonForNotify?.scheduled_date_time ?? null;
    }

    await insertNotification(admin, {
      userId: booking.student_id,
      type: "booking_confirmed",
      title: "Clase confirmada",
      body: finalMeetLink
        ? `${tutorUser?.username ?? "Tu tutor"} ha confirmado tu clase. Aquí tienes el enlace de la videollamada:`
        : `${tutorUser?.username ?? "Tu tutor"} ha confirmado tu solicitud de clase.`,
      data: {
        booking_id: bookingId,
        lesson_id: lessonIdForFlow,
        ...(finalMeetLink ? { meet_link: finalMeetLink } : {}),
        ...(scheduledForNotify ? { scheduled_date_time: scheduledForNotify } : {}),
      },
    });

    return {
      httpStatus: 200,
      payload: {
        ok: true,
        meetLink: finalMeetLink || null,
        lessonId: lessonIdForFlow,
        meetStatus,
      },
    };
  }

  // action === "reject"
  const { data: rejectedRows, error: rejectError } = await admin
    .from("bookings")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select("id");

  if (rejectError) {
    return {
      httpStatus: 400,
      payload: { error: rejectError.message || "Failed to reject booking." },
    };
  }
  if (!rejectedRows?.length) return ALREADY_HANDLED;

  if (booking.lesson_id) {
    const { data: lessonToReject } = await admin
      .from("lessons")
      .select("google_event_id")
      .eq("id", booking.lesson_id)
      .single();

    if (lessonToReject?.google_event_id) {
      try {
        const { deleteMeetEvent } = await import("@/lib/google-calendar");
        await deleteMeetEvent(tutorId, lessonToReject.google_event_id);
      } catch (meetErr) {
        console.error("[respondToBooking] Google event delete failed:", meetErr);
      }
    }

    await releaseLesson(admin, booking.lesson_id, {
      isCustomRequest: booking.requested_scheduled_date_time != null,
    });
  }

  const reason = REJECTION_REASONS.find((r) => r === args.reason?.trim());
  if (reason) {
    const { error: reasonError } = await admin.from("booking_rejections").insert({
      booking_id: bookingId,
      student_id: booking.student_id,
      tutor_id: tutorId,
      reason,
    });
    if (reasonError) {
      console.error("[respondToBooking] rejection reason insert failed:", reasonError);
    }
  }

  // Notify student about rejection
  const { data: tutorUserReject } = await admin
    .from("users")
    .select("username")
    .eq("id", tutorId)
    .single();

  await insertNotification(admin, {
    userId: booking.student_id,
    type: "booking_rejected",
    title: "Solicitud rechazada",
    body: `${tutorUserReject?.username ?? "Tu tutor"} no pudo aceptar tu solicitud de clase.`,
    data: { booking_id: bookingId, lesson_id: booking.lesson_id },
  });

  return { httpStatus: 200, payload: { ok: true } };
}
