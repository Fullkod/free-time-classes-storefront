import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publicError } from "@/lib/api/http";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

type RouteContext = { params: Promise<{ id: string }> };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;
const normalizeTime = (v: string) => (v.length === 5 ? `${v}:00` : v);

type PatchBody = {
  day_of_week?: number;
  start_time?: string;
  end_time?: string;
  is_active?: boolean;
};

/** Edit a weekly window or pause/resume it (F086). Open times follow at once. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: ruleId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
    }

    const { data: rule, error: ruleError } = await supabase
      .from("tutor_availability")
      .select("id, tutor_id, day_of_week, start_time, end_time, is_active")
      .eq("id", ruleId)
      .maybeSingle();
    if (ruleError || !rule || rule.tutor_id !== user.id) {
      return noStoreJson({ error: "Rule not found." }, { status: 404 });
    }

    const next = {
      day_of_week: body.day_of_week ?? rule.day_of_week,
      start_time: typeof body.start_time === "string" ? body.start_time.trim() : rule.start_time,
      end_time: typeof body.end_time === "string" ? body.end_time.trim() : rule.end_time,
      is_active: body.is_active ?? rule.is_active,
    };
    if (
      !Number.isInteger(next.day_of_week) ||
      next.day_of_week < 0 ||
      next.day_of_week > 6 ||
      !TIME_RE.test(next.start_time) ||
      !TIME_RE.test(next.end_time) ||
      normalizeTime(next.end_time) <= normalizeTime(next.start_time) ||
      typeof next.is_active !== "boolean"
    ) {
      return noStoreJson({ error: "Invalid payload." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return noStoreJson({ error: "Server misconfigured." }, { status: 500 });
    }
    const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error: updateError } = await admin
      .from("tutor_availability")
      .update({
        day_of_week: next.day_of_week,
        start_time: normalizeTime(next.start_time),
        end_time: normalizeTime(next.end_time),
        is_active: next.is_active,
      })
      .eq("id", ruleId)
      .eq("tutor_id", user.id);
    if (updateError) {
      console.error("[availability/rules PATCH] update failed:", updateError);
      return noStoreJson({ error: "Could not update rule." }, { status: 400 });
    }

    return noStoreJson({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[availability/rules PATCH] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: ruleId } = await context.params;
    if (!ruleId || typeof ruleId !== "string") {
      return noStoreJson({ error: "Invalid rule id." }, { status: 400 });
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
      .select("is_tutor")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_tutor) {
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

    const { data: rule, error: ruleError } = await admin
      .from("tutor_availability")
      .select("id,tutor_id")
      .eq("id", ruleId)
      .single();

    if (ruleError || !rule || rule.tutor_id !== user.id) {
      return noStoreJson({ error: "Rule not found." }, { status: 404 });
    }

    const { data: lessons, error: lessonsError } = await admin
      .from("lessons")
      .select("id")
      .eq("availability_rule_id", ruleId)
      .eq("status", "available");

    if (lessonsError) {
      return noStoreJson(
        { error: "Could not load generated lessons." },
        { status: 400 }
      );
    }

    const lessonIds = (lessons || []).map((l) => l.id as number);

    if (lessonIds.length > 0) {
      const { data: bookings, error: bookingsError } = await admin
        .from("bookings")
        .select("lesson_id")
        .in("lesson_id", lessonIds)
        .in("status", ["pending", "confirmed"]);

      if (bookingsError) {
        return noStoreJson(
          { error: "Could not verify bookings." },
          { status: 400 }
        );
      }

      const booked = new Set(
        (bookings || []).map((b) => b.lesson_id as number)
      );
      const toWithdraw = lessonIds.filter((id) => !booked.has(id));

      // Mark free slots cancelled instead of deleting them: old bookings may
      // still reference them (FK) and deleting would cascade to reviews.
      if (toWithdraw.length > 0) {
        const { error: withdrawErr } = await admin
          .from("lessons")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .in("id", toWithdraw)
          .eq("status", "available");
        if (withdrawErr) {
          console.error("[availability/rules DELETE] could not withdraw slots:", withdrawErr);
          return noStoreJson(
            { error: "Could not remove slots." },
            { status: 400 }
          );
        }
      }
    }

    const { error: delRuleErr } = await admin
      .from("tutor_availability")
      .delete()
      .eq("id", ruleId);

    if (delRuleErr) {
      return noStoreJson(
        publicError(delRuleErr, "Could not delete rule."),
        { status: 400 }
      );
    }

    return noStoreJson({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[availability/rules DELETE] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}