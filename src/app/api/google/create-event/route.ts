import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createMeetEvent } from "@/lib/google-calendar";
import { readJson } from "@/lib/api/http";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

type Body = {
  lessonId: number;
};

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<Body>(request);
    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
    const lessonId = Number(body.lessonId);

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return noStoreJson({ error: "Server misconfigured." }, { status: 500 });
    }

    const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: lesson, error: lessonError } = await admin
      .from("lessons")
      .select("id,tutor_id,student_id,scheduled_date_time,duration_minutes,google_event_id,subject_id")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return noStoreJson({ error: "Lesson not found." }, { status: 404 });
    }

    if (lesson.tutor_id !== user.id) {
      return noStoreJson({ error: "Forbidden." }, { status: 403 });
    }

    if (lesson.google_event_id) {
      return noStoreJson({ error: "Event already exists for this lesson." }, { status: 409 });
    }

    if (!lesson.scheduled_date_time) {
      return noStoreJson({ error: "Lesson has no scheduled date." }, { status: 400 });
    }

    let studentEmail = "";
    if (lesson.student_id) {
      const { data: studentUser } = await admin
        .from("users")
        .select("email")
        .eq("id", lesson.student_id)
        .single();
      studentEmail = studentUser?.email ?? "";
    }

    const { data: subject } = await admin
      .from("subjects")
      .select("name")
      .eq("id", lesson.subject_id)
      .single();

    const result = await createMeetEvent({
      tutorId: user.id,
      summary: `FreeTime Class: ${subject?.name ?? "Lesson"}`,
      description: "Clase creada automáticamente desde FreeTime Classes",
      startTime: lesson.scheduled_date_time,
      durationMinutes: lesson.duration_minutes,
      attendeeEmails: studentEmail ? [studentEmail] : [],
    });

    if (!result) {
      return noStoreJson(
        { error: "Google Calendar not connected or token expired." },
        { status: 400 }
      );
    }

    await admin
      .from("lessons")
      .update({
        google_event_id: result.eventId,
        meet_link: result.meetLink,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lessonId);

    return noStoreJson({
      ok: true,
      eventId: result.eventId,
      meetLink: result.meetLink,
      htmlLink: result.htmlLink,
    });
  } catch (err) {
    console.error("[google/create-event] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
