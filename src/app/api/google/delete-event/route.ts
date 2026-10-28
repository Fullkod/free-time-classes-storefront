import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { deleteMeetEvent } from "@/lib/google-calendar";
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

export async function DELETE(request: NextRequest) {
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
      .select("id,tutor_id,google_event_id")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return noStoreJson({ error: "Lesson not found." }, { status: 404 });
    }

    if (lesson.tutor_id !== user.id) {
      return noStoreJson({ error: "Forbidden." }, { status: 403 });
    }

    if (!lesson.google_event_id) {
      return noStoreJson({ error: "No Google event to delete." }, { status: 404 });
    }

    const deleted = await deleteMeetEvent(user.id, lesson.google_event_id);

    await admin
      .from("lessons")
      .update({
        google_event_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lessonId);

    return noStoreJson({ ok: true, deleted });
  } catch (err) {
    console.error("[google/delete-event] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
