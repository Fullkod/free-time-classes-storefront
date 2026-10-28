import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_TIMEZONE } from "@/lib/datetime/lessonTime";
import { epochToWallClock } from "@/lib/datetime/zonedTime";

// Booking/slot state changes on every request/response: never reuse a
// browser-cached copy (it made confirmed requests reappear as pending).
const PRIVATE_READ_CACHE_CONTROL = "private, no-store";

type CalendarItem = {
  lessonId: number;
  subjectName: string | null;
  scheduledDateTime: string | null;
  durationMinutes: number;
  price: number;
  lessonStatus: string;
  bookingStatus: string | null;
};

/**
 * The calendar sends instants (ISO with offset); lessons are Madrid
 * wall-clock, so the range is compared in Madrid (PRP-002). A value without
 * offset is taken as Madrid wall-clock already.
 */
function toLessonTimestamp(value: string | null): string | null {
  if (!value) return null;
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value)) return value.slice(0, 19);
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : epochToWallClock(epoch, BUSINESS_TIMEZONE);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("is_tutor")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_tutor) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const start = toLessonTimestamp(request.nextUrl.searchParams.get("start"));
    const end = toLessonTimestamp(request.nextUrl.searchParams.get("end"));
    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing start or end query params." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server misconfigured: missing Supabase env vars." },
        { status: 500 }
      );
    }

    const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: lessons, error: lessonsError } = await admin
      .from("lessons")
      .select("id,subject_id,scheduled_date_time,duration_minutes,price,status")
      .eq("tutor_id", user.id)
      .gte("scheduled_date_time", start)
      .lte("scheduled_date_time", end)
      .order("scheduled_date_time", { ascending: true });

    if (lessonsError) {
      return NextResponse.json(
        { error: lessonsError.message || "Failed to load lessons." },
        { status: 400 }
      );
    }

    if (!lessons || lessons.length === 0) {
      return NextResponse.json(
        { items: [] as CalendarItem[] },
        {
          status: 200,
          headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL },
        }
      );
    }

    const lessonIds = lessons.map((lesson) => lesson.id);
    const subjectIds = [
      ...new Set(lessons.map((lesson) => lesson.subject_id).filter(Boolean)),
    ] as number[];

    const [{ data: subjects, error: subjectsError }, { data: bookings, error: bookingsError }] =
      await Promise.all([
        admin.from("subjects").select("id,name").in("id", subjectIds),
        admin
          .from("bookings")
          .select("lesson_id,status,updated_at")
          .in("lesson_id", lessonIds)
          .order("updated_at", { ascending: false }),
      ]);

    if (subjectsError || bookingsError) {
      return NextResponse.json(
        { error: "Failed to load lesson details." },
        { status: 400 }
      );
    }

    const subjectNameById = new Map((subjects || []).map((row) => [row.id, row.name]));
    const bookingsByLesson = new Map<number, Array<{ status: string }>>();

    for (const booking of bookings || []) {
      if (typeof booking.lesson_id !== "number") continue;
      const current = bookingsByLesson.get(booking.lesson_id) || [];
      current.push({ status: booking.status });
      bookingsByLesson.set(booking.lesson_id, current);
    }

    const pickBookingStatus = (lessonId: number): string | null => {
      const lessonBookings = bookingsByLesson.get(lessonId) || [];
      const pending = lessonBookings.find((b) => b.status === "pending");
      if (pending) return "pending";
      const confirmed = lessonBookings.find((b) => b.status === "confirmed");
      if (confirmed) return "confirmed";
      return null;
    };

    const items: CalendarItem[] = lessons.map((lesson) => ({
      lessonId: lesson.id,
      subjectName: subjectNameById.get(lesson.subject_id) ?? null,
      scheduledDateTime: lesson.scheduled_date_time,
      durationMinutes: lesson.duration_minutes,
      price: lesson.price,
      lessonStatus: lesson.status,
      bookingStatus: pickBookingStatus(lesson.id),
    }));

    return NextResponse.json(
      { items },
      {
        status: 200,
        headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL },
      }
    );
  } catch (err) {
    console.error("[bookings/tutor/calendar] error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

