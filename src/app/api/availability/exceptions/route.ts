import { NextRequest, NextResponse } from "next/server";
import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_TIMEZONE } from "@/lib/datetime/lessonTime";
import { epochToWallClock, wallClockToEpoch } from "@/lib/datetime/zonedTime";
import { loadTutorTimeZone } from "@/lib/availability/tutorTimeZone";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

type BlockedBody = {
  type: "blocked";
  exception_date: string;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
};

type ExtraBody = {
  type: "extra";
  exception_date: string;
  start_time: string;
  end_time: string;
  subject_id: number;
  duration_minutes: number;
  price: number;
  reason?: string | null;
};

type Body = BlockedBody | ExtraBody;

function normalizeTime(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const v = String(value).trim();
  if (v.length === 5) return `${v}:00`;
  return v;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

async function deleteAvailableLessonsInRange(
  admin: SupabaseClient,
  tutorId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<{ error?: string }> {
  const { data: lessons, error: lessonsError } = await admin
    .from("lessons")
    .select("id")
    .eq("tutor_id", tutorId)
    .eq("status", "available")
    .gte("scheduled_date_time", rangeStart)
    .lt("scheduled_date_time", rangeEnd);

  if (lessonsError) {
    return { error: "Could not load lessons to clear." };
  }

  const lessonIds = (lessons ?? []).map((l: { id: number }) => l.id);
  if (lessonIds.length === 0) return {};

  const { data: bookings, error: bookingsError } = await admin
    .from("bookings")
    .select("lesson_id")
    .in("lesson_id", lessonIds)
    .in("status", ["pending", "confirmed"]);

  if (bookingsError) {
    return { error: "Could not verify bookings." };
  }

  const booked = new Set(
    (bookings ?? []).map((b: { lesson_id: number }) => b.lesson_id)
  );
  const toWithdraw = lessonIds.filter((id) => !booked.has(id));
  return withdrawAvailableLessons(admin, toWithdraw);
}

/**
 * Takes free slots off sale. They are marked cancelled instead of deleted:
 * old cancelled/rejected bookings may still reference them (FK), and the
 * history stays intact.
 */
async function withdrawAvailableLessons(
  admin: SupabaseClient,
  lessonIds: number[]
): Promise<{ error?: string }> {
  if (lessonIds.length === 0) return {};
  const { error } = await admin
    .from("lessons")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .in("id", lessonIds)
    .eq("status", "available");
  if (error) {
    console.error("[availability/exceptions] could not withdraw slots:", error);
    return { error: "Could not remove slots." };
  }
  return {};
}

export async function POST(request: NextRequest) {
  try {
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

    const body = (await request.json()) as Partial<Body>;
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

    if (body.type === "blocked") {
      const exceptionDate =
        typeof body.exception_date === "string" ? body.exception_date : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) {
        return noStoreJson({ error: "Invalid exception_date." }, { status: 400 });
      }

      const st = normalizeTime(body.start_time);
      const et = normalizeTime(body.end_time);
      if ((st == null) !== (et == null)) {
        return noStoreJson(
          { error: "Provide both start_time and end_time, or neither for full day." },
          { status: 400 }
        );
      }

      const { data: inserted, error: insErr } = await admin
        .from("availability_exceptions")
        .insert({
          tutor_id: user.id,
          exception_date: exceptionDate,
          start_time: st,
          end_time: et,
          type: "blocked",
          reason: body.reason ?? null,
        })
        .select()
        .single();

      if (insErr || !inserted) {
        return noStoreJson(
          { error: insErr?.message || "Could not save exception." },
          { status: 400 }
        );
      }

      const [y, mo, da] = exceptionDate.split("-").map(Number);
      const dayStart = `${exceptionDate}T00:00:00`;
      const nextDay = new Date(y, mo - 1, da + 1);
      const dayEnd = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}T00:00:00`;

      if (st == null && et == null) {
        const clearResult = await deleteAvailableLessonsInRange(
          admin,
          user.id,
          dayStart,
          dayEnd
        );
        if (clearResult.error) {
          await admin.from("availability_exceptions").delete().eq("id", inserted.id);
          return noStoreJson({ error: clearResult.error }, { status: 400 });
        }
      } else if (st && et) {
        const { data: lessons, error: lessonsError } = await admin
          .from("lessons")
          .select("id,scheduled_date_time,duration_minutes")
          .eq("tutor_id", user.id)
          .eq("status", "available")
          .gte("scheduled_date_time", dayStart)
          .lt("scheduled_date_time", dayEnd);

        if (lessonsError) {
          await admin.from("availability_exceptions").delete().eq("id", inserted.id);
          return noStoreJson(
            { error: "Could not load lessons to clear." },
            { status: 400 }
          );
        }

        const rs = new Date(
          y,
          mo - 1,
          da,
          parseInt(st.slice(0, 2), 10),
          parseInt(st.slice(3, 5), 10),
          0,
          0
        ).getTime();
        const re = new Date(
          y,
          mo - 1,
          da,
          parseInt(et.slice(0, 2), 10),
          parseInt(et.slice(3, 5), 10),
          0,
          0
        ).getTime();

        const overlapping = (lessons || []).filter((row) => {
          const raw = String(row.scheduled_date_time).replace(" ", "T");
          const startStr = raw.slice(0, 19);
          const slotStart = new Date(
            parseInt(startStr.slice(0, 4), 10),
            parseInt(startStr.slice(5, 7), 10) - 1,
            parseInt(startStr.slice(8, 10), 10),
            parseInt(startStr.slice(11, 13), 10),
            parseInt(startStr.slice(14, 16), 10),
            0,
            0
          ).getTime();
          const dur = (row.duration_minutes as number) * 60_000;
          const slotEnd = slotStart + dur;
          return slotStart < re && slotEnd > rs;
        });

        const lessonIds = overlapping.map((l) => l.id as number);
        if (lessonIds.length > 0) {
          const { data: bookings, error: bookingsError } = await admin
            .from("bookings")
            .select("lesson_id")
            .in("lesson_id", lessonIds)
            .in("status", ["pending", "confirmed"]);

          if (bookingsError) {
            await admin.from("availability_exceptions").delete().eq("id", inserted.id);
            return noStoreJson(
              { error: "Could not verify bookings." },
              { status: 400 }
            );
          }

          const booked = new Set(
            (bookings || []).map((b) => b.lesson_id as number)
          );
          const withdrawResult = await withdrawAvailableLessons(
            admin,
            lessonIds.filter((id) => !booked.has(id))
          );
          if (withdrawResult.error) {
            await admin.from("availability_exceptions").delete().eq("id", inserted.id);
            return noStoreJson({ error: withdrawResult.error }, { status: 400 });
          }
        }
      }

      // Booked classes are never cancelled by a block: tell the tutor how
      // many of them fall inside it so they can handle them. The block is in
      // the tutor's zone (PRP-002); classes are Madrid wall-clock.
      const tutorZone = await loadTutorTimeZone(admin, user.id);
      const blockStartMs =
        wallClockToEpoch(`${exceptionDate}T${st ?? "00:00:00"}`, tutorZone) ?? 0;
      const blockEndMs = et
        ? wallClockToEpoch(`${exceptionDate}T${et}`, tutorZone) ?? 0
        : blockStartMs + 24 * 60 * 60 * 1000;
      const { data: committed } = await admin
        .from("lessons")
        .select("scheduled_date_time, duration_minutes")
        .eq("tutor_id", user.id)
        .in("status", ["scheduled", "in_progress"])
        .gte(
          "scheduled_date_time",
          epochToWallClock(blockStartMs - 4 * 60 * 60 * 1000, BUSINESS_TIMEZONE)
        )
        .lt("scheduled_date_time", epochToWallClock(blockEndMs, BUSINESS_TIMEZONE));
      const bookedConflicts = (committed ?? []).filter((row) => {
        const startMs = wallClockToEpoch(
          String(row.scheduled_date_time).replace(" ", "T").slice(0, 19),
          BUSINESS_TIMEZONE
        );
        if (startMs == null) return false;
        const endMs = startMs + ((row.duration_minutes as number) ?? 0) * 60_000;
        return startMs < blockEndMs && endMs > blockStartMs;
      }).length;

      return noStoreJson({ id: inserted.id, bookedConflicts }, { status: 200 });
    }

    if (body.type === "extra") {
      // PRP-001: an extra window is only time; open times are computed.
      const exceptionDate =
        typeof body.exception_date === "string" ? body.exception_date : "";
      const st = normalizeTime(body.start_time);
      const et = normalizeTime(body.end_time);

      if (!st || !et || et <= st || !/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) {
        return noStoreJson({ error: "Invalid extra exception payload." }, { status: 400 });
      }

      // A window that has already ended can never be booked (F047). The
      // window is in the tutor's zone (PRP-002).
      const tutorZone = await loadTutorTimeZone(admin, user.id);
      const windowEndMs = wallClockToEpoch(`${exceptionDate}T${et}`, tutorZone);
      if (windowEndMs == null || windowEndMs <= Date.now()) {
        return noStoreJson(
          { error: "This window is in the past.", code: "window_in_past" },
          { status: 400 }
        );
      }

      const { data: inserted, error: insErr } = await admin
        .from("availability_exceptions")
        .insert({
          tutor_id: user.id,
          exception_date: exceptionDate,
          start_time: st,
          end_time: et,
          type: "extra",
          reason: body.reason ?? null,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        return noStoreJson(
          { error: insErr?.message || "Could not save exception." },
          { status: 400 }
        );
      }

      return noStoreJson({ id: inserted.id }, { status: 200 });
    }

    return noStoreJson({ error: "Invalid type." }, { status: 400 });
  } catch (err) {
    console.error("[availability/exceptions POST] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
