import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { deleteMeetEvent } from "@/lib/google-calendar";
import { insertNotification } from "@/lib/notifications";
import { releaseLesson } from "@/lib/bookings/releaseLesson";
import {
  STUDENT_CANCEL_HOURS,
  canStudentCancelConfirmed,
} from "@/lib/bookings/cancellationPolicy";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

type Body = {
  bookingId: number;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<Body>;
    const bookingId =
      typeof body.bookingId === "number" ? body.bookingId : Number(body.bookingId);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return noStoreJson({ error: "Invalid bookingId." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return noStoreJson(
        { error: "Server misconfigured: missing Supabase env vars." },
        { status: 500 }
      );
    }

    const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id,student_id,tutor_id,lesson_id,status,requested_scheduled_date_time")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return noStoreJson({ error: "Booking not found." }, { status: 404 });
    }

    if (booking.student_id !== user.id) {
      return noStoreJson({ error: "Forbidden." }, { status: 403 });
    }

    if (booking.status !== "pending" && booking.status !== "confirmed") {
      return noStoreJson({ error: "This booking cannot be cancelled." }, { status: 409 });
    }

    if (booking.status === "confirmed") {
      if (!booking.lesson_id) {
        return noStoreJson(
          { error: "Booking has no associated lesson to validate cancellation window." },
          { status: 409 }
        );
      }

      const { data: lesson, error: lessonError } = await admin
        .from("lessons")
        .select("id,scheduled_date_time")
        .eq("id", booking.lesson_id)
        .single();

      if (lessonError || !lesson) {
        return noStoreJson(
          { error: "Associated lesson not found for this booking." },
          { status: 404 }
        );
      }

      if (!lesson.scheduled_date_time) {
        return noStoreJson(
          { error: "Lesson has no scheduled date/time." },
          { status: 409 }
        );
      }

      if (!canStudentCancelConfirmed(lesson.scheduled_date_time)) {
        return noStoreJson(
          {
            error: `You can only cancel confirmed bookings at least ${STUDENT_CANCEL_HOURS} hours before the class.`,
          },
          { status: 409 }
        );
      }
    }

    // Guarded on the status read above so a concurrent tutor response wins cleanly.
    const { data: cancelledRows, error: cancelError } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("status", booking.status)
      .select("id");

    if (cancelError) {
      return noStoreJson(
        { error: cancelError.message || "Failed to cancel booking." },
        { status: 400 }
      );
    }
    if (!cancelledRows?.length) {
      return noStoreJson({ error: "This booking cannot be cancelled." }, { status: 409 });
    }

    let cancelledStart: string | null = booking.requested_scheduled_date_time ?? null;
    if (booking.lesson_id) {
      const { data: lessonToCancel } = await admin
        .from("lessons")
        .select("tutor_id,google_event_id,scheduled_date_time")
        .eq("id", booking.lesson_id)
        .single();

      cancelledStart ??= lessonToCancel?.scheduled_date_time ?? null;

      if (lessonToCancel?.google_event_id && lessonToCancel.tutor_id) {
        try {
          await deleteMeetEvent(lessonToCancel.tutor_id, lessonToCancel.google_event_id);
        } catch (meetErr) {
          console.error("[bookings/student/cancel] Google event delete failed:", meetErr);
        }
      }

      await releaseLesson(admin, booking.lesson_id, {
        isCustomRequest: booking.requested_scheduled_date_time != null,
      });
    }

    // Notify tutor about cancellation
    const { data: studentUser } = await admin
      .from("users")
      .select("username")
      .eq("id", user.id)
      .single();

    await insertNotification(admin, {
      userId: booking.tutor_id,
      type: "booking_cancelled",
      title: "Clase cancelada",
      body: `${studentUser?.username ?? "Un estudiante"} ha cancelado su solicitud de clase.`,
      data: {
        booking_id: bookingId,
        lesson_id: booking.lesson_id,
        ...(cancelledStart ? { scheduled_date_time: cancelledStart } : {}),
      },
    });

    return noStoreJson({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[bookings/student/cancel] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}

