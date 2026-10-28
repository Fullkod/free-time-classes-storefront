import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publicError } from "@/lib/api/http";
import { deleteMeetEvent } from "@/lib/google-calendar";
import { insertNotification } from "@/lib/notifications";
import { releaseLesson } from "@/lib/bookings/releaseLesson";
import { isLessonInPast } from "@/lib/datetime/lessonTime";
import type { SupabaseClient } from "@supabase/supabase-js";

type UpcomingBooking = {
  id: number;
  tutor_id: string;
  lesson_id: number | null;
  requested_scheduled_date_time: string | null;
  lesson: { scheduled_date_time: string | null; google_event_id: string | null } | null;
};

/**
 * F105: a leaving student's upcoming classes are cancelled like a normal
 * cancellation (slot released, tutor told), so no tutor keeps a class
 * without a student. Past classes stay in the tutor's history.
 */
async function cancelUpcomingAsStudent(admin: SupabaseClient, studentId: string, name: string | null) {
  const { data } = await admin
    .from("bookings")
    .select("id, tutor_id, lesson_id, requested_scheduled_date_time, lesson:lessons(scheduled_date_time, google_event_id)")
    .eq("student_id", studentId)
    .in("status", ["pending", "confirmed"]);
  for (const raw of (data ?? []) as unknown as UpcomingBooking[]) {
    const lesson = Array.isArray(raw.lesson) ? raw.lesson[0] ?? null : raw.lesson;
    const start = raw.requested_scheduled_date_time ?? lesson?.scheduled_date_time ?? null;
    if (start && isLessonInPast(start)) continue;
    await admin.from("bookings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", raw.id);
    if (raw.lesson_id) {
      if (lesson?.google_event_id) {
        await deleteMeetEvent(raw.tutor_id, lesson.google_event_id).catch((err: unknown) =>
          console.error("[settings/delete-account] Google event delete failed:", err)
        );
      }
      await releaseLesson(admin, raw.lesson_id, {
        isCustomRequest: raw.requested_scheduled_date_time != null,
      });
    }
    await insertNotification(admin, {
      userId: raw.tutor_id,
      type: "booking_cancelled",
      title: "Clase cancelada",
      body: `${name ?? "Un estudiante"} ha cancelado su solicitud de clase.`,
      data: {
        booking_id: raw.id,
        lesson_id: raw.lesson_id,
        ...(start ? { scheduled_date_time: start } : {}),
        actor_name: name,
      },
    });
  }
}

/** Avatar files of the user (`<id>/…` and the older `<id>.<ext>`). */
async function avatarPaths(admin: SupabaseClient, userId: string): Promise<string[]> {
  const [{ data: folder }, { data: root }] = await Promise.all([
    admin.storage.from("avatars").list(userId, { limit: 1000 }),
    admin.storage.from("avatars").list("", { limit: 1000, search: userId }),
  ]);
  return [
    ...(folder ?? []).filter((f) => f.id).map((f) => `${userId}/${f.name}`),
    ...(root ?? []).filter((f) => f.id && f.name.startsWith(`${userId}.`)).map((f) => f.name),
  ];
}

/** Cover files of the tutor's courses (`<courseId>/…`); the course rows cascade. */
async function coverPaths(admin: SupabaseClient, tutorId: string): Promise<string[]> {
  const { data: courses } = await admin.from("courses").select("id").eq("tutor_id", tutorId);
  const lists = await Promise.all(
    (courses ?? []).map(async (c) => {
      const { data } = await admin.storage.from("course_covers").list(String(c.id), { limit: 1000 });
      return (data ?? []).filter((f) => f.id).map((f) => `${c.id}/${f.name}`);
    })
  );
  return lists.flat();
}

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

export async function POST() {
  try {
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

    const supabaseAdmin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: me } = await supabaseAdmin
      .from("users")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    await cancelUpcomingAsStudent(supabaseAdmin, user.id, (me?.username as string | null) ?? null);
    const [files, covers] = await Promise.all([
      avatarPaths(supabaseAdmin, user.id),
      coverPaths(supabaseAdmin, user.id),
    ]);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user.id
    );

    if (deleteError) {
      return noStoreJson(
        publicError(deleteError, "Failed to delete account."),
        { status: 400 }
      );
    }

    // Only once the account is gone, so a failed delete never loses the photo.
    if (files.length) {
      const { error: storageError } = await supabaseAdmin.storage.from("avatars").remove(files);
      if (storageError) console.error("[settings/delete-account] avatar cleanup failed:", storageError);
    }
    if (covers.length) {
      const { error: storageError } = await supabaseAdmin.storage.from("course_covers").remove(covers);
      if (storageError) console.error("[settings/delete-account] cover cleanup failed:", storageError);
    }

    return noStoreJson({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[settings/delete-account] error:", err);
    return noStoreJson(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

