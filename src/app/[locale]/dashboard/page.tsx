import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createCatalogServerClient } from "@/lib/supabase/server-public";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import DashboardClient from "./DashboardClient";
import { resolveCourseTutorUser } from "@/lib/supabase/course-tutor";
import {
  nowAsLessonTimestamp,
  startOfMonthAsLessonTimestamp,
  startOfTodayAsLessonTimestamp,
} from "@/lib/datetime/lessonTime";
import type { StudentProfile } from "@/types/student";
import type { DashboardRecommendedCourse } from "./DashboardDeferredRecommended";

interface UpcomingLessonRaw {
  id: string;
  scheduled_date_time: string;
  duration_minutes: number;
  status: string;
  meet_link: string | null;
  subject: { name: string }[] | { name: string } | null;
  tutor:
    | {
        id: string;
        user:
          | { username: string; profile_picture: string | null }[]
          | { username: string; profile_picture: string | null }
          | null;
      }[]
    | {
        id: string;
        user:
          | { username: string; profile_picture: string | null }[]
          | { username: string; profile_picture: string | null }
          | null;
      }
    | null;
}

interface UpcomingLesson {
  id: string;
  scheduled_date_time: string;
  duration_minutes: number;
  status: string;
  subjectName: string | null;
  tutorUsername: string;
  tutorPicture: string | null;
  meetLink: string | null;
}

interface DashboardStats {
  totalClasses: number;
  totalHours: number;
  totalTutors: number;
  pendingRequests: number;
  monthlyClasses: number;
  streakDays: number;
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
    path: "/dashboard",
    title: t("dashboard.title"),
    description: t("dashboard.description"),
    robots: { index: false, follow: false },
  });
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const authUser = await getSessionUser(supabase);

  if (!authUser) {
    redirect(`/${locale}/login`);
  }

  const catalog = createCatalogServerClient();

  const [{ data: userRow }, completedRes, pendingRes, upcomingRes, recommendedRes, profileRes] =
    await Promise.all([
      supabase
        .from("users")
        .select("username, is_tutor, profile_picture")
        .eq("id", authUser.id)
        .single(),

      supabase
        .from("lessons")
        .select("id, scheduled_date_time, duration_minutes, tutor_id")
        .eq("student_id", authUser.id)
        .eq("status", "completed"),

      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("student_id", authUser.id)
        .eq("status", "pending"),

      supabase
        .from("lessons")
        .select(
          "id, scheduled_date_time, duration_minutes, status, meet_link, subject:subjects(name), tutor:tutor_profiles!lessons_tutor_id_fkey(id, user:users!tutor_profiles_id_fkey(username, profile_picture))"
        )
        .eq("student_id", authUser.id)
        .in("status", ["confirmed", "scheduled"])
        .gte("scheduled_date_time", nowAsLessonTimestamp())
        .order("scheduled_date_time", { ascending: true })
        .limit(5),

      catalog
        .from("courses")
        .select(
          `
        id,
        title,
        cover_image,
        rating,
        duration_minutes,
        subject:subjects(name),
        tutor_profile:tutor_profiles!courses_tutor_id_fkey (
          id,
          user:users!tutor_profiles_id_fkey (id, username)
        )
      `
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(6),

      supabase
        .from("student_profiles")
        .select("language_level")
        .eq("id", authUser.id)
        .maybeSingle(),
    ]);

  const completed = completedRes.data ?? [];
  const totalHoursValue = completed.reduce(
    (sum, l) => sum + (l.duration_minutes ?? 0),
    0
  );
  const uniqueTutors = new Set(completed.map((l) => l.tutor_id)).size;

  const monthStart = startOfMonthAsLessonTimestamp();
  const monthlyClasses = completed.filter(
    (l) => (l.scheduled_date_time ?? "") >= monthStart
  ).length;

  const completedDays = new Set<string>(
    completed
      .map((l) => l.scheduled_date_time?.slice(0, 10))
      .filter((d): d is string => Boolean(d))
  );
  // Lesson days are Madrid dates, so count back from Madrid's today (F108).
  let streakDays = 0;
  const todayMs = Date.parse(`${startOfTodayAsLessonTimestamp().slice(0, 10)}T00:00:00Z`);
  for (let offset = 0; offset < 60; offset++) {
    const key = new Date(todayMs - offset * 86_400_000).toISOString().slice(0, 10);
    if (completedDays.has(key)) {
      streakDays += 1;
    } else if (offset > 0) {
      break;
    }
  }

  const stats: DashboardStats = {
    totalClasses: completed.length,
    totalHours: Math.round((totalHoursValue / 60) * 10) / 10,
    totalTutors: uniqueTutors,
    pendingRequests: pendingRes.count ?? 0,
    monthlyClasses,
    streakDays,
  };

  const studentProfileRow =
    (profileRes.data as Pick<StudentProfile, "language_level"> | null) ?? null;

  const rawLessons = (upcomingRes.data ?? []) as UpcomingLessonRaw[];
  const rawRecommended = (recommendedRes.data ?? []) as Array<{
    id: string;
    title: string;
    cover_image: string | null;
    rating: number | null;
    duration_minutes: number;
    subject?: { name: string } | { name: string }[] | null;
    tutor_profile?: {
      user?: { username: string } | { username: string }[] | null;
    } | null;
  }>;

  const recommendedCourses: DashboardRecommendedCourse[] = rawRecommended.map(
    (row) => {
      const subj = row.subject;
      const subjectName = Array.isArray(subj)
        ? subj[0]?.name
        : subj?.name ?? null;
      const tutorUser = resolveCourseTutorUser(row.tutor_profile);
      const tutorName = tutorUser?.username?.trim() || null;
      return {
        id: row.id,
        title: row.title,
        cover_image: row.cover_image ?? null,
        rating: row.rating ?? null,
        duration_minutes: row.duration_minutes,
        subjectName,
        tutorName,
      };
    }
  );

  const upcomingLessons: UpcomingLesson[] = rawLessons.map((l) => {
    const subj = Array.isArray(l.subject) ? l.subject[0] : l.subject;
    const tut = Array.isArray(l.tutor) ? l.tutor[0] : l.tutor;
    const tutUser = tut ? (Array.isArray(tut.user) ? tut.user[0] : tut.user) : null;
    return {
      id: l.id,
      scheduled_date_time: l.scheduled_date_time,
      duration_minutes: l.duration_minutes,
      status: l.status,
      subjectName: subj?.name ?? null,
      tutorUsername: tutUser?.username?.trim() ?? "",
      tutorPicture: tutUser?.profile_picture ?? null,
      meetLink: l.meet_link ?? null,
    };
  });

  return (
    <DashboardClient
      user={{
        username: userRow?.username ?? null,
        is_tutor: userRow?.is_tutor ?? false,
        profile_picture: userRow?.profile_picture ?? null,
      }}
      stats={stats}
      upcomingLessons={upcomingLessons}
      recommendedCourses={recommendedCourses}
      languageLevel={studentProfileRow?.language_level ?? null}
    />
  );
}
