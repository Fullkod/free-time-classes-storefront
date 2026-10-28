"use client";

import {
  getCourseCoverPublicUrl,
  getPublicUrl,
} from "@/lib/supabase/storage";
import type { HomeCourseCard, HomeFeaturedTeacher } from "@/types/home";
import { ArrowRight, AudioLines, Sparkles, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

function resolveAvatar(pic: string): string {
  const trimmed = pic?.trim?.() ?? "";
  if (!trimmed) return "/images/default-avatar.png";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) return trimmed;
  return getPublicUrl("avatars", trimmed);
}

const CATEGORIES: ReadonlyArray<{ id: string; count: string; hue: string }> = [
  { id: "languages", count: "412", hue: "#C9A86A" },
  { id: "music", count: "184", hue: "#B89B5E" },
  { id: "cooking", count: "96", hue: "#D4B57A" },
  { id: "tech", count: "273", hue: "#A8895A" },
  { id: "art", count: "158", hue: "#C8AB6E" },
  { id: "wellbeing", count: "122", hue: "#D9BD83" },
];

interface HomeContentProps {
  initialCourses: HomeCourseCard[];
  initialFeaturedTeachers: HomeFeaturedTeacher[];
}

export default function HomeContentFreetime({
  initialCourses,
  initialFeaturedTeachers,
}: HomeContentProps) {
  const t = useTranslations("home");
  const locale = useLocale();

  const popularCourses = useMemo(
    () =>
      initialCourses.slice(0, 4).map((course) => ({
        id: course.id,
        title: course.title,
        teacher: course.tutor?.username ?? "—",
        level: course.level ?? "",
        coverUrl: getCourseCoverPublicUrl(course.cover_image),
      })),
    [initialCourses]
  );

  const featuredTeachers = useMemo(
    () =>
      initialFeaturedTeachers.slice(0, 4).map((teacher) => ({
        ...teacher,
        profilePicture: resolveAvatar(teacher.profilePicture),
      })),
    [initialFeaturedTeachers]
  );

  return (
    <div className="overflow-x-hidden">
      {/* ───────── Hero ───────── */}
      <section className="px-6 pt-10 pb-12 md:px-9 md:pt-14 md:pb-16 lg:pb-20">
        <div className="mx-auto grid max-w-screen-2xl items-center gap-10 md:grid-cols-12 md:gap-12">
          {/* Left column */}
          <div className="md:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-ft-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ft-accent-deep">
              <Sparkles width={11} height={11} />
              {t("heroBadge")}
            </span>

            <h1 className="m-0 mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-ft-ink md:text-[54px]">
              {t("heroTitleBefore")}{" "}
              <span className="font-instrument-serif italic text-ft-accent-deep">
                {t("heroTitleAccent")}
              </span>{" "}
              {t("heroTitleAfter")}
            </h1>

            <p className="mb-8 mt-5 max-w-xl text-base leading-relaxed text-ft-ink-2 md:text-[17px]">
              {t("heroDescription")}
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/${locale}/tutors`}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ft-ink px-6 py-3.5 text-sm font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
              >
                {t("findTutors")}
                <ArrowRight width={14} height={14} />
              </Link>
              <Link
                href={`/${locale}/courses`}
                className="inline-flex items-center justify-center rounded-full border border-ft-line bg-ft-paper px-6 py-3.5 text-sm font-semibold text-ft-ink transition-colors hover:bg-ft-surface-1"
              >
                {t("browseCourses")}
              </Link>
            </div>

            {featuredTeachers.length > 0 && (
              <div className="mt-9 flex items-center gap-3.5">
                <div className="flex">
                  {featuredTeachers.slice(0, 4).map((tch, i) => (
                    <Image
                      key={tch.id}
                      src={tch.profilePicture}
                      alt={tch.name}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full border-2 border-ft-paper object-cover"
                      style={{ marginLeft: i ? -10 : 0 }}
                    />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ft-ink">
                    <Star
                      width={11}
                      height={11}
                      fill="currentColor"
                      stroke="none"
                      className="text-ft-accent"
                    />
                    {t("statRatingValue")} · {t("statLearnersValue")}{" "}
                    <span className="font-normal text-ft-ink-3">
                      {t("statLearnersLabel")}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right composition */}
          {featuredTeachers.length >= 2 && (
            <div className="relative hidden md:col-span-5 md:block md:h-[420px]">
              <div
                className="absolute right-8 top-0 aspect-[3/4] w-[55%] overflow-hidden rounded-ft-lg shadow-[0_30px_60px_-20px_rgba(0,0,0,0.25)]"
                style={{
                  background: "var(--ft-surface-2)",
                  transform: "rotate(-3deg)",
                }}
              >
                <Image
                  src={featuredTeachers[0].profilePicture}
                  alt={featuredTeachers[0].name}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 25vw, 40vw"
                />
                <div className="absolute bottom-3.5 left-3.5 right-3.5 text-white">
                  <div className="text-[13px] font-semibold leading-tight">
                    {featuredTeachers[0].name}
                  </div>
                  <div className="text-[11px] opacity-85">
                    {featuredTeachers[0].specialty}
                  </div>
                </div>
              </div>
              <div
                className="absolute right-[42%] top-[60px] aspect-[3/4] w-[46%] overflow-hidden rounded-ft-lg shadow-[0_30px_60px_-20px_rgba(0,0,0,0.25)]"
                style={{ transform: "rotate(4deg)" }}
              >
                <Image
                  src={featuredTeachers[1].profilePicture}
                  alt={featuredTeachers[1].name}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 22vw, 36vw"
                />
              </div>
              {/* "En vivo" floating card */}
              <div className="absolute bottom-7 right-[18%] flex items-center gap-3.5 rounded-ft-base bg-[#1A1714] px-5 py-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.4)]">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-ft-accent">
                  <AudioLines width={16} height={16} className="text-[#1a1410]" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ft-accent-soft">
                    {t("liveBadge")}
                  </div>
                  <div className="mt-0.5 text-[13px] font-medium text-ft-paper">
                    {t("liveSample")}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ───────── Categories strip ───────── */}
      <section className="border-y border-ft-line-soft bg-ft-surface-1 px-6 py-10 md:px-9">
        <div className="mx-auto max-w-screen-2xl">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {CATEGORIES.map((c) => (
              <Link
                key={c.id}
                href={`/${locale}/courses`}
                className="rounded-ft-md border border-ft-line-soft bg-ft-paper p-4 transition-colors hover:bg-ft-paper-deep"
              >
                <div
                  className="mb-2.5 grid h-7 w-7 place-items-center rounded-ft-xs text-[13px] font-semibold text-[#1a1410]"
                  style={{ background: c.hue }}
                >
                  {t(`categories.${c.id}`)[0]}
                </div>
                <div className="text-[13px] font-semibold tracking-tight text-ft-ink">
                  {t(`categories.${c.id}`)}
                </div>
                <div className="mt-0.5 text-[11px] text-ft-ink-3">
                  {c.count} {t("coursesText")}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Featured tutors ───────── */}
      {featuredTeachers.length > 0 && (
        <section className="px-6 py-12 md:px-9 md:py-16">
          <div className="mx-auto max-w-screen-2xl">
            <div className="mb-7 flex items-baseline justify-between">
              <h2 className="m-0 text-2xl font-semibold tracking-tight text-ft-ink md:text-3xl">
                {t("featuredTeachersTitle")}
              </h2>
              <Link
                href={`/${locale}/tutors`}
                className="text-[13px] text-ft-ink-3 hover:text-ft-ink"
              >
                {t("findTutors")} →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
              {featuredTeachers.map((tch) => (
                <Link
                  key={tch.id}
                  href={`/${locale}/tutors/${tch.id}`}
                  className="group block"
                >
                  <div className="relative aspect-[4/5] overflow-hidden rounded-ft-lg bg-ft-surface-2">
                    <Image
                      src={tch.profilePicture}
                      alt={tch.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(min-width: 768px) 22vw, 45vw"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 via-black/40 to-transparent" />
                    <div className="absolute inset-x-4 bottom-3.5 text-white">
                      <div className="truncate text-[14px] font-semibold tracking-tight">
                        {tch.name}
                      </div>
                      <div className="truncate text-[11px] opacity-90">
                        {tch.specialty}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px] text-ft-ink-2">
                    <span>{tch.coursesCount} {t("coursesText")}</span>
                    <span className="text-ft-ink-3">{tch.yearsOfExperience}+ años</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────── Popular courses ───────── */}
      {popularCourses.length > 0 && (
        <section className="px-6 pb-16 md:px-9 md:pb-20">
          <div className="mx-auto max-w-screen-2xl">
            <div className="mb-7 flex items-baseline justify-between">
              <h2 className="m-0 text-2xl font-semibold tracking-tight text-ft-ink md:text-3xl">
                {t("popularCoursesTitle")}
              </h2>
              <Link
                href={`/${locale}/courses`}
                className="text-[13px] text-ft-ink-3 hover:text-ft-ink"
              >
                {t("availableCourses")} →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {popularCourses.map((c) => (
                <Link
                  key={c.id}
                  href={`/${locale}/courses/${c.id}`}
                  className="flex gap-3 rounded-ft-lg border border-ft-line-soft bg-ft-paper p-3 transition-colors hover:bg-ft-paper-deep"
                >
                  <div className="aspect-square w-20 flex-shrink-0 overflow-hidden rounded-ft bg-ft-surface-2">
                    {c.coverUrl ? (
                      <Image
                        src={c.coverUrl}
                        alt={c.title}
                        width={80}
                        height={80}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col justify-between py-1">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-accent-deep">
                        {c.level}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-tight tracking-tight text-ft-ink">
                        {c.title}
                      </div>
                    </div>
                    <div className="text-[11px] text-ft-ink-3">{c.teacher}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────── Editorial CTA ───────── */}
      <section className="px-6 pb-16 md:px-9 md:pb-24">
        <div className="mx-auto max-w-screen-2xl rounded-ft-2xl border border-ft-line bg-ft-surface-2 px-7 py-10 md:px-12 md:py-14">
          <div className="grid items-center gap-8 md:grid-cols-12">
            <div className="md:col-span-8">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ft-accent-deep">
                {t("ready")}
              </div>
              <h3 className="mb-3 mt-3 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-ft-ink md:text-[34px]">
                <span className="font-instrument-serif italic">
                  {t("ctaBandTitle")}
                </span>
              </h3>
              <p className="m-0 max-w-xl text-[14px] leading-relaxed text-ft-ink-2">
                {t("ctaBandSubtitle")}
              </p>
            </div>
            <div className="md:col-span-4 md:text-right">
              <Link
                href={`/${locale}/register`}
                className="inline-flex items-center gap-2 rounded-full bg-ft-ink px-6 py-3.5 text-sm font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
              >
                {t("registerNow")}
                <ArrowRight width={14} height={14} />
              </Link>
              <p className="mt-3 text-[11px] text-ft-ink-3">
                {t("ctaFinePrint")}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
