import HomeContent from "@/components/HomeContentFreetime";
import { resolveCourseTutorUser } from "@/lib/supabase/course-tutor";
import { fetchHomeFeaturedTeachers } from "@/lib/supabase/server-queries/home-featured-teachers";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { createCatalogServerClient } from "@/lib/supabase/server-public";
import type { HomeCategory, HomeCourseCard, HomeFeaturedTeacher } from "@/types/home";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return buildPageMetadata({
    locale,
    path: "/",
    title: t("home.title"),
    description: t("home.description"),
  });
}

function HomeFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

async function HomePageContent() {
  const { courses, featuredTeachers, categories } = await getHomePageDataCached();

  return (
    <HomeContent
      initialCourses={courses}
      initialFeaturedTeachers={featuredTeachers}
      categories={categories}
    />
  );
}

const getHomePageDataCached = unstable_cache(
  async (): Promise<{
    courses: HomeCourseCard[];
    featuredTeachers: HomeFeaturedTeacher[];
    categories: HomeCategory[];
  }> => {
    const catalog = createCatalogServerClient();
    const { data } = await catalog
      .from("courses")
      .select(
        `
      id,
      title,
      description,
      level,
      max_students,
      cover_image,
      subject:subjects ( id, name ),
      tutor_profile:tutor_profiles!courses_tutor_id_fkey (
        id,
        user:users!tutor_profiles_id_fkey (
          id,
          username
        )
      )
    `
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const courses: HomeCourseCard[] = ((data ?? []) as Array<{
      id: number;
      title: string;
      description: string;
      level: HomeCourseCard["level"];
      max_students: number;
      cover_image?: string | null;
      subject?: { id: number; name: string } | { id: number; name: string }[] | null;
      tutor_profile?: {
        user?: { id: string; username: string } | null;
      } | null;
    }>).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      level: row.level,
      max_students: row.max_students,
      cover_image: row.cover_image ?? null,
      tutor: resolveCourseTutorUser(row.tutor_profile),
    }));

    const featuredTeachers = await fetchHomeFeaturedTeachers(catalog, courses);

    // Real categories: subjects with active courses, most courses first.
    const bySubject = new Map<number, HomeCategory>();
    for (const row of (data ?? []) as Array<{ subject?: { id: number; name: string } | { id: number; name: string }[] | null }>) {
      const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
      if (!subject) continue;
      const current = bySubject.get(subject.id) ?? { id: subject.id, name: subject.name, coursesCount: 0 };
      current.coursesCount += 1;
      bySubject.set(subject.id, current);
    }
    const categories = [...bySubject.values()]
      .sort((a, b) => b.coursesCount - a.coursesCount || a.name.localeCompare(b.name))
      .slice(0, 6);

    return { courses, featuredTeachers, categories };
  },
  ["public-home-page-v4"],
  { revalidate: 3600, tags: ["courses", "home"] }
);

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  unstable_setRequestLocale(locale);
  // Signed-in users are redirected to /dashboard by the middleware.

  return (
    <Suspense fallback={<HomeFallback />}>
      <HomePageContent />
    </Suspense>
  );
}
