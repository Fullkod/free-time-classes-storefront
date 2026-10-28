"use client";

import { BookingPicker } from "@/components/ds/BookingPicker";
import CourseBookingFocus from "@/components/courses/CourseBookingFocus";
import { useTranslations } from "@/i18n/translations";
import { cn, getAvatarColor } from "@/lib/utils";
import { STUDENT_CANCEL_HOURS } from "@/lib/bookings/cancellationPolicy";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  Clock,
  GraduationCap,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import FavoriteTutorButton from "@/components/student/FavoriteTutorButton";
import { Suspense, useState } from "react";

interface CVEducation {
  id: string;
  degree?: string;
  institution?: string;
  year?: string | number;
}
interface CVCertification {
  id: string;
  name?: string;
  issuer?: string;
  year?: string | number;
}
interface CVExperience {
  id: string;
  role?: string;
  institution?: string;
  period?: string;
  description?: string;
}

interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  tutor_response: string | null;
  created_at: string;
  studentName: string | null;
}

export interface CourseDetailClientProps {
  locale: string;
  courseId: string;
  title: string;
  description: string;
  level: "beginner" | "intermediate" | "advanced" | null;
  duration_minutes: number;
  max_students: number;
  is_active: boolean;
  rating: number;
  total_reviews: number;
  price_per_session: number;
  coverUrl: string | null;
  createdAtLabel: string;
  subjectName: string | null;
  subjectId: number | null;
  tutorId: string;
  tutor: {
    id: string;
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    years_of_experience: number | null;
    hourly_rate: number | null;
    rating: number;
    total_reviews: number;
    cv: {
      education: ReadonlyArray<CVEducation>;
      certifications: ReadonlyArray<CVCertification>;
      experience: ReadonlyArray<CVExperience>;
    };
  } | null;
  reviews: ReadonlyArray<ReviewItem>;
}

export default function CourseDetailClient({
  locale,
  courseId,
  title,
  description,
  level,
  duration_minutes,
  is_active,
  rating,
  total_reviews,
  price_per_session,
  coverUrl,
  createdAtLabel,
  subjectName,
  tutorId,
  tutor,
  reviews,
}: CourseDetailClientProps) {
  const t = useTranslations("courseDetail");
  const tProfile = useTranslations("tutorPublicProfile");
  const [hasBookingSelection, setHasBookingSelection] = useState(false);

  const priceLabel = Number(price_per_session).toFixed(0);
  const hasReviews = reviews.length > 0;
  const hasCV =
    !!tutor &&
    (tutor.cv.education.length > 0 ||
      tutor.cv.certifications.length > 0 ||
      tutor.cv.experience.length > 0);

  return (
    <div className="pb-32 md:pb-12">
      <Suspense fallback={null}>
        <CourseBookingFocus />
      </Suspense>

      {/* ── Hero ── */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-ft-surface-2 md:aspect-[16/9] lg:aspect-auto lg:h-[380px]">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            sizes="(min-width: 768px) 100vw, 100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center text-white"
            style={{ backgroundColor: getAvatarColor(courseId) }}
          >
            <BookOpen width={48} height={48} className="opacity-80" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        <Link
          href={`/${locale}/courses`}
          aria-label={t("backToCourses")}
          className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-[rgba(252,250,246,0.92)] text-ft-ink transition-colors hover:bg-ft-paper md:left-9 md:top-6"
        >
          <ArrowLeft width={16} height={16} />
        </Link>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto grid max-w-screen-2xl gap-8 px-5 pt-6 md:grid-cols-[2fr_1fr] md:gap-10 md:px-9 md:pt-9 lg:grid-cols-[1fr_380px] lg:pt-10">
        {/* Main column */}
        <div className="min-w-0 space-y-7">
          {/* Title block */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {level && (
                <span className="rounded-full bg-ft-surface-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-accent-deep">
                  {t(`level.${level}`)}
                </span>
              )}
              {subjectName && (
                <span className="rounded-full border border-ft-line bg-ft-paper px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-ink-2">
                  {subjectName}
                </span>
              )}
              {!is_active && (
                <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-red-700">
                  {t("inactive")}
                </span>
              )}
            </div>
            <h1 className="m-0 mt-3 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-ft-ink md:text-[36px]">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ft-ink-3">
              {rating > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star
                    width={12}
                    height={12}
                    className="text-ft-accent"
                    fill="currentColor"
                    stroke="none"
                  />
                  <span className="font-semibold text-ft-ink">
                    {rating.toFixed(1)}
                  </span>
                  {total_reviews > 0 && <span>· {total_reviews} {t("reviews")}</span>}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock width={12} height={12} />
                {duration_minutes} {t("minutes")}
              </span>
            </div>
          </div>

          {/* Tutor row */}
          {tutor && (
            <div className="flex items-center gap-2 border-y border-ft-line-soft">
              <Link
                href={`/${locale}/tutors/${tutor.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 py-4 transition-colors hover:bg-ft-paper-deep/40"
              >
                {tutor.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tutor.avatarUrl}
                    alt={tutor.username}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: getAvatarColor(tutor.username) }}
                  >
                    {tutor.username[0]?.toUpperCase() ?? "T"}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold tracking-tight text-ft-ink">
                    {tutor.username}
                  </div>
                  <div className="text-[11px] text-ft-ink-3">
                    {tutor.years_of_experience != null && tutor.years_of_experience > 0
                      ? `${tutor.years_of_experience}+ ${tProfile("yearsExperience")} · `
                      : ""}
                    {tutor.total_reviews > 0
                      ? `${tutor.total_reviews} ${tProfile("reviews")}`
                      : ""}
                  </div>
                </div>
                <span className="rounded-full border border-ft-line bg-ft-paper px-3 py-1.5 text-[12px] font-semibold text-ft-ink">
                  {t("viewTutorProfile")}
                </span>
              </Link>
              <FavoriteTutorButton tutorId={tutor.id} className="border border-ft-line" />
            </div>
          )}

          {/* Stats grid */}
          {/* Group classes do not exist yet: max students stays hidden. */}
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              icon={<Clock width={16} height={16} />}
              value={String(duration_minutes)}
              label={t("minutes")}
            />
            <StatCard
              icon={<Calendar width={16} height={16} />}
              value={createdAtLabel}
              label={t("createdAt")}
            />
          </div>

          {/* Description */}
          {description && (
            <section>
              <h2 className="m-0 mb-3 text-[15px] font-semibold tracking-tight text-ft-ink">
                {t("aboutCourse")}
              </h2>
              <p className="m-0 whitespace-pre-line text-[14px] leading-relaxed text-ft-ink-2">
                {description}
              </p>
            </section>
          )}

          {/* Booking */}
          <BookingPicker
            locale={locale}
            courseId={Number(courseId)}
            tutorId={tutorId}
            tutorName={tutor?.username ?? null}
            coursePath={`/${locale}/courses/${courseId}`}
            onSelectionChange={setHasBookingSelection}
          />

          {/* Reviews */}
          <section>
            <h2 className="m-0 mb-3 inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ft-ink">
              <Star
                width={14}
                height={14}
                className="text-ft-accent"
                fill="currentColor"
                stroke="none"
              />
              {t("reviewsTitle")}
              {hasReviews && (
                <span className="text-xs font-normal text-ft-ink-3">
                  ({reviews.length})
                </span>
              )}
            </h2>
            {!hasReviews ? (
              <p className="text-sm text-ft-ink-3">{t("noReviews")}</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => {
                  const studentName = review.studentName ?? t("anonymousStudent");
                  return (
                    <div
                      key={review.id}
                      className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
                            style={{
                              backgroundColor: getAvatarColor(studentName),
                            }}
                          >
                            {studentName[0]?.toUpperCase()}
                          </span>
                          <div>
                            <div className="text-[13px] font-semibold text-ft-ink">
                              {studentName}
                            </div>
                            <div className="text-[11px] text-ft-ink-3">
                              {new Date(review.created_at).toLocaleDateString(
                                locale,
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="inline-flex items-center gap-0.5">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <Star
                              key={i}
                              width={12}
                              height={12}
                              className={
                                i < review.rating
                                  ? "text-ft-accent"
                                  : "text-ft-ink-3"
                              }
                              fill={i < review.rating ? "currentColor" : "none"}
                              stroke={i < review.rating ? "none" : "currentColor"}
                            />
                          ))}
                        </div>
                      </div>
                      {review.comment && (
                        <p className="m-0 mt-2.5 text-[13px] leading-relaxed text-ft-ink-2">
                          {review.comment}
                        </p>
                      )}
                      {review.tutor_response && (
                        <div className="mt-3 rounded-ft border-l-2 border-ft-accent bg-ft-surface-1 p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-accent-deep">
                            {t("tutorResponse")}
                          </div>
                          <p className="m-0 mt-1 text-[13px] leading-relaxed text-ft-ink-2">
                            {review.tutor_response}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Tutor card (full bio + CV) — only on mobile, desktop has sidebar */}
          {tutor && (
            <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5 md:hidden">
              <h2 className="m-0 mb-3 text-[15px] font-semibold tracking-tight text-ft-ink">
                {t("aboutTutor")}
              </h2>
              <TutorBlock tutor={tutor} hasCV={hasCV} locale={locale} />
            </section>
          )}
        </div>

        {/* Sidebar (desktop only) */}
        <aside className="hidden md:block">
          <div className="sticky top-24 space-y-5">
            <div className="overflow-hidden rounded-ft-2xl border border-ft-line bg-ft-paper shadow-[0_30px_60px_-30px_rgba(0,0,0,0.18)]">
              <div className="bg-ft-ink p-6 text-ft-paper">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ft-accent-soft">
                  {t("pricePerSession")}
                </div>
                <div className="mt-2 text-[36px] font-semibold leading-none tracking-tight">
                  {priceLabel}€
                </div>
                <div className="mt-1 text-[12px] text-ft-paper/70">
                  {t("perSession")}
                </div>
              </div>
              <div className="space-y-2.5 p-5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-ft-ink-3">{t("duration")}</span>
                  <span className="font-semibold text-ft-ink">
                    {duration_minutes} {t("minutes")}
                  </span>
                </div>
                {level && (
                  <div className="flex items-center justify-between">
                    <span className="text-ft-ink-3">{t("levelLabel")}</span>
                    <span className="font-semibold text-ft-ink">
                      {t(`level.${level}`)}
                    </span>
                  </div>
                )}
                <a
                  href="#course-booking"
                  className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-ft-md bg-ft-ink text-[13px] font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
                >
                  {t("bookClass")}
                  <ArrowRight width={13} height={13} />
                </a>
                <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-ft-line-soft pt-3 text-[12px] text-ft-ink-2">
                  {[
                    t("perkCancelFlexible", { hours: STUDENT_CANCEL_HOURS }),
                    t("perkLifetimeAccess"),
                  ].map((perk) => (
                    <div key={perk} className="flex items-center gap-2">
                      <span className="grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-ft-accent">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#1a1410"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <span>{perk}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {tutor && (
              <div className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
                <h2 className="m-0 mb-3 text-[15px] font-semibold tracking-tight text-ft-ink">
                  {t("aboutTutor")}
                </h2>
                <TutorBlock tutor={tutor} hasCV={hasCV} locale={locale} />
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Sticky CTA mobile (hidden while BookingPicker shows its own) ── */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-ft-line-soft bg-[rgba(252,250,246,0.96)] backdrop-blur-xl md:hidden",
          hasBookingSelection && "hidden"
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-3 px-5 py-3.5">
          <div className="flex-shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
              {t("pricePerSession")}
            </div>
            <div className="text-[20px] font-semibold tracking-tight text-ft-ink">
              {priceLabel}€
            </div>
          </div>
          <a
            href="#course-booking"
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-ft-md bg-ft-ink text-sm font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
          >
            {t("bookClass")}
            <ArrowRight width={14} height={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-ft-md border border-ft-line-soft bg-ft-surface-1 p-3.5">
      <div className="text-ft-accent-deep">{icon}</div>
      <div className="mt-2 text-[14px] font-semibold tracking-tight text-ft-ink">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
        {label}
      </div>
    </div>
  );
}

function TutorBlock({
  tutor,
  hasCV,
  locale,
}: {
  tutor: NonNullable<CourseDetailClientProps["tutor"]>;
  hasCV: boolean;
  locale: string;
}) {
  const tProfile = useTranslations("tutorPublicProfile");
  const tCourse = useTranslations("courseDetail");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {tutor.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tutor.avatarUrl}
            alt={tutor.username}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <span
            className="grid h-12 w-12 place-items-center rounded-full text-base font-semibold text-white"
            style={{ backgroundColor: getAvatarColor(tutor.username) }}
          >
            {tutor.username[0]?.toUpperCase() ?? "T"}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold tracking-tight text-ft-ink">
            {tutor.username}
          </div>
          {tutor.rating > 0 && (
            <div className="inline-flex items-center gap-1 text-[11px] text-ft-ink-3">
              <Star
                width={10}
                height={10}
                className="text-ft-accent"
                fill="currentColor"
                stroke="none"
              />
              {tutor.rating.toFixed(1)} · {tutor.total_reviews}{" "}
              {tProfile("reviews")}
            </div>
          )}
        </div>
      </div>

      {tutor.bio && (
        <p className="m-0 line-clamp-4 text-[13px] leading-relaxed text-ft-ink-2">
          {tutor.bio}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {tutor.years_of_experience != null && (
          <div className="rounded-ft border border-ft-line-soft bg-ft-surface-1 p-2.5">
            <div className="text-[15px] font-semibold tracking-tight text-ft-ink">
              {tutor.years_of_experience}+
            </div>
            <div className="text-[10px] text-ft-ink-3">
              {tProfile("yearsExperience")}
            </div>
          </div>
        )}
        {tutor.hourly_rate != null && (
          <div className="rounded-ft border border-ft-line-soft bg-ft-surface-1 p-2.5">
            <div className="text-[15px] font-semibold tracking-tight text-ft-ink">
              {tutor.hourly_rate}€
            </div>
            <div className="text-[10px] text-ft-ink-3">
              {tProfile("hourlyRate")}
            </div>
          </div>
        )}
      </div>

      {hasCV && (
        <div className="space-y-3 border-t border-ft-line-soft pt-3">
          {tutor.cv.education.length > 0 && (
            <CVMiniSection
              icon={<GraduationCap width={12} height={12} />}
              title={tProfile("education")}
            >
              {tutor.cv.education.map((item) => (
                <CVMiniRow
                  key={item.id}
                  primary={item.degree}
                  secondary={[item.institution, item.year]}
                />
              ))}
            </CVMiniSection>
          )}
          {tutor.cv.certifications.length > 0 && (
            <CVMiniSection
              icon={<Award width={12} height={12} />}
              title={tProfile("certifications")}
            >
              {tutor.cv.certifications.map((item) => (
                <CVMiniRow
                  key={item.id}
                  primary={item.name}
                  secondary={[item.issuer, item.year]}
                />
              ))}
            </CVMiniSection>
          )}
          {tutor.cv.experience.length > 0 && (
            <CVMiniSection
              icon={<Briefcase width={12} height={12} />}
              title={tProfile("teachingExperience")}
            >
              {tutor.cv.experience.map((item) => (
                <CVMiniRow
                  key={item.id}
                  primary={item.role}
                  secondary={[item.institution, item.period]}
                />
              ))}
            </CVMiniSection>
          )}
        </div>
      )}

      <Link
        href={`/${locale}/tutors/${tutor.id}`}
        className="inline-flex w-full items-center justify-center gap-2 rounded-ft-md border border-ft-line bg-ft-paper px-4 py-2.5 text-[13px] font-semibold text-ft-ink transition-colors hover:bg-ft-surface-1"
      >
        {tCourse("viewTutorProfile")}
        <ArrowRight width={13} height={13} />
      </Link>
    </div>
  );
}

function CVMiniSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="grid h-5 w-5 place-items-center rounded-ft-xs bg-ft-surface-2 text-ft-accent-deep">
          {icon}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
          {title}
        </span>
      </div>
      <div className="space-y-1 pl-7">{children}</div>
    </div>
  );
}

function CVMiniRow({
  primary,
  secondary,
}: {
  primary?: string | number;
  secondary: ReadonlyArray<string | number | null | undefined>;
}) {
  const meta = secondary.filter(Boolean) as Array<string | number>;
  return (
    <p className={cn("m-0 text-[12px] text-ft-ink-2")}>
      <span className="font-medium text-ft-ink">{primary}</span>
      {meta.length > 0 && (
        <span className="text-ft-ink-3"> · {meta.join(" · ")}</span>
      )}
    </p>
  );
}
