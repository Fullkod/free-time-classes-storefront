import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicError, readJson } from "@/lib/api/http";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

/**
 * GET /api/notifications
 * Returns the authenticated user's notifications (newest first).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, title, body, data, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return noStoreJson(publicError(error, "Could not update notifications."), { status: 500 });
    }

    return noStoreJson({ notifications: data ?? [] });
  } catch (err) {
    console.error("[notifications] GET error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications
 * Mark notification(s) as read.
 * Body: { notificationId: number } OR { all: true }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await readJson<{ all: boolean; notificationId: number }>(request);
    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });

    if (body.all === true) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        return noStoreJson(publicError(error, "Could not update notifications."), { status: 500 });
      }
      return noStoreJson({ ok: true });
    }

    const notificationId = Number(body.notificationId);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return noStoreJson({ error: "Invalid notificationId." }, { status: 400 });
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (error) {
      return noStoreJson(publicError(error, "Could not update notifications."), { status: 500 });
    }

    return noStoreJson({ ok: true });
  } catch (err) {
    console.error("[notifications] PATCH error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
