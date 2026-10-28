import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { insertNotification } from "@/lib/notifications";
import { isValidMeetLink } from "@/lib/bookings/meetLink";
import { isLessonInPast } from "@/lib/datetime/lessonTime";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const lessonId = Number(rawId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return noStoreJson({ error: "Invalid lesson id." }, { status: 400 });
    }

    const body = (await request.json()) as { meetLink?: string };
    const meetLink = typeof body.meetLink === "string" ? body.meetLink.trim() : "";
    if (meetLink && !isValidMeetLink(meetLink)) {
      return noStoreJson(
        { error: "The video call link must be an https:// URL.", code: "invalid_meet_link" },
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return noStoreJson(
        { error: "Server misconfigured." },
        { status: 500 }
      );
    }

    const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: lesson, error: lessonError } = await admin
      .from("lessons")
      .select("id, tutor_id, student_id, status, meet_link, scheduled_date_time")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return noStoreJson({ error: "Lesson not found." }, { status: 404 });
    }

    if (lesson.tutor_id !== user.id) {
      return noStoreJson({ error: "Forbidden." }, { status: 403 });
    }

    if (
      lesson.status !== "scheduled" ||
      !lesson.student_id ||
      isLessonInPast(lesson.scheduled_date_time)
    ) {
      return noStoreJson(
        { error: "Only booked upcoming classes can have a video call link." },
        { status: 409 }
      );
    }

    const { error: updateError } = await admin
      .from("lessons")
      .update({
        meet_link: meetLink || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lessonId);

    if (updateError) {
      return noStoreJson(
        { error: updateError.message || "Failed to update meet link." },
        { status: 400 }
      );
    }

    // Tell the student when the link is added or changed after confirmation.
    if (meetLink && meetLink !== lesson.meet_link) {
      try {
        await insertNotification(admin, {
          userId: lesson.student_id,
          type: "booking_confirmed",
          title: "Enlace de la videollamada",
          body: "Tu tutor ha añadido el enlace de la videollamada de tu clase:",
          data: {
            event: "meet_link_added",
            lesson_id: lessonId,
            meet_link: meetLink,
            scheduled_date_time: lesson.scheduled_date_time,
          },
        });
      } catch (notifyErr) {
        console.error("[lessons/meet-link] notify failed:", notifyErr);
      }
    }

    return noStoreJson({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[lessons/meet-link] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
