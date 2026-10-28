import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { expirePendingBookings } from "@/lib/bookings/expirePending";
import {
  nowAsLessonTimestamp,
  nowPlusMinutesAsLessonTimestamp,
} from "@/lib/datetime/lessonTime";

// Booking/slot state changes on every request/response: never reuse a
// browser-cached copy (it made confirmed requests reappear as pending).
const PRIVATE_READ_CACHE_CONTROL = "private, no-store";

const CUSTOM_REQUEST_EXPIRY_MINUTES = 15;

type PendingRequestItem = {
  bookingId: number;
  studentId: string;
  studentName: string | null;
  subjectName: string | null;
  scheduledDateTime: string | null;
  durationMinutes: number | null;
  price: number | null;
  isCustomRequest: boolean;
  notes: string | null;
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

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("is_tutor")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_tutor) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
    await expirePendingBookings(admin, { tutorId: user.id });

    const { data: bookings, error: bookingsError } = await admin
      .from("bookings")
      .select(
        "id,student_id,lesson_id,status,notes,requested_subject_id,requested_scheduled_date_time,requested_duration_minutes"
      )
      .eq("tutor_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (bookingsError) {
      return NextResponse.json(
        { error: bookingsError.message || "Failed to load pending bookings." },
        { status: 400 }
      );
    }

    const allBookings = bookings || [];
    const slotBookings = allBookings.filter(
      (booking) => typeof booking.lesson_id === "number"
    );
    const customRequests = allBookings.filter(
      (booking) => booking.lesson_id == null
    );

    const expiryCutoff = nowPlusMinutesAsLessonTimestamp(CUSTOM_REQUEST_EXPIRY_MINUTES);
    const validCustomRequests = customRequests.filter((booking) => {
      const ts = booking.requested_scheduled_date_time as string | null;
      return typeof ts === "string" && ts >= expiryCutoff;
    });

    if (slotBookings.length === 0 && validCustomRequests.length === 0) {
      return NextResponse.json(
        { items: [] as PendingRequestItem[] },
        {
          status: 200,
          headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL },
        }
      );
    }

    const lessonIds = slotBookings.map((booking) => booking.lesson_id as number);
    const studentIds = [
      ...new Set([
        ...slotBookings.map((b) => b.student_id),
        ...validCustomRequests.map((b) => b.student_id),
      ]),
    ];

    const lessonsPromise = lessonIds.length
      ? admin
          .from("lessons")
          .select("id,subject_id,scheduled_date_time,duration_minutes,price")
          .in("id", lessonIds)
          .gte("scheduled_date_time", nowAsLessonTimestamp())
      : Promise.resolve({ data: [], error: null });

    const usersPromise = studentIds.length
      ? admin.from("users").select("id,username").in("id", studentIds)
      : Promise.resolve({ data: [], error: null });

    const [
      { data: lessons, error: lessonsError },
      { data: users, error: usersError },
    ] = await Promise.all([lessonsPromise, usersPromise]);

    if (lessonsError || usersError) {
      return NextResponse.json(
        { error: "Failed to load pending booking details." },
        { status: 400 }
      );
    }

    const subjectIds = [
      ...new Set([
        ...((lessons || []).map((lesson) => lesson.subject_id) as number[]),
        ...(validCustomRequests
          .map((b) => b.requested_subject_id)
          .filter((id): id is number => typeof id === "number")),
      ]),
    ];

    const subjectsPromise = subjectIds.length
      ? admin.from("subjects").select("id,name").in("id", subjectIds)
      : Promise.resolve({ data: [], error: null });

    const { data: subjects, error: subjectsError } = await subjectsPromise;
    if (subjectsError) {
      return NextResponse.json(
        { error: "Failed to load subjects for pending bookings." },
        { status: 400 }
      );
    }

    const lessonById = new Map((lessons || []).map((lesson) => [lesson.id, lesson]));
    const userNameById = new Map((users || []).map((row) => [row.id, row.username]));
    const subjectNameById = new Map((subjects || []).map((row) => [row.id, row.name]));

    const slotItems: PendingRequestItem[] = slotBookings
      .filter((booking) => lessonById.has(booking.lesson_id as number))
      .map((booking) => {
        const lesson = lessonById.get(booking.lesson_id as number);
        return {
          bookingId: booking.id,
          studentId: booking.student_id,
          studentName: userNameById.get(booking.student_id) ?? null,
          subjectName: lesson ? subjectNameById.get(lesson.subject_id) ?? null : null,
          scheduledDateTime: lesson?.scheduled_date_time ?? null,
          durationMinutes: lesson?.duration_minutes ?? null,
          price: lesson?.price ?? null,
          isCustomRequest: false,
          notes: booking.notes ?? null,
        };
      });

    const customItems: PendingRequestItem[] = validCustomRequests.map((booking) => ({
      bookingId: booking.id,
      studentId: booking.student_id,
      studentName: userNameById.get(booking.student_id) ?? null,
      subjectName:
        typeof booking.requested_subject_id === "number"
          ? subjectNameById.get(booking.requested_subject_id) ?? null
          : null,
      scheduledDateTime: booking.requested_scheduled_date_time ?? null,
      durationMinutes: booking.requested_duration_minutes ?? null,
      price: null,
      isCustomRequest: true,
      notes: booking.notes ?? null,
    }));

    const items = [...customItems, ...slotItems];

    return NextResponse.json(
      { items },
      {
        status: 200,
        headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL },
      }
    );
  } catch (err) {
    console.error("[bookings/tutor/pending] error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
