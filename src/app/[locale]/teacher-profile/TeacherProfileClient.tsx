"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Inbox,
  Loader2,
  LogOut,
  MessageSquare,
  Sparkles,
  Star,
  User,
} from "lucide-react";

import RecurringAvailabilityManager from "@/components/teacher/RecurringAvailabilityManager";
import EditProfileModal from "@/components/teacher/EditProfileModal";
import TutorBookingRequests from "@/components/teacher/TutorBookingRequests";
import TutorCoursesManager from "@/components/teacher/TutorCoursesManager";
import TutorSubjectsManager from "@/components/teacher/TutorSubjectsManager";
import TutorReviewsSection from "@/components/teacher/TutorReviewsSection";
import TutorCVSection from "@/components/teacher/TutorCVSection";
import TutorOnboardingCard from "@/components/teacher/TutorOnboardingCard";
import InternalMessagingPanel from "@/components/messages/InternalMessagingPanel";
import { StudentSidebarNav } from "@/components/ds/StudentSidebarNav";
import { useAuth } from "@/context/UserContext";
import { useTranslations } from "@/i18n/translations";
import { createClient } from "@/lib/supabase/client";
import { getPublicUrl } from "@/lib/supabase/storage";
import { resolveTimeZone } from "@/lib/datetime/zonedTime";
import { cn, getAvatarColor } from "@/lib/utils";
import type { CourseWithRelations } from "@/types/course";
import type { Subject } from "@/types/subject";
import type { TutorProfile } from "@/types/tutor";

// FullCalendar is heavy: load it only when the availability tab opens (F100).
const AvailabilityCalendar = dynamic(() => import("@/components/teacher/AvailabilityCalendar"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[420px] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-ft-ink-3" />
    </div>
  ),
});

export type TeacherProfilePageUser = {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  country: string | null;
  profile_picture: string | null;
};

type Tab = "profile" | "availability" | "requests" | "messages";

export default function TeacherProfileClient({
  teacherUser,
  initialTutorProfile,
  initialSubjects,
  initialCourses,
}: {
  teacherUser: TeacherProfilePageUser;
  initialTutorProfile: TutorProfile | null;
  initialSubjects: Subject[];
  initialCourses: CourseWithRelations[];
}) {
  const router = useRouter();
  const t = useTranslations("teacherProfile");
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tutorProfile, setTutorProfile] = useState<TutorProfile | null>(
    initialTutorProfile
  );
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [courses, setCourses] = useState<CourseWithRelations[]>(initialCourses);
  const [calendarRefresh, setCalendarRefresh] = useState(0);
  const [hasAvailability, setHasAvailability] = useState<boolean | null>(null);

  useEffect(() => {
    setTutorProfile(initialTutorProfile);
    setSubjects(initialSubjects);
    setCourses(initialCourses);
  }, [initialTutorProfile, initialSubjects, initialCourses]);

  // Onboarding step 2: an active weekly rule. Rechecked when the agenda changes.
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("tutor_availability")
      .select("id", { count: "exact", head: true })
      .eq("tutor_id", teacherUser.id)
      .eq("is_active", true)
      .then(({ count }) => {
        if (!cancelled) setHasAvailability((count ?? 0) > 0);
      });
    return () => {
      cancelled = true;
    };
  }, [teacherUser.id, calendarRefresh]);

  const scrollToSection = (id: string) => {
    setActiveTab("profile");
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const hasBio = Boolean(tutorProfile?.bio?.trim());

  const profilePictureUrl =
    teacherUser.profile_picture && typeof teacherUser.profile_picture === "string"
      ? teacherUser.profile_picture.startsWith("http")
        ? teacherUser.profile_picture
        : getPublicUrl("avatars", teacherUser.profile_picture)
      : null;

  const displayName = teacherUser.username || t("teacher");
  const bioText = tutorProfile?.bio?.trim() || t("notProvided");
  const expertiseBadges =
    subjects.length > 0
      ? subjects.slice(0, 6).map((subject) => subject.name)
      : [t("specialties"), t("teachingExperience")];

  const tabs: ReadonlyArray<{ id: Tab; label: string; icon: typeof User }> = [
    { id: "profile", label: t("profile"), icon: User },
    { id: "availability", label: t("availability"), icon: BookOpen },
    { id: "requests", label: t("requests.tab"), icon: Inbox },
    { id: "messages", label: t("messaging.tab"), icon: MessageSquare },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-md md:max-w-screen-lg lg:max-w-screen-xl lg:px-9 lg:py-8">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <StudentSidebarNav isTutor />

        <div className="min-w-0">
          {/* Hero card */}
          <div className="px-5 pt-[18px] md:px-9 md:pt-8 lg:px-0 lg:pt-0">
            <div className="rounded-ft-2xl border border-ft-line bg-gradient-to-br from-ft-surface-2 to-ft-surface-1 p-5 md:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="grid h-24 w-24 flex-shrink-0 place-items-center overflow-hidden rounded-ft-xl bg-ft-surface-2">
                  {profilePictureUrl ? (
                    <Image
                      src={profilePictureUrl}
                      alt={displayName}
                      width={96}
                      height={96}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="grid h-full w-full place-items-center text-2xl font-semibold text-white"
                      style={{ backgroundColor: getAvatarColor(displayName) }}
                    >
                      {displayName?.[0]?.toUpperCase() || "U"}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ft-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ft-accent-deep">
                      <Sparkles className="h-3 w-3" />
                      {t("proMentorBadge")}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-ft-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ft-ink">
                      <Star
                        className="h-3 w-3 text-ft-accent"
                        fill="currentColor"
                        stroke="none"
                      />
                      {(tutorProfile?.rating ?? 0).toFixed(1)}
                    </span>
                  </div>
                  <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ft-ink md:text-[32px] lg:text-[36px]">
                    {displayName}
                  </h1>
                  <p className="mt-1 text-[13px] font-medium text-ft-accent-deep">
                    {t("teacher")}
                  </p>
                  <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-ft-ink-2 md:text-[14.5px]">
                    {bioText}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ft-ink px-5 text-[13px] font-semibold text-ft-paper hover:bg-[#2a241b] sm:flex-shrink-0"
                >
                  <CalendarDays className="h-4 w-4" />
                  {t("editProfile")}
                </button>
              </div>

              {/* Stats row */}
              <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <StatChip
                  label={t("rating")}
                  value={(tutorProfile?.rating ?? 0).toFixed(1)}
                />
                <StatChip
                  label={t("totalReviews")}
                  value={String(tutorProfile?.total_reviews ?? 0)}
                />
                <StatChip
                  label={t("experience")}
                  value={
                    <>
                      {tutorProfile?.years_of_experience ?? 0}
                      <span className="ml-1 text-[12px] font-medium text-ft-ink-3">
                        {t("years")}
                      </span>
                    </>
                  }
                />
                <StatChip
                  label={t("courses")}
                  value={String(courses.length)}
                />
              </div>
            </div>
          </div>

          <EditProfileModal
            isOpen={isEditModalOpen}
            tutorId={teacherUser.id}
            initialBio={tutorProfile?.bio ?? ""}
            initialYearsOfExperience={tutorProfile?.years_of_experience ?? null}
            onTutorProfileUpdated={(updates) =>
              setTutorProfile((prev) => (prev ? { ...prev, ...updates } : prev))
            }
            onClose={() => {
              setIsEditModalOpen(false);
              router.refresh();
            }}
          />

          {hasAvailability !== null && (
            <div className="px-5 pt-5 md:px-9 lg:px-0">
              <TutorOnboardingCard
                steps={[
                  {
                    id: "profile",
                    done: hasBio && subjects.length > 0,
                    onAction: () =>
                      hasBio ? scrollToSection("tutor-subjects") : setIsEditModalOpen(true),
                  },
                  {
                    id: "availability",
                    done: hasAvailability,
                    onAction: () => setActiveTab("availability"),
                  },
                  {
                    id: "course",
                    done: courses.length > 0,
                    onAction: () => scrollToSection("tutor-courses"),
                  },
                ]}
              />
            </div>
          )}

          {/* Tabs */}
          <div className="px-5 pt-5 md:px-9 lg:px-0">
            <div className="hide-scroll flex gap-1.5 overflow-x-auto rounded-ft-md border border-ft-line-soft bg-ft-surface-1 p-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-ft-sm px-3 py-2 text-[12px] font-semibold transition-colors",
                      active
                        ? "bg-ft-paper text-ft-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                        : "text-ft-ink-3 hover:text-ft-ink-2"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="px-5 py-5 md:px-9 lg:px-0">
            {activeTab === "profile" && (
              <div className="space-y-4">
                {/* Personal info + expertise side-by-side on lg */}
                <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
                  <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
                    <h2 className="m-0 text-[15px] font-semibold tracking-tight text-ft-ink">
                      {t("personalInfo")}
                    </h2>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <ReadField label={t("email")} value={teacherUser.email} />
                      <ReadField
                        label={t("phone")}
                        value={teacherUser.phone || t("notProvided")}
                      />
                      <ReadField
                        label={t("location")}
                        value={
                          teacherUser.country ||
                          tutorProfile?.timezone ||
                          t("notProvided")
                        }
                      />
                      <ReadField
                        label={t("specialties")}
                        value={
                          subjects.length > 0
                            ? subjects.map((s) => s.name).join(", ")
                            : t("notProvided")
                        }
                      />
                    </div>
                  </section>

                  <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
                    <h2 className="m-0 text-[15px] font-semibold tracking-tight text-ft-ink">
                      {t("expertiseTitle")}
                    </h2>
                    <p className="mt-1 text-[12px] text-ft-ink-3">
                      Áreas donde destacas como tutor.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {expertiseBadges.map((badge) => (
                        <span
                          key={badge}
                          className="inline-flex items-center gap-1 rounded-full border border-ft-line bg-ft-surface-1 px-3 py-1 text-[12px] font-medium text-ft-ink-2"
                        >
                          <GraduationCap className="h-3 w-3 text-ft-accent-deep" />
                          {badge}
                        </span>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
                  <h2 className="m-0 text-[15px] font-semibold tracking-tight text-ft-ink">
                    {t("teachingExperience")}
                  </h2>
                  <div className="mt-3 rounded-ft border border-ft-line-soft bg-ft-surface-1 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                      {t("bio")}
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-ft-ink-2">
                      {bioText}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <MiniStatCard
                      label={t("hourlyRate")}
                      value={
                        tutorProfile?.hourly_rate
                          ? `${tutorProfile.hourly_rate}€`
                          : t("notProvided")
                      }
                    />
                    <MiniStatCard
                      label={t("rating")}
                      value={String(tutorProfile?.rating ?? 0)}
                    />
                    <MiniStatCard
                      label={t("totalReviews")}
                      value={String(tutorProfile?.total_reviews ?? 0)}
                    />
                  </div>
                </section>

                <TutorCVSection
                  tutorId={teacherUser.id}
                  certifications={tutorProfile?.certifications}
                  onTutorProfileUpdated={(updates) =>
                    setTutorProfile((prev) =>
                      prev ? { ...prev, ...updates } : prev
                    )
                  }
                />

                <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
                  <h2 className="m-0 mb-3 inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ft-ink">
                    <Star
                      className="h-4 w-4 text-ft-accent"
                      fill="currentColor"
                      stroke="none"
                    />
                    {t("reviewsTitle")}
                  </h2>
                  <TutorReviewsSection />
                </section>

                <div id="tutor-subjects" className="scroll-mt-6">
                  <TutorSubjectsManager
                    tutorId={teacherUser.id}
                    initialSubjects={subjects}
                    onSubjectsUpdated={setSubjects}
                  />
                </div>

                <div id="tutor-courses" className="scroll-mt-6">
                  <TutorCoursesManager
                    tutorId={teacherUser.id}
                    initialCourses={courses}
                    onCoursesUpdated={setCourses}
                  />
                </div>
              </div>
            )}

            {activeTab === "availability" && (
              <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-4 md:p-5">
                <AvailabilityCalendar
                  refreshKey={calendarRefresh}
                  tutorTimeZone={resolveTimeZone(tutorProfile?.timezone)}
                />
                {teacherUser.id ? (
                  <div className="mt-4">
                    <RecurringAvailabilityManager
                      tutorId={teacherUser.id}
                      onChanged={() => setCalendarRefresh((n) => n + 1)}
                      tutorTimeZone={tutorProfile?.timezone ?? null}
                      onTimeZoneSaved={(timezone) => {
                        setTutorProfile((prev) => (prev ? { ...prev, timezone } : prev));
                        setCalendarRefresh((n) => n + 1);
                      }}
                    />
                  </div>
                ) : null}
              </section>
            )}

            {activeTab === "requests" && (
              <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-4 md:p-5">
                <TutorBookingRequests
                  onRequestResponded={() => {
                    setCalendarRefresh((n) => n + 1);
                    router.refresh();
                  }}
                />
              </section>
            )}

            {activeTab === "messages" && (
              <InternalMessagingPanel namespace="teacherProfile" />
            )}

            {/* Mobile sign-out — desktop uses the sidebar */}
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-2 flex w-full items-center gap-3.5 rounded-ft-lg border border-ft-line-soft bg-ft-paper px-4 py-3.5 text-left text-red-700 transition-colors hover:bg-red-50 lg:hidden"
            >
              <span className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-ft border border-red-100 bg-red-50">
                <LogOut width={16} height={16} />
              </span>
              <span className="text-[14px] font-medium">{t("signOut")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-ft border border-ft-line-soft bg-ft-paper p-3">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
        {label}
      </p>
      <p className="m-0 mt-1 text-[20px] font-semibold tracking-[-0.02em] text-ft-ink">
        {value}
      </p>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
        {label}
      </span>
      <div className="mt-1.5 rounded-ft border border-ft-line bg-ft-surface-1 px-3 py-2.5 text-[13.5px] text-ft-ink">
        {value}
      </div>
    </div>
  );
}

function MiniStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ft border border-ft-line-soft bg-ft-surface-1 p-3.5">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
        {label}
      </p>
      <p className="m-0 mt-1.5 text-[14.5px] font-semibold tracking-tight text-ft-ink">
        {value}
      </p>
    </div>
  );
}
