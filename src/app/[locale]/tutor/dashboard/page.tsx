import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { fetchTutorReviewStatsMap } from "@/lib/supabase/tutor-review-stats";
import { fetchStudentNames } from "@/lib/supabase/student-names";
import TutorDashboardClient from "./TutorDashboardClient";
import type { Booking } from "@/types/booking";
import type { LessonWithRelations } from "@/types/lesson";
import {
  startOfTodayAsLessonTimestamp,
  endOfTodayAsLessonTimestamp,
  startOfMonthAsLessonTimestamp,
} from "@/lib/datetime/lessonTime";
import { isPendingExpired } from "@/lib/bookings/pendingExpiry";

type PendingBookingItem = {
  booking: Booking;
  lesson: LessonWithRelations | null;
  customSubjectName?: string | null;
  studentName?: string | null;
};

interface DashboardStats {
  classesThisMonth: number;
  avgRating: number | null;
  earningsThisMonth: number;
}

interface TodayLesson {
  id: number;
  scheduled_date_time: string;
  duration_minutes: number;
  price: number;
  status: string;
  meet_link: string | null;
  subject: { name: string } | null;
  student: { id: string; user: { username: string } | null } | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return buildPageMetadata({
    locale,
    path: "/tutor/dashboard",
    title: t("tutorDashboard.title"),
    description: t("tutorDashboard.description"),
    robots: { index: false, follow: false },
  });
}

export default async function TutorDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const startOfMonth = startOfMonthAsLessonTimestamp();
  const todayStartTs = startOfTodayAsLessonTimestamp();
  const todayEndTs = endOfTodayAsLessonTimestamp();

  // The role check runs with the data queries (RLS already limits them to own rows).
  const [
    { data: userProfile },
    pendingRes,
    lessonsStatsRes,
    tutorProfileRes,
    todayLessonsRes,
    reviewStatsMap,
  ] =
    await Promise.all([
      supabase.from("users").select("is_tutor").eq("id", user.id).single(),
      supabase
        .from("bookings")
        .select(
          "id, student_id, tutor_id, lesson_id, course_id, requested_date, status, notes, created_at, updated_at, requested_subject_id, requested_scheduled_date_time, requested_duration_minutes"
        )
        .eq("tutor_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("lessons")
        .select("price")
        .eq("tutor_id", user.id)
        .eq("status", "completed")
        .gte("scheduled_date_time", startOfMonth),
      supabase.from("tutor_profiles").select("rating").eq("id", user.id).single(),
      supabase
        .from("lessons")
        .select(
          "id, student_id, scheduled_date_time, duration_minutes, price, status, meet_link, subject:subjects(name)"
        )
        .eq("tutor_id", user.id)
        .in("status", ["confirmed", "scheduled"])
        .gte("scheduled_date_time", todayStartTs)
        .lte("scheduled_date_time", todayEndTs)
        .order("scheduled_date_time", { ascending: true }),
      fetchTutorReviewStatsMap(supabase, [user.id]),
    ]);

  if (!userProfile?.is_tutor) {
    redirect(`/${locale}/dashboard`);
  }

  const allPending = (pendingRes.data ?? []) as Booking[];

  const slotBookings = allPending.filter(
    (booking) => typeof booking.lesson_id === "number"
  );
  const customBookings = allPending.filter(
    (booking) =>
      booking.lesson_id == null &&
      typeof booking.requested_scheduled_date_time === "string" &&
      !isPendingExpired({
        created_at: booking.created_at,
        start: booking.requested_scheduled_date_time,
      }) &&
      typeof booking.requested_subject_id === "number"
  );

  const lessonIds = slotBookings
    .map((booking) => booking.lesson_id)
    .filter((lessonId): lessonId is number => typeof lessonId === "number");
  const customSubjectIds = [
    ...new Set(
      customBookings
        .map((b) => b.requested_subject_id)
        .filter((id): id is number => typeof id === "number")
    ),
  ];

  let lessonById = new Map<number, LessonWithRelations>();
  if (lessonIds.length > 0) {
    const { data: pendingLessons } = await supabase
      .from("lessons")
      .select(
        "id, tutor_id, student_id, subject_id, price, scheduled_date_time, duration_minutes, status, meet_link, google_event_id, created_at, updated_at, subject:subjects(id, name, description, icon)"
      )
      .in("id", lessonIds);

    lessonById = new Map(
      ((pendingLessons ?? []) as unknown as LessonWithRelations[]).map((lesson) => [
        lesson.id,
        lesson,
      ])
    );
  }

  let subjectNameById = new Map<number, string>();
  if (customSubjectIds.length > 0) {
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id, name")
      .in("id", customSubjectIds);
    subjectNameById = new Map(
      (subjects ?? []).map((s) => [s.id as number, s.name as string])
    );
  }

  const rawTodayLessons = (todayLessonsRes.data ?? []) as unknown as Array<
    TodayLesson & { student_id: string | null }
  >;
  const studentNameById = await fetchStudentNames(supabase, [
    ...allPending.map((b) => b.student_id),
    ...rawTodayLessons.map((l) => l.student_id),
  ]);

  const pendingItems: PendingBookingItem[] = [
    ...customBookings.map((booking) => ({
      booking,
      lesson: null,
      studentName: studentNameById.get(booking.student_id) ?? null,
      customSubjectName:
        typeof booking.requested_subject_id === "number"
          ? subjectNameById.get(booking.requested_subject_id) ?? null
          : null,
    })),
    // F014: hide requests already past their deadline (the next read or
    // answer expires them).
    ...slotBookings
      .filter((booking) => {
        const lesson =
          typeof booking.lesson_id === "number" ? lessonById.get(booking.lesson_id) : null;
        return !isPendingExpired({
          created_at: booking.created_at,
          start: lesson?.scheduled_date_time ?? null,
        });
      })
      .map((booking) => ({
        booking,
        studentName: studentNameById.get(booking.student_id) ?? null,
        lesson:
          typeof booking.lesson_id === "number"
            ? lessonById.get(booking.lesson_id) ?? null
            : null,
      })),
  ];

  const classesThisMonth = lessonsStatsRes.data?.length ?? 0;
  const earningsThisMonth = (lessonsStatsRes.data ?? []).reduce(
    (sum, lesson) => sum + (lesson.price ?? 0),
    0
  );

  const fromReviews = reviewStatsMap?.get(user.id);
  const stats: DashboardStats = {
    classesThisMonth,
    avgRating:
      fromReviews?.rating ?? tutorProfileRes.data?.rating ?? null,
    earningsThisMonth,
  };

  const todayLessons: TodayLesson[] = rawTodayLessons.map(({ student_id, ...lesson }) => ({
    ...lesson,
    student: student_id
      ? { id: student_id, user: { username: studentNameById.get(student_id) ?? "" } }
      : null,
  }));

  return (
    <TutorDashboardClient
      initialData={{
        user: { id: user.id, email: user.email ?? null },
        pendingItems,
        stats,
        todayLessons,
      }}
    />
  );
}
