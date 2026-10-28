"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Car,
  ChevronRight,
  Pause,
  Play,
  Search,
  Sparkles,
  Star,
} from "lucide-react";

import { Avatar } from "@/components/ds/Avatar";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { StudentSidebarNav } from "@/components/ds/StudentSidebarNav";
import { useNotificationsContext } from "@/context/NotificationsContext";
import { useTranslations, useLocale } from "@/i18n/translations";
import {
  formatLessonTimestamp,
  lessonTimestampToEpoch,
  useViewerTimeZone,
} from "@/lib/datetime/viewerTime";
import { getCourseCoverPublicUrl, getPublicUrl } from "@/lib/supabase/storage";
import type { StudentProfile } from "@/types/student";
import type { DashboardRecommendedCourse } from "./DashboardDeferredRecommended";
import { handleExternalLinkClick } from "@/lib/openExternal";

interface DashboardUser {
  username: string | null;
  is_tutor: boolean;
  profile_picture?: string | null;
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

interface DashboardClientProps {
  user: DashboardUser;
  stats: DashboardStats;
  upcomingLessons: UpcomingLesson[];
  recommendedCourses: DashboardRecommendedCourse[];
  languageLevel: StudentProfile["language_level"] | null;
}

const CATEGORIES: ReadonlyArray<{
  id: string;
  labelKey:
    | "categoryLanguages"
    | "categoryMusic"
    | "categoryCooking"
    | "categoryTech"
    | "categoryArt"
    | "categoryWellness";
  count: string;
  hue: string;
}> = [
  { id: "idiomas", labelKey: "categoryLanguages", count: "412", hue: "#C9A86A" },
  { id: "musica", labelKey: "categoryMusic", count: "184", hue: "#B89B5E" },
  { id: "cocina", labelKey: "categoryCooking", count: "96", hue: "#D4B57A" },
  { id: "tech", labelKey: "categoryTech", count: "273", hue: "#A8895A" },
  { id: "arte", labelKey: "categoryArt", count: "158", hue: "#C8AB6E" },
  { id: "bienestar", labelKey: "categoryWellness", count: "122", hue: "#D9BD83" },
];

const LANGUAGE_LEVEL_PROGRESS: Record<
  NonNullable<StudentProfile["language_level"]>,
  { label: string; percent: number; next: string }
> = {
  beginner: { label: "A1", percent: 17, next: "A2" },
  elementary: { label: "A2", percent: 33, next: "B1" },
  intermediate: { label: "B1", percent: 50, next: "B2" },
  upper_intermediate: { label: "B2", percent: 67, next: "C1" },
  advanced: { label: "C1", percent: 83, next: "C2" },
  proficient: { label: "C2", percent: 100, next: "—" },
};

function resolveAvatar(pic: string | null | undefined): string | null {
  if (!pic) return null;
  if (pic.startsWith("http")) return pic;
  return getPublicUrl("avatars", pic);
}

// Hour in the viewer's zone (Madrid during server render and hydration, so the
// greeting matches the server markup; see useViewerTimeZone).
function getGreetingKey(timeZone: string): "greetingMorning" | "greetingAfternoon" | "greetingEvening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date())
  );
  if (hour < 12) return "greetingMorning";
  if (hour < 19) return "greetingAfternoon";
  return "greetingEvening";
}

function formatCountdown(scheduledIso: string, locale: string): string {
  const target = lessonTimestampToEpoch(scheduledIso);
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((target - now) / 60000));
  if (diffMin < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diffMin, "minute");
  if (diffMin < 60 * 24) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(diffMin / 60), "hour");
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(diffMin / (60 * 24)), "day");
}

export default function DashboardClient({
  user,
  stats,
  upcomingLessons,
  recommendedCourses,
  languageLevel,
}: DashboardClientProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const timeZone = useViewerTimeZone();
  const { unreadCount } = useNotificationsContext();
  const [audioPlaying, setAudioPlaying] = useState(false);

  const next = upcomingLessons[0] ?? null;

  const greeting = t(getGreetingKey(timeZone));
  const userAvatarUrl = resolveAvatar(user.profile_picture ?? null);
  const nextAvatarUrl = next ? resolveAvatar(next.tutorPicture) : null;

  const progress = languageLevel ? LANGUAGE_LEVEL_PROGRESS[languageLevel] : null;

  const popularCourses = useMemo(
    () =>
      recommendedCourses.slice(0, 3).map((course) => ({
        id: course.id,
        title: course.title,
        teacher: course.tutorName ?? "—",
        level: course.subjectName ?? "",
        coverUrl: getCourseCoverPublicUrl(course.cover_image),
        rating: course.rating,
      })),
    [recommendedCourses]
  );

  const featuredTutors = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{
      id: string;
      name: string;
      avatar: string | null;
      subject: string;
    }> = [];
    for (const lesson of upcomingLessons) {
      const name = lesson.tutorUsername || t("unknownTutor");
      if (seen.has(name)) continue;
      seen.add(name);
      list.push({
        id: lesson.id,
        name,
        avatar: resolveAvatar(lesson.tutorPicture),
        subject: lesson.subjectName ?? t("defaultLessonTitle"),
      });
      if (list.length >= 4) break;
    }
    return list;
  }, [upcomingLessons, t]);

  const formatLessonDate = (iso: string) =>
    formatLessonTimestamp(iso, locale, timeZone, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

  const formatLessonTime = (iso: string) =>
    formatLessonTimestamp(iso, locale, timeZone, {
      hour: "2-digit",
      minute: "2-digit",
    });

  // Weekly heatmap (last 7 days, Mon..Sun) — share buckets visually.
  const weekHeatmap = useMemo(() => {
    const today = new Date();
    const dayKeys = new Set(
      upcomingLessons
        .map((l) => l.scheduled_date_time?.slice(0, 10))
        .filter((d): d is string => Boolean(d))
    );
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      return dayKeys.has(key) ? 1 : 0.18 + (i % 3) * 0.18;
    });
  }, [upcomingLessons]);

  const subtitleHours = stats.totalHours > 0 ? stats.totalHours : 0;

  // ─────────────────────────────────────────────
  // Sub-blocks (used in both mobile and desktop)
  // ─────────────────────────────────────────────

  const heroNextClass = next ? (
    <article className="relative overflow-hidden rounded-ft-2xl bg-gradient-to-br from-[#2A2520] to-[#1A1714] p-5 text-ft-paper md:p-7">
      <div
        aria-hidden
        className="absolute -right-8 -top-8 h-36 w-36 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(201,168,106,0.35), transparent 70%)",
        }}
      />
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ft-accent-soft">
        <Sparkles width={11} height={11} />
        {t("nextClassEyebrow")} · {formatCountdown(next.scheduled_date_time, locale)}
      </div>
      <div className="mt-2.5 text-[20px] font-semibold leading-tight tracking-[-0.02em] md:text-[22px]">
        {next.subjectName ?? t("defaultLessonTitle")}
      </div>
      <div className="mt-1 text-[13px] text-white/60">
        {t("withTutor", { name: next.tutorUsername || t("unknownTutor") })}
      </div>
      <div className="mt-[18px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {nextAvatarUrl ? (
            <Avatar src={nextAvatarUrl} name={next.tutorUsername} size={32} ring />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-ft-paper bg-ft-surface-2 text-[11px] font-semibold text-ft-ink">
              {(next.tutorUsername || "?")[0]?.toUpperCase()}
            </span>
          )}
          <div className="text-[12px] text-white/70">
            {formatLessonDate(next.scheduled_date_time)} · {formatLessonTime(next.scheduled_date_time)}
          </div>
        </div>
        {next.meetLink ? (
          <a
            href={next.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="inline-flex items-center gap-1.5 rounded-full bg-ft-accent px-4 py-2.5 text-[13px] font-semibold text-[#1a1410] transition-colors hover:brightness-95"
          >
            {t("joinClass")}
            <ArrowRight width={13} height={13} />
          </a>
        ) : (
          <button
            type="button"
            onClick={() => router.push(`/${locale}/bookings`)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ft-accent px-4 py-2.5 text-[13px] font-semibold text-[#1a1410] transition-colors hover:brightness-95"
          >
            {t("viewDetails")}
            <ArrowRight width={13} height={13} />
          </button>
        )}
      </div>
    </article>
  ) : (
    <article className="rounded-ft-2xl border border-ft-line bg-ft-paper p-6 text-center md:p-8">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-ft-surface-2">
        <Sparkles width={20} height={20} className="text-ft-accent-deep" />
      </div>
      <p className="text-[15px] font-semibold tracking-tight text-ft-ink">
        {t("noUpcomingClasses")}
      </p>
      <p className="mt-1.5 text-[13px] text-ft-ink-3">
        {t("noUpcomingClassesHint")}
      </p>
      <button
        type="button"
        onClick={() => router.push(`/${locale}/courses`)}
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ft-ink px-5 py-2.5 text-[13px] font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
      >
        {t("exploreCourses")}
        <ArrowRight width={13} height={13} />
      </button>
    </article>
  );

  const handsFreeCard = (
    <div className="flex items-center gap-3.5 rounded-ft-xl border border-ft-line bg-ft-paper p-[18px]">
      <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-ft-md bg-ft-accent">
        <Car width={22} height={22} className="text-[#1a1410]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
          {t("handsFreeEyebrow")}
        </div>
        <div className="mt-0.5 text-[14px] font-medium leading-tight tracking-tight text-ft-ink">
          {t("handsFreeTitle")}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setAudioPlaying((p) => !p)}
        aria-label={audioPlaying ? t("pause") : t("play")}
        className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-ft-ink text-ft-paper transition-colors hover:bg-[#2a241b]"
      >
        {audioPlaying ? (
          <Pause width={16} height={16} />
        ) : (
          <Play width={16} height={16} className="ml-0.5" />
        )}
      </button>
    </div>
  );

  const progressCard = (
    <div className="flex h-full flex-col rounded-ft-lg border border-ft-line-soft bg-ft-paper p-[18px] md:p-6">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ft-accent-deep">
          {progress
            ? t("progressLevelLabel", { level: progress.label })
            : t("progressNoLevelEyebrow")}
        </div>
        <span className="text-[11px] text-ft-ink-3">
          {progress ? t("progressNext", { level: progress.next }) : ""}
        </span>
      </div>
      {progress ? (
        <>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[36px] font-semibold leading-none tracking-[-0.025em] text-ft-ink">
              {progress.percent}
              <span className="text-[18px] text-ft-ink-3">%</span>
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-ft-xs bg-ft-surface-2">
            <div
              className="h-full bg-gradient-to-r from-ft-accent to-ft-accent-deep"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </>
      ) : (
        <p className="mt-2 text-[13px] leading-snug text-ft-ink-3">
          {t("progressNoLevelHint")}
        </p>
      )}

      {/* Weekly heatmap */}
      <div className="mt-auto pt-4">
        <div className="grid grid-cols-7 gap-1">
          {weekHeatmap.map((v, i) => (
            <div
              key={i}
              className="h-7 rounded-ft-xs"
              style={{
                background: `rgba(201, 168, 106, ${Math.max(0.12, v * 0.65)})`,
              }}
            />
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 text-[9px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
          {[t("dayMon"), t("dayTue"), t("dayWed"), t("dayThu"), t("dayFri"), t("daySat"), t("daySun")].map((d, i) => (
            <span key={i} className="text-center">
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  const statCards = [
    {
      label: t("statThisMonth"),
      value: stats.monthlyClasses.toString(),
      hint: t("statThisMonthHint"),
    },
    {
      label: t("statHoursLearned"),
      value: `${stats.totalHours}h`,
      hint: t("statHoursLearnedHint"),
    },
    {
      label: t("statStreak"),
      value: t("statStreakValue", { days: stats.streakDays }),
      hint:
        stats.streakDays > 0 ? t("statStreakHintActive") : t("statStreakHintIdle"),
    },
    {
      label: t("statTutorsLabel"),
      value: stats.totalTutors.toString(),
      hint: t("statTutorsHint"),
    },
  ];

  const upcomingList =
    upcomingLessons.length > 0 ? (
      <div className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-[18px] md:px-5 md:py-[18px]">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="m-0 text-[16px] font-semibold tracking-tight text-ft-ink">
            {t("upcomingClasses")}
          </h3>
          <Link
            href={`/${locale}/bookings`}
            className="text-[12px] text-ft-ink-3 hover:text-ft-ink"
          >
            {t("seeAll")} →
          </Link>
        </div>
        {upcomingLessons.map((lesson, i) => {
          const avatar = resolveAvatar(lesson.tutorPicture);
          const date = formatLessonDate(lesson.scheduled_date_time);
          const time = formatLessonTime(lesson.scheduled_date_time);
          return (
            <div
              key={lesson.id}
              className={`flex items-center gap-3.5 py-3.5 ${
                i > 0 ? "border-t border-ft-line-soft" : ""
              }`}
            >
              <div className="grid h-[54px] w-[54px] flex-shrink-0 place-items-center rounded-ft-md bg-ft-surface-1">
                <div className="text-center">
                  <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-ft-accent-deep">
                    {date.split(" ")[0]}
                  </div>
                  <div className="text-[14px] font-semibold tracking-tight text-ft-ink">
                    {time}
                  </div>
                </div>
              </div>
              {avatar ? (
                <Avatar src={avatar} name={lesson.tutorUsername} size={36} />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-ft-surface-2 text-[12px] font-semibold text-ft-ink-2">
                  {(lesson.tutorUsername || "?")[0]?.toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ft-ink">
                  {lesson.subjectName ?? t("defaultLessonTitle")}
                </div>
                <div className="truncate text-[11px] text-ft-ink-3">
                  {t("withTutor", {
                    name: lesson.tutorUsername || t("unknownTutor"),
                  })}{" "}
                  · {lesson.duration_minutes} min
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/${locale}/bookings`)}
                className="rounded-ft-sm border border-ft-line bg-ft-paper px-3 py-2 text-[12px] font-semibold text-ft-ink hover:bg-ft-surface-1"
              >
                {t("viewDetails")}
              </button>
            </div>
          );
        })}
      </div>
    ) : null;

  // ─────────────────────────────────────────────
  // Discovery sections (visible on every breakpoint)
  // ─────────────────────────────────────────────

  const categoriesSection = (
    <>
      <SectionTitle
        label={t("exploreByInterest")}
        action={t("seeAll")}
        onAction={() => router.push(`/${locale}/courses`)}
        className="px-0"
      />
      <div className="hide-scroll flex gap-2.5 overflow-x-auto pb-[18px] lg:grid lg:grid-cols-6 lg:overflow-visible">
        {CATEGORIES.map((c) => (
          <Link
            key={c.id}
            href={`/${locale}/courses`}
            className="flex-shrink-0 rounded-ft-lg border border-ft-line bg-ft-surface-1 p-4 transition-colors hover:bg-ft-paper-deep lg:flex-shrink"
            style={{ minWidth: 132 }}
          >
            <div
              className="mb-2.5 grid h-8 w-8 place-items-center rounded-ft-sm text-sm font-semibold text-[#1a1410]"
              style={{ background: c.hue }}
            >
              {t(c.labelKey)[0]}
            </div>
            <div className="text-[14px] font-semibold tracking-tight text-ft-ink">
              {t(c.labelKey)}
            </div>
            <div className="mt-0.5 text-[11px] text-ft-ink-3">
              {c.count} {t("coursesLabel")}
            </div>
          </Link>
        ))}
      </div>
    </>
  );

  const featuredTutorsSection =
    featuredTutors.length > 0 ? (
      <>
        <SectionTitle
          label={t("featuredTutors")}
          action={t("seeAll")}
          onAction={() => router.push(`/${locale}/tutors`)}
          className="px-0"
        />
        <div className="hide-scroll flex gap-3.5 overflow-x-auto pb-5 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {featuredTutors.map((tutor) => (
            <button
              key={tutor.id}
              type="button"
              onClick={() => router.push(`/${locale}/tutors`)}
              className="flex-shrink-0 text-left lg:flex-shrink lg:w-auto"
              style={{ width: 200 }}
            >
              <div
                className="relative overflow-hidden rounded-ft-lg bg-ft-surface-2"
                style={{ aspectRatio: "4 / 5" }}
              >
                {tutor.avatar ? (
                  <Image
                    src={tutor.avatar}
                    alt={tutor.name}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 22vw, 200px"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-ft-surface-2 text-3xl font-semibold text-ft-ink-2">
                    {tutor.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                <div className="absolute inset-x-4 bottom-3 text-white">
                  <div className="text-[15px] font-semibold tracking-tight">
                    {tutor.name}
                  </div>
                  <div className="mt-px truncate text-[11px] opacity-85">
                    {tutor.subject}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </>
    ) : null;

  const editorialBanner = (
    <div className="rounded-ft-2xl border border-ft-line bg-ft-surface-2 px-[22px] py-6 md:px-7 md:py-7">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ft-accent-deep">
        {t("editorialEyebrow")}
      </div>
      <h3 className="mt-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.025em] text-ft-ink md:text-[26px]">
        <span className="font-instrument-serif italic">{t("editorialQuote")}</span>
      </h3>
      <div className="mt-3.5 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ft-paper text-[13px] font-semibold text-ft-ink-2">
          M
        </span>
        <div>
          <div className="text-[13px] font-medium text-ft-ink">
            {t("editorialAuthor")}
          </div>
          <div className="text-[11px] text-ft-ink-3">
            {t("editorialAuthorMeta")}
          </div>
        </div>
      </div>
    </div>
  );

  const popularCoursesSection =
    popularCourses.length > 0 ? (
      <>
        <SectionTitle
          label={t("popularCourses")}
          action={t("seeAll")}
          onAction={() => router.push(`/${locale}/courses`)}
          className="px-0"
        />
        <div className="flex flex-col gap-3 pb-6 lg:grid lg:grid-cols-3">
          {popularCourses.map((c) => (
            <Link
              key={c.id}
              href={`/${locale}/courses/${c.id}`}
              className="flex items-stretch gap-3.5 rounded-ft-lg border border-ft-line-soft bg-ft-paper p-2.5 transition-colors hover:bg-ft-paper-deep"
            >
              <div className="aspect-square w-[88px] flex-shrink-0 overflow-hidden rounded-ft bg-ft-surface-2">
                {c.coverUrl ? (
                  <Image
                    src={c.coverUrl}
                    alt={c.title}
                    width={88}
                    height={88}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5 pr-1">
                <div>
                  {c.level && (
                    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-accent-deep">
                      {c.level}
                    </div>
                  )}
                  <div className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight text-ft-ink">
                    {c.title}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-ft-ink-3">
                  {c.rating != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Star
                        width={11}
                        height={11}
                        fill="currentColor"
                        stroke="none"
                        className="text-ft-accent"
                      />
                      {c.rating.toFixed(1)}
                    </span>
                  ) : (
                    <span>{c.teacher}</span>
                  )}
                  <ChevronRight width={13} height={13} className="text-ft-ink-3" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-screen-md px-0 md:max-w-screen-lg lg:max-w-screen-xl lg:px-9 lg:py-8">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <StudentSidebarNav isTutor={user.is_tutor} />

        <div className="min-w-0">
          {/* Header — mobile (compact) */}
          <header className="flex items-center justify-between px-5 pb-1.5 pt-[18px] lg:hidden">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                {greeting}
              </div>
              <h1 className="mt-0.5 text-[22px] font-semibold tracking-[-0.025em] text-ft-ink">
                {t("welcome", { name: user.username ?? "" })}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push(`/${locale}/notifications`)}
                aria-label={t("navNotifications")}
                className="relative grid h-[42px] w-[42px] place-items-center rounded-full border border-ft-line bg-ft-paper transition-colors hover:bg-ft-surface-1"
              >
                <Bell width={18} height={18} className="text-ft-ink" />
                {unreadCount > 0 && (
                  <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full border-2 border-ft-paper bg-ft-accent" />
                )}
              </button>
              {userAvatarUrl ? (
                <Avatar src={userAvatarUrl} name={user.username ?? "U"} size={42} />
              ) : (
                <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-ft-surface-2 text-sm font-semibold text-ft-ink-2">
                  {user.username?.[0]?.toUpperCase() ?? "U"}
                </span>
              )}
            </div>
          </header>

          {/* Header — desktop (greeting + subtitle) */}
          <header className="hidden lg:block">
            <h1 className="m-0 text-[32px] font-semibold tracking-[-0.025em] text-ft-ink">
              {t("welcomeShort", { name: user.username ?? "" })}
            </h1>
            <p className="mt-1 text-[14px] text-ft-ink-3">
              {subtitleHours > 0
                ? t("welcomeSubtitleHours", { hours: subtitleHours })
                : t("welcomeSubtitleEmpty")}
            </p>
          </header>

          {/* Search — mobile */}
          <div className="px-5 pb-3.5 pt-2.5 lg:hidden">
            <button
              type="button"
              onClick={() => router.push(`/${locale}/courses`)}
              className="flex w-full items-center gap-3 rounded-ft-base border border-ft-line bg-ft-surface-1 px-[18px] py-3.5 text-left text-sm text-ft-ink-3 transition-colors hover:bg-ft-surface-2"
            >
              <Search width={18} height={18} />
              <span>{t("searchPlaceholder")}</span>
            </button>
          </div>

          {/* Hero + progress: 2-col on lg */}
          <div className="px-5 pb-3.5 lg:grid lg:grid-cols-[1.1fr_1fr] lg:gap-4 lg:px-0 lg:pb-4 lg:pt-6">
            {heroNextClass}
            <div className="hidden lg:block">{progressCard}</div>
          </div>

          {/* Hands-free — mobile only (desktop sees progress card instead) */}
          <div className="px-5 pb-[18px] lg:hidden">{handsFreeCard}</div>

          {/* Stats row — desktop only */}
          <div className="hidden grid-cols-4 gap-3.5 pb-6 lg:grid">
            {statCards.map((s) => (
              <div
                key={s.label}
                className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-[18px]"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                  {s.label}
                </div>
                <div className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em] text-ft-ink">
                  {s.value}
                </div>
                <div className="mt-1 text-[11px] text-emerald-600">{s.hint}</div>
              </div>
            ))}
          </div>

          {/* Upcoming list — desktop only (mobile shows the hero only) */}
          {upcomingList && (
            <div className="hidden pb-6 lg:block">{upcomingList}</div>
          )}

          {/* Discovery: visible on both, but on lg lives inside the main column */}
          <div className="px-5 lg:px-0">
            {/* Hands-free desktop variant: keep one but compact */}
            <div className="hidden pb-5 lg:block">{handsFreeCard}</div>

            {categoriesSection}
            {featuredTutorsSection}
            <div className="pb-4 pt-2">{editorialBanner}</div>
            {popularCoursesSection}
          </div>
        </div>
      </div>
    </div>
  );
}
