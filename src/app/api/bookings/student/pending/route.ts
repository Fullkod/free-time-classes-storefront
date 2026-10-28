import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { expirePendingBookings } from "@/lib/bookings/expirePending";
import { nowAsLessonTimestamp } from "@/lib/datetime/lessonTime";

// Booking/slot state changes on every request/response: never reuse a
// browser-cached copy (it made confirmed requests reappear as pending).
const PRIVATE_READ_CACHE_CONTROL = "private, no-store";

type PendingRequestItem = {
  bookingId: number;
  tutorId: string;
  tutorName: string | null;
  subjectName: string | null;
  scheduledDateTime: string | null;
  durationMinutes: number | null;
  price: number | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

    // F014: expire this user's overdue requests before listing them.
    await expirePendingBookings(admin, { studentId: user.id });

    const { data: bookings, error: bookingsError } = await admin
      .from("bookings")
      .select("id,tutor_id,lesson_id,status")
      .eq("student_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (bookingsError) {
      return NextResponse.json(
        { error: bookingsError.message || "Failed to load pending bookings." },
        { status: 400 }
      );
    }

    const pendingBookings = (bookings || []).filter(
      (booking) => typeof booking.lesson_id === "number"
    );
    if (pendingBookings.length === 0) {
      return NextResponse.json(
        { items: [] as PendingRequestItem[] },
        {
          status: 200,
          headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL },
        }
      );
    }

    const lessonIds = pendingBookings.map((booking) => booking.lesson_id as number);
    const tutorIds = [...new Set(pendingBookings.map((booking) => booking.tutor_id))];

    const [{ data: lessons, error: lessonsError }, { data: users, error: usersError }] =
      await Promise.all([
        admin
          .from("lessons")
          .select("id,subject_id,scheduled_date_time,duration_minutes,price")
          .in("id", lessonIds)
          .gte("scheduled_date_time", nowAsLessonTimestamp()),
        admin.from("users").select("id,username").in("id", tutorIds),
      ]);

    if (lessonsError || usersError) {
      return NextResponse.json(
        { error: "Failed to load pending booking details." },
        { status: 400 }
      );
    }

    const subjectIds = [
      ...new Set((lessons || []).map((lesson) => lesson.subject_id).filter(Boolean)),
    ] as number[];
    const { data: subjects, error: subjectsError } = await admin
      .from("subjects")
      .select("id,name")
      .in("id", subjectIds);

    if (subjectsError) {
      return NextResponse.json(
        { error: "Failed to load subjects for pending bookings." },
        { status: 400 }
      );
    }

    const lessonById = new Map((lessons || []).map((lesson) => [lesson.id, lesson]));
    const userNameById = new Map((users || []).map((row) => [row.id, row.username]));
    const subjectNameById = new Map((subjects || []).map((row) => [row.id, row.name]));

    const items: PendingRequestItem[] = pendingBookings
      .filter((booking) => lessonById.has(booking.lesson_id as number))
      .map((booking) => {
        const lesson = lessonById.get(booking.lesson_id as number);
        return {
          bookingId: booking.id,
          tutorId: booking.tutor_id,
          tutorName: userNameById.get(booking.tutor_id) ?? null,
          subjectName: lesson ? subjectNameById.get(lesson.subject_id) ?? null : null,
          scheduledDateTime: lesson?.scheduled_date_time ?? null,
          durationMinutes: lesson?.duration_minutes ?? null,
          price: lesson?.price ?? null,
        };
      });

    return NextResponse.json(
      { items },
      {
        status: 200,
        headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL },
      }
    );
  } catch (err) {
    console.error("[bookings/student/pending] error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

