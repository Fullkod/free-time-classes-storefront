"use client";

import RequestCustomClassButton from "@/components/student/RequestCustomClassButton";
import { useTranslations } from "@/i18n/translations";
import { cn, getAvatarColor } from "@/lib/utils";
import { STUDENT_CANCEL_HOURS } from "@/lib/bookings/cancellationPolicy";
import {
  ArrowLeft,
  Award,
  BookOpen,
  Briefcase,
  Clock,
  GraduationCap,
  MapPin,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import FavoriteTutorButton from "@/components/student/FavoriteTutorButton";
import { useState } from "react";

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

export interface TutorProfileClientProps {
  locale: string;
  tutorId: string;
  displayName: string;
  bio: string | null;
  country: string | null;
  avatarUrl: string | null;
  rating: number;
  totalReviews: number;
  yearsOfExperience: number | null;
  hourlyRate: number | null;
  subjects: ReadonlyArray<{ id: number; name: string }>;
  courses: ReadonlyArray<{
    id: string;
    title: string;
    price_per_session: number;
    coverUrl: string | null;
    subjectName: string | null;
  }>;
  cv: {
    education: ReadonlyArray<CVEducation>;
    certifications: ReadonlyArray<CVCertification>;
    experience: ReadonlyArray<CVExperience>;
  };
}

type Tab = "about" | "classes" | "reviews";

export default function TutorProfileClient({
  locale,
  tutorId,
  displayName,
  bio,
  country,
  avatarUrl,
  rating,
  totalReviews,
  yearsOfExperience,
  hourlyRate,
  subjects,
  courses,
  cv,
}: TutorProfileClientProps) {
  const t = useTranslations("tutorPublicProfile");
  const tCat = useTranslations("tutorsPage");
  const [tab, setTab] = useState<Tab>("about");

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const hasCV =
    cv.education.length > 0 ||
    cv.certifications.length > 0 ||
    cv.experience.length > 0;

  return (
    <div className="pb-32 md:pb-12">
      {/* ── Hero ── */}
      <div className="relative aspect-square w-full overflow-hidden bg-ft-surface-2 md:aspect-[16/9]">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            fill
            sizes="(min-width: 768px) 100vw, 100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center text-7xl font-semibold text-white"
            style={{ backgroundColor: getAvatarColor(displayName) }}
          >
            {initials}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent via-30% to-black/65" />

        {/* Top buttons */}
        <div className="absolute inset-x-4 top-4 flex items-center justify-between md:inset-x-9 md:top-6">
          <Link
            href={`/${locale}/tutors`}
            aria-label={t("backToTutors")}
            className="grid h-10 w-10 place-items-center rounded-full bg-[rgba(252,250,246,0.92)] text-ft-ink transition-colors hover:bg-ft-paper"
          >
            <ArrowLeft width={16} height={16} />
          </Link>
          <FavoriteTutorButton tutorId={tutorId} />
        </div>

        {/* Bottom info overlay */}
        <div className="absolute inset-x-5 bottom-5 text-white md:inset-x-9 md:bottom-9">
          <div className="text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] md:text-[36px]">
            {displayName}
          </div>
          {subjects[0]?.name && (
            <div className="mt-1 text-[14px] opacity-90">
              {subjects[0].name}
              {subjects.length > 1 && (
                <span className="opacity-75">
                  {" "}
                  · +{subjects.length - 1}
                </span>
              )}
            </div>
          )}
          {country && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] opacity-90">
              <MapPin width={12} height={12} />
              {country}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-screen-2xl lg:px-9">
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:pt-6">
        <div className="min-w-0">
      {/* ── Stats row ── */}
      <div className="border-b border-ft-line-soft px-5 py-5 md:px-9 lg:rounded-ft-lg lg:border lg:border-ft-line-soft lg:bg-ft-paper lg:px-5 lg:py-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat
            value={
              <span className="inline-flex items-center gap-1">
                <Star
                  width={14}
                  height={14}
                  className="text-ft-accent"
                  fill="currentColor"
                  stroke="none"
                />
                {rating > 0 ? rating.toFixed(1) : "—"}
              </span>
            }
            label={
              totalReviews > 0
                ? `${totalReviews} ${t("reviews")}`
                : t("reviews")
            }
          />
          <Stat
            value={
              yearsOfExperience != null && yearsOfExperience > 0
                ? `${yearsOfExperience}+`
                : "—"
            }
            label={t("yearsExperience")}
            withDivider
          />
          <Stat
            value={subjects.length || "—"}
            label={t("teaches")}
            withDivider
          />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="sticky top-0 z-10 flex border-b border-ft-line-soft bg-ft-paper/90 backdrop-blur-sm lg:mt-6 lg:rounded-ft-md lg:border lg:border-ft-line-soft lg:bg-ft-paper">
        <div className="flex w-full px-5 md:px-9 lg:px-2">
          {(
            [
              ["about", t("about")],
              ["classes", t("coursesHeading")],
              ["reviews", t("tabReviews")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "relative flex-1 border-none bg-transparent py-3.5 text-[13px] transition-colors",
                tab === id
                  ? "font-semibold text-ft-ink"
                  : "font-medium text-ft-ink-3 hover:text-ft-ink-2"
              )}
            >
              {label}
              {tab === id && (
                <span className="absolute -bottom-px left-1/4 right-1/4 h-0.5 bg-ft-ink" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="px-5 py-6 md:px-9 md:py-9 lg:px-0 lg:py-6">
        {tab === "about" && (
          <div className="space-y-7">
            {bio && (
              <p className="m-0 whitespace-pre-wrap text-[14px] leading-relaxed text-ft-ink-2 md:text-[15px]">
                {bio}
              </p>
            )}

            {subjects.length > 0 && (
              <div>
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                  {t("teaches")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((s) => (
                    <span
                      key={s.id}
                      className="rounded-full border border-ft-line bg-ft-surface-1 px-3 py-1.5 text-[12px] text-ft-ink-2"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {hasCV && (
              <div className="space-y-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                  {t("professionalBackground")}
                </div>

                {cv.education.length > 0 && (
                  <CVSection
                    icon={<GraduationCap width={14} height={14} />}
                    title={t("education")}
                    iconBg="bg-ft-surface-2 text-ft-accent-deep"
                  >
                    {cv.education.map((item) => (
                      <CVRow
                        key={item.id}
                        primary={item.degree}
                        secondary={[item.institution, item.year]}
                      />
                    ))}
                  </CVSection>
                )}

                {cv.certifications.length > 0 && (
                  <CVSection
                    icon={<Award width={14} height={14} />}
                    title={t("certifications")}
                    iconBg="bg-ft-accent-soft text-ft-accent-deep"
                  >
                    {cv.certifications.map((item) => (
                      <CVRow
                        key={item.id}
                        primary={item.name}
                        secondary={[item.issuer, item.year]}
                      />
                    ))}
                  </CVSection>
                )}

                {cv.experience.length > 0 && (
                  <CVSection
                    icon={<Briefcase width={14} height={14} />}
                    title={t("teachingExperience")}
                    iconBg="bg-emerald-100 text-emerald-700"
                  >
                    {cv.experience.map((item) => (
                      <div key={item.id}>
                        <CVRow
                          primary={item.role}
                          secondary={[item.institution, item.period]}
                        />
                        {item.description && (
                          <p className="mt-1 pl-9 text-[12px] leading-relaxed text-ft-ink-3">
                            {item.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </CVSection>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "classes" && (
          <div className="flex flex-col gap-3">
            {courses.length === 0 ? (
              <p className="text-sm text-ft-ink-3">{t("noCourses")}</p>
            ) : (
              courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/${locale}/courses/${course.id}`}
                  className="flex items-stretch gap-3 rounded-ft-lg border border-ft-line-soft bg-ft-paper p-3 transition-colors hover:bg-ft-paper-deep"
                >
                  <div className="aspect-square w-20 flex-shrink-0 overflow-hidden rounded-ft bg-ft-surface-2">
                    {course.coverUrl ? (
                      <Image
                        src={course.coverUrl}
                        alt={course.title}
                        width={80}
                        height={80}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center">
                        <BookOpen
                          width={22}
                          height={22}
                          className="text-ft-ink-3"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-between py-1">
                    <div>
                      {course.subjectName && (
                        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-accent-deep">
                          {course.subjectName}
                        </div>
                      )}
                      <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-tight tracking-tight text-ft-ink">
                        {course.title}
                      </div>
                    </div>
                    <div className="text-[13px] font-semibold text-ft-ink">
                      {Number(course.price_per_session).toFixed(0)}€
                      <span className="ml-1 text-[11px] font-normal text-ft-ink-3">
                        {t("perSession")}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {tab === "reviews" && (
          <div className="rounded-ft-lg border border-ft-line-soft bg-ft-paper-deep p-6 text-center text-sm text-ft-ink-3">
            {totalReviews > 0
              ? `${rating.toFixed(1)} · ${totalReviews} ${t("reviews")}`
              : t("noCourses")}
          </div>
        )}
      </div>

      {/* ── Sticky CTA bar (mobile + tablet, until lg) ── */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ft-line-soft bg-[rgba(252,250,246,0.96)] backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-3 px-5 py-3.5">
          {hourlyRate != null && (
            <div className="flex-shrink-0">
              <div className="text-[11px] text-ft-ink-3">
                {tCat("priceFrom")}
              </div>
              <div className="text-[18px] font-semibold tracking-tight text-ft-ink">
                {hourlyRate}€
                <span className="text-[12px] font-medium text-ft-ink-3">
                  {tCat("perHour")}
                </span>
              </div>
            </div>
          )}
          <div className="flex-1">
            <RequestCustomClassButton
              tutorId={tutorId}
              tutorName={displayName}
              courses={courses}
              triggerClassName="h-12 w-full gap-2 rounded-ft-md bg-ft-ink px-4 text-sm font-semibold text-ft-paper hover:bg-[#2a241b]"
              hideTriggerIcon
            />
          </div>
        </div>
      </div>

        </div>{/* /lg left col */}

        {/* ── Booking sidebar (desktop only) ── */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-ft-xl border border-ft-line bg-ft-paper p-6 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)]">
            {hourlyRate != null && (
              <>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ft-ink-3">
                  {tCat("priceFrom")}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[30px] font-semibold tracking-[-0.025em] text-ft-ink">
                    {hourlyRate}€
                  </span>
                  <span className="text-[13px] font-medium text-ft-ink-3">
                    {tCat("perHour")}
                  </span>
                </div>
                <div className="mt-1.5 text-[12px] text-ft-ink-3">
                  {t("priceFromHourHint", { hours: STUDENT_CANCEL_HOURS })}
                </div>
              </>
            )}

            <div className="mt-5">
              <RequestCustomClassButton
                tutorId={tutorId}
                tutorName={displayName}
                courses={courses}
                triggerClassName="h-12 w-full gap-2 rounded-ft-md bg-ft-ink px-4 text-[14px] font-semibold text-ft-paper hover:bg-[#2a241b]"
                hideTriggerIcon
              />
            </div>

            {yearsOfExperience != null && yearsOfExperience > 0 && (
              <div className="mt-5 border-t border-ft-line-soft pt-4">
                <div className="flex items-center gap-2 text-[12px] text-ft-ink-2">
                  <Clock width={13} height={13} className="text-ft-accent-deep" />
                  <span>
                    <strong className="font-semibold text-ft-ink">
                      {yearsOfExperience}+
                    </strong>{" "}
                    {t("yearsExperience")}
                  </span>
                </div>
                {totalReviews > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-[12px] text-ft-ink-2">
                    <Star
                      width={13}
                      height={13}
                      className="text-ft-accent"
                      fill="currentColor"
                      stroke="none"
                    />
                    <span>
                      <strong className="font-semibold text-ft-ink">
                        {rating.toFixed(1)}
                      </strong>
                      <span className="text-ft-ink-3">
                        {" "}
                        · {totalReviews} {t("reviews")}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>{/* /lg grid */}
      </div>{/* /lg max-w-screen-2xl */}
    </div>
  );
}

function Stat({
  value,
  label,
  withDivider,
}: {
  value: React.ReactNode;
  label: string;
  withDivider?: boolean;
}) {
  return (
    <div
      className={cn(
        withDivider && "border-l border-ft-line-soft pl-3.5"
      )}
    >
      <div className="text-[18px] font-semibold tracking-[-0.02em] text-ft-ink">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-ft-ink-3">{label}</div>
    </div>
  );
}

function CVSection({
  icon,
  title,
  iconBg,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  iconBg: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn(
            "grid h-7 w-7 place-items-center rounded-ft-xs",
            iconBg
          )}
        >
          {icon}
        </div>
        <h3 className="text-[13px] font-semibold text-ft-ink">{title}</h3>
      </div>
      <div className="space-y-1.5 pl-9">{children}</div>
    </div>
  );
}

function CVRow({
  primary,
  secondary,
}: {
  primary?: string | number;
  secondary: ReadonlyArray<string | number | null | undefined>;
}) {
  const meta = secondary.filter(Boolean) as Array<string | number>;
  return (
    <p className="m-0 text-[13px] text-ft-ink-2">
      <span className="font-medium text-ft-ink">{primary}</span>
      {meta.length > 0 && (
        <span className="text-ft-ink-3"> · {meta.join(" · ")}</span>
      )}
    </p>
  );
}
