import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { insertNotification } from "@/lib/notifications";
import { findScheduleConflict } from "@/lib/bookings/scheduleConflict";
import { MIN_LEAD_MINUTES } from "@/lib/bookings/leadTime";
import { nowPlusMinutesAsLessonTimestamp } from "@/lib/datetime/lessonTime";
import { requestCourseBooking } from "@/lib/bookings/requestCourseBooking";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

// `{ courseId, start }` books a course at an open time (PRP-001).
// `{ lessonId }` is the legacy pre-generated slot flow, kept until the new
// picker is live everywhere.
type Body = {
  lessonId: number;
  courseId: number;
  start: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<Body>;
    if (body.courseId !== undefined) {
      return handleCourseBooking(body);
    }
    const lessonId =
      typeof body.lessonId === "number" ? body.lessonId : Number(body.lessonId);

    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return noStoreJson({ error: "Invalid lessonId." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("is_student")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_student) {
      return noStoreJson({ error: "Forbidden." }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return noStoreJson(
        { error: "Server misconfigured: missing Supabase env vars." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: lesson, error: lessonError } = await supabaseAdmin
      .from("lessons")
      .select("id,tutor_id,status,student_id,scheduled_date_time,duration_minutes,subject:subjects(name)")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return noStoreJson({ error: "Lesson not found." }, { status: 404 });
    }

    if (lesson.status !== "available" || lesson.student_id) {
      return noStoreJson(
        { error: "This slot is no longer available." },
        { status: 409 }
      );
    }

    // Same minimum notice as custom requests: no booking of past or imminent slots.
    const minStartTs = nowPlusMinutesAsLessonTimestamp(MIN_LEAD_MINUTES);
    if (String(lesson.scheduled_date_time).replace(" ", "T") < minStartTs) {
      return noStoreJson(
        { error: "This slot starts too soon to be booked.", code: "too_soon" },
        { status: 409 }
      );
    }

    const conflict = await findScheduleConflict(supabaseAdmin, {
      tutorId: lesson.tutor_id,
      studentId: user.id,
      start: String(lesson.scheduled_date_time),
      durationMinutes: lesson.duration_minutes ?? 0,
      excludeLessonId: lesson.id,
    });
    if (conflict) {
      return noStoreJson(
        {
          error:
            conflict === "tutor_busy"
              ? "The tutor already has a class at that time."
              : "You already have a class at that time.",
          code: conflict,
        },
        { status: 409 }
      );
    }

    const { data: updatedLesson, error: updateError } = await supabaseAdmin
      .from("lessons")
      .update({
        student_id: user.id,
        status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lessonId)
      .eq("status", "available")
      .is("student_id", null)
      .gte("scheduled_date_time", minStartTs)
      .select("id,tutor_id")
      .single();

    if (updateError || !updatedLesson) {
      return noStoreJson(
        { error: "This slot is no longer available." },
        { status: 409 }
      );
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        student_id: user.id,
        tutor_id: updatedLesson.tutor_id,
        lesson_id: updatedLesson.id,
        requested_date: new Date().toISOString(),
        status: "pending",
      })
      .select("id")
      .single();

    if (bookingError || !booking) {
      // Rollback lesson assignment if booking creation fails.
      await supabaseAdmin
        .from("lessons")
        .update({
          student_id: null,
          status: "available",
          updated_at: new Date().toISOString(),
        })
        .eq("id", updatedLesson.id);

      return noStoreJson(
        { error: bookingError?.message || "Failed to create booking." },
        { status: 400 }
      );
    }

    // Notify the tutor about the new booking request
    const subjectRel = lesson.subject as { name?: string } | { name?: string }[] | null;
    const subjectName = (Array.isArray(subjectRel) ? subjectRel[0] : subjectRel)?.name ?? null;
    const { data: studentUser } = await supabaseAdmin
      .from("users")
      .select("username")
      .eq("id", user.id)
      .single();

    await insertNotification(supabaseAdmin, {
      userId: updatedLesson.tutor_id,
      type: "booking_request",
      title: "Nueva solicitud de clase",
      body: `${studentUser?.username ?? "Un estudiante"} ha solicitado una clase${
        subjectName ? ` de ${subjectName}` : ""
      }${lesson.duration_minutes ? ` (${lesson.duration_minutes} min)` : ""} contigo.`,
      data: {
        booking_id: booking.id,
        lesson_id: updatedLesson.id,
        student_id: user.id,
        scheduled_date_time: lesson.scheduled_date_time,
        actor_name: studentUser?.username ?? null,
        subject_name: subjectName,
        duration_minutes: lesson.duration_minutes ?? null,
      },
    });

    return noStoreJson({ bookingId: booking.id }, { status: 200 });
  } catch (err) {
    console.error("[bookings/request] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}


async function handleCourseBooking(body: Partial<Body>) {
  const courseId = Number(body.courseId);
  const start = typeof body.start === "string" ? body.start.trim() : "";
  if (!Number.isInteger(courseId) || courseId <= 0 || !start) {
    return noStoreJson({ error: "Invalid courseId or start." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_student")
    .eq("id", user.id)
    .single();
  if (!profile?.is_student) {
    return noStoreJson({ error: "Forbidden." }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return noStoreJson({ error: "Server misconfigured." }, { status: 500 });
  }
  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const result = await requestCourseBooking(admin, {
    studentId: user.id,
    courseId,
    start,
  });
  return noStoreJson(result.payload, { status: result.httpStatus });
}
