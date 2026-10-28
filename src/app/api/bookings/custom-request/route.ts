import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { insertNotification } from "@/lib/notifications";
import { findScheduleConflict } from "@/lib/bookings/scheduleConflict";
import { nowPlusMinutesAsLessonTimestamp } from "@/lib/datetime/lessonTime";
import { MIN_LEAD_MINUTES } from "@/lib/bookings/leadTime";
import { loadBookableCourse } from "@/lib/availability/loadOpenStartTimes";
import { publicError, readJson } from "@/lib/api/http";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

const ALLOWED_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
const MAX_OPEN_REQUESTS_PER_TUTOR = 3;
const NOTES_MAX_LENGTH = 500;
const SCHEDULED_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

type Body = {
  tutorId?: string;
  // PRP-001: a request for another time is for a course; its subject,
  // duration and price come from the course.
  courseId?: number | string;
  subjectId?: number | string;
  scheduledDateTime?: string;
  durationMinutes?: number | string;
  notes?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<Body>(request);
    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });

    const tutorId = typeof body.tutorId === "string" ? body.tutorId.trim() : "";
    const courseId =
      body.courseId === undefined || body.courseId === null || body.courseId === ""
        ? null
        : Number(body.courseId);
    let subjectId =
      typeof body.subjectId === "number" ? body.subjectId : Number(body.subjectId);
    let durationMinutes =
      typeof body.durationMinutes === "number"
        ? body.durationMinutes
        : Number(body.durationMinutes);
    const scheduledDateTimeRaw =
      typeof body.scheduledDateTime === "string" ? body.scheduledDateTime.trim() : "";
    const notesRaw = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!/^[0-9a-f-]{36}$/i.test(tutorId)) {
      return noStoreJson({ error: "Invalid tutorId." }, { status: 400 });
    }
    if (courseId !== null && (!Number.isInteger(courseId) || courseId <= 0)) {
      return noStoreJson({ error: "Invalid courseId." }, { status: 400 });
    }
    if (courseId === null && (!Number.isInteger(subjectId) || subjectId <= 0)) {
      return noStoreJson({ error: "Invalid subjectId." }, { status: 400 });
    }
    if (
      courseId === null &&
      !ALLOWED_DURATIONS.includes(durationMinutes as (typeof ALLOWED_DURATIONS)[number])
    ) {
      return noStoreJson({ error: "Invalid durationMinutes." }, { status: 400 });
    }
    if (!SCHEDULED_DATETIME_RE.test(scheduledDateTimeRaw)) {
      return noStoreJson(
        { error: "Invalid scheduledDateTime. Use YYYY-MM-DDTHH:MM(:SS) wall-clock Madrid." },
        { status: 400 }
      );
    }
    const scheduledDateTime =
      scheduledDateTimeRaw.length === 16 ? `${scheduledDateTimeRaw}:00` : scheduledDateTimeRaw;

    if (notesRaw.length > NOTES_MAX_LENGTH) {
      return noStoreJson(
        { error: `Notes exceed ${NOTES_MAX_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const minStartTs = nowPlusMinutesAsLessonTimestamp(MIN_LEAD_MINUTES);
    if (scheduledDateTime < minStartTs) {
      return noStoreJson(
        {
          error: `Lead time too short. Minimum ${MIN_LEAD_MINUTES} minutes from now.`,
          code: "lead_time_too_short",
          minStart: minStartTs,
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    if (user.id === tutorId) {
      return noStoreJson({ error: "Cannot request a class from yourself." }, { status: 400 });
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

    const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: tutorRow, error: tutorError } = await admin
      .from("users")
      .select("id,is_tutor,username")
      .eq("id", tutorId)
      .single();

    if (tutorError || !tutorRow?.is_tutor) {
      return noStoreJson({ error: "Tutor not found." }, { status: 404 });
    }

    if (courseId !== null) {
      const course = await loadBookableCourse(admin, courseId);
      if (!course || course.tutor_id !== tutorId || !course.subject_id) {
        return noStoreJson({ error: "Course not found." }, { status: 404 });
      }
      subjectId = course.subject_id;
      durationMinutes = course.duration_minutes;
    }

    const { data: subjectRow, error: subjectError } = await admin
      .from("subjects")
      .select("id,name")
      .eq("id", subjectId)
      .single();

    if (subjectError || !subjectRow) {
      return noStoreJson({ error: "Subject not found." }, { status: 404 });
    }

    const { data: tutorSubjectRow } = await admin
      .from("tutor_subjects")
      .select("tutor_id")
      .eq("tutor_id", tutorId)
      .eq("subject_id", subjectId)
      .maybeSingle();

    if (!tutorSubjectRow && courseId === null) {
      return noStoreJson(
        { error: "Tutor does not teach this subject." },
        { status: 400 }
      );
    }

    const conflict = await findScheduleConflict(admin, {
      tutorId,
      studentId: user.id,
      start: scheduledDateTime,
      durationMinutes,
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

    const { count: openCount } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("student_id", user.id)
      .eq("tutor_id", tutorId)
      .eq("status", "pending")
      .is("lesson_id", null);

    if ((openCount ?? 0) >= MAX_OPEN_REQUESTS_PER_TUTOR) {
      return noStoreJson(
        {
          error: `You already have ${MAX_OPEN_REQUESTS_PER_TUTOR} open requests with this tutor.`,
          code: "too_many_open_requests",
        },
        { status: 409 }
      );
    }

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .insert({
        student_id: user.id,
        tutor_id: tutorId,
        lesson_id: null,
        requested_date: new Date().toISOString(),
        requested_subject_id: subjectId,
        requested_scheduled_date_time: scheduledDateTime,
        requested_duration_minutes: durationMinutes,
        course_id: courseId,
        status: "pending",
        notes: notesRaw || null,
      })
      .select("id")
      .single();

    if (bookingError || !booking) {
      console.error("[bookings/custom-request] insert failed:", bookingError);
      return noStoreJson(
        publicError(bookingError, "Failed to create request."),
        { status: 400 }
      );
    }

    const { data: studentUser } = await admin
      .from("users")
      .select("username")
      .eq("id", user.id)
      .single();

    await insertNotification(admin, {
      userId: tutorId,
      type: "booking_custom_request",
      title: "Solicitud de clase fuera de tu disponibilidad",
      body: `${studentUser?.username ?? "Un estudiante"} te ha pedido una clase de ${subjectRow.name} (${durationMinutes} min).`,
      data: {
        booking_id: booking.id,
        student_id: user.id,
        subject_id: subjectId,
        scheduled_date_time: scheduledDateTime,
        duration_minutes: durationMinutes,
        actor_name: studentUser?.username ?? null,
        subject_name: subjectRow.name,
      },
    });

    return noStoreJson({ bookingId: booking.id }, { status: 200 });
  } catch (err) {
    console.error("[bookings/custom-request] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
