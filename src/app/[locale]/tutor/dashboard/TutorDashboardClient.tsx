"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StudentSidebarNav } from "@/components/ds/StudentSidebarNav";
import { useAuth } from "@/context/UserContext";
import { useNotificationsContext } from "@/context/NotificationsContext";
import { useTranslations, useLocale } from "@/i18n/translations";
import { createClient } from "@/lib/supabase/client";
import { fetchTutorReviewStatsMap } from "@/lib/supabase/tutor-review-stats";
import { getAvatarColor } from "@/lib/utils";
import { getBookingsByTutor } from "@/lib/supabase/queries/bookings";
import { fetchStudentNames } from "@/lib/supabase/student-names";
import type {
  Booking,
  BookingRejectionReason,
} from "@/types/booking";
import type { LessonWithRelations } from "@/types/lesson";
import {
  Calendar,
  Clock,
  Euro,
  Users,
  Star,
  TrendingUp,
  BookOpen,
  ArrowRight,
  ChevronDown,
  MessageSquare,
  Loader2,
  Video,
  Link as LinkIcon,
  Copy,
  Sparkles,
} from "lucide-react";
import {
  endOfTodayAsLessonTimestamp,
  startOfMonthAsLessonTimestamp,
  startOfTodayAsLessonTimestamp,
} from "@/lib/datetime/lessonTime";
import {
  formatLessonTimestamp,
  lessonTimestampToEpoch,
  useViewerTimeZone,
} from "@/lib/datetime/viewerTime";
import { isPendingExpired } from "@/lib/bookings/pendingExpiry";

type PendingBookingItem = {
  booking: Booking;
  lesson: LessonWithRelations | null;
  // For custom requests we don't have a lesson; carry the snapshot from the booking.
  customSubjectName?: string | null;
  studentName?: string | null;
};

function isCustomRequestItem(item: PendingBookingItem): boolean {
  return item.booking.lesson_id == null;
}

function getItemDisplay(item: PendingBookingItem): {
  subjectName: string | null;
  scheduledDateTime: string | null;
  durationMinutes: number | null;
  price: number | null;
  studentName: string | null;
  isCustomRequest: boolean;
  notes: string | null;
} {
  const isCustom = isCustomRequestItem(item);
  if (isCustom) {
    return {
      subjectName: item.customSubjectName ?? null,
      scheduledDateTime: item.booking.requested_scheduled_date_time ?? null,
      durationMinutes: item.booking.requested_duration_minutes ?? null,
      price: null,
      studentName: item.studentName ?? null,
      isCustomRequest: true,
      notes: item.booking.notes ?? null,
    };
  }
  return {
    subjectName: item.lesson?.subject?.name ?? null,
    scheduledDateTime: item.lesson?.scheduled_date_time ?? null,
    durationMinutes: item.lesson?.duration_minutes ?? null,
    price: item.lesson?.price ?? null,
    studentName: item.studentName ?? null,
    isCustomRequest: false,
    notes: item.booking.notes ?? null,
  };
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

interface DashboardStats {
  classesThisMonth: number;
  avgRating: number | null;
  earningsThisMonth: number;
}

interface TutorDashboardInitialData {
  user: {
    id: string;
    email: string | null;
  };
  pendingItems: PendingBookingItem[];
  stats: DashboardStats;
  todayLessons: TodayLesson[];
}

const REJECTION_REASONS: Array<{
  value: BookingRejectionReason;
  translationKey: string;
}> = [
  { value: "tutor unavailable", translationKey: "tutorUnavailable" },
  { value: "sick tutor", translationKey: "sickTutor" },
  { value: "sick student", translationKey: "sickStudent" },
  { value: "scheduling conflict", translationKey: "schedulingConflict" },
  { value: "emergency", translationKey: "emergency" },
  { value: "technical issues", translationKey: "technicalIssues" },
  { value: "other", translationKey: "other" },
];

export default function TutorDashboardClient({
  initialData,
}: {
  initialData?: TutorDashboardInitialData;
}) {
  const t = useTranslations("tutorDashboardPage");
  const td = useTranslations("dashboard");
  const timeZone = useViewerTimeZone();
  const locale = useLocale();
  const { user } = useAuth();
  const effectiveUser = initialData?.user ?? { id: user?.id ?? "", email: user?.email ?? null };

  const [loading, setLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingBookingItem[]>(
    initialData?.pendingItems ?? []
  );
  const [actionLoadingBookingId, setActionLoadingBookingId] = useState<number | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingBookingItem | null>(null);
  const [rejectReason, setRejectReason] = useState<BookingRejectionReason>("tutor unavailable");
  const rejectDialogBodyScrollRef = useRef<HTMLDivElement>(null);

  const rejectReasonOptions = useMemo(
    () =>
      REJECTION_REASONS.map((r) => ({
        value: r.value,
        label: t(`rejectionReasons.${r.translationKey}`),
      })),
    [t]
  );

  const [stats, setStats] = useState<DashboardStats>(
    initialData?.stats ?? {
      classesThisMonth: 0,
      avgRating: null,
      earningsThisMonth: 0,
    }
  );
  const [statsLoading, setStatsLoading] = useState(!initialData);
  const [todayLessons, setTodayLessons] = useState<TodayLesson[]>(initialData?.todayLessons ?? []);
  const [todayLoading, setTodayLoading] = useState(!initialData);
  const [pendingOpen, setPendingOpen] = useState(true);
  const [editingMeetLinkId, setEditingMeetLinkId] = useState<number | null>(null);
  const [editingMeetLinkValue, setEditingMeetLinkValue] = useState("");
  const [meetLinkSaving, setMeetLinkSaving] = useState(false);
  const [confirmMeetLink, setConfirmMeetLink] = useState("");

  const loadPending = async () => {
    if (!effectiveUser.id) return;

    setLoading(true);
    try {
      const bookings = await getBookingsByTutor(effectiveUser.id);
      const pendingBookings = bookings.filter((b) => {
        if (b.status !== "pending") return false;
        if (typeof b.lesson_id === "number") return true;
        // Custom request: keep only if not expired (F014) and well-formed.
        return (
          typeof b.requested_scheduled_date_time === "string" &&
          !isPendingExpired({ created_at: b.created_at, start: b.requested_scheduled_date_time }) &&
          typeof b.requested_subject_id === "number"
        );
      });

      const customSubjectIds = [
        ...new Set(
          pendingBookings
            .filter((b) => b.lesson_id == null)
            .map((b) => b.requested_subject_id)
            .filter((id): id is number => typeof id === "number")
        ),
      ];

      const supabase = createClient();
      const lessonIds = pendingBookings
        .map((b) => b.lesson_id)
        .filter((id): id is number => typeof id === "number");
      const [subjectsRes, lessonsRes, studentNameById] = await Promise.all([
        customSubjectIds.length
          ? supabase
            .from("subjects")
            .select("id,name")
            .in("id", customSubjectIds)
          : Promise.resolve({ data: [] as { id: number; name: string }[] }),
        lessonIds.length
          ? supabase
              .from("lessons")
              .select(
                "id, tutor_id, student_id, subject_id, price, scheduled_date_time, duration_minutes, status, meet_link, google_event_id, created_at, updated_at, subject:subjects(id, name, description, icon)"
              )
              .in("id", lessonIds)
          : Promise.resolve({ data: [] }),
        fetchStudentNames(
          supabase,
          pendingBookings.map((b) => b.student_id)
        ),
      ]);
      const lessonById = new Map(
        ((lessonsRes.data ?? []) as unknown as LessonWithRelations[]).map((l) => [l.id, l])
      );
      const subjectNameById = new Map(
        (subjectsRes.data ?? []).map((s) => [s.id, s.name])
      );

      const items = pendingBookings.map((booking) => {
          const studentName = studentNameById.get(booking.student_id) ?? null;
          if (typeof booking.lesson_id === "number") {
            const lesson = lessonById.get(booking.lesson_id) ?? null;
            return { booking, lesson, studentName } satisfies PendingBookingItem;
          }
          return {
            booking,
            lesson: null,
            studentName,
            customSubjectName:
              typeof booking.requested_subject_id === "number"
                ? subjectNameById.get(booking.requested_subject_id) ?? null
                : null,
          } satisfies PendingBookingItem;
        });

      // F014: slot requests past their deadline are hidden (the API expires them).
      setPendingItems(
        items.filter(
          (item) =>
            !item.lesson ||
            !isPendingExpired({
              created_at: item.booking.created_at,
              start: item.lesson.scheduled_date_time ?? null,
            })
        )
      );
    } catch (e) {
      console.error("Error loading pending bookings:", e);
      toast.error(t("loadingError"));
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!effectiveUser.id) return;

    setStatsLoading(true);
    try {
      const supabase = createClient();
      const startOfMonth = startOfMonthAsLessonTimestamp();

      const [lessonsRes, profileRes, reviewStatsMap] = await Promise.all([
        supabase
          .from("lessons")
          .select("price, duration_minutes")
          .eq("tutor_id", effectiveUser.id)
          .eq("status", "completed")
          .gte("scheduled_date_time", startOfMonth),
        supabase
          .from("tutor_profiles")
          .select("rating")
          .eq("id", effectiveUser.id)
          .single(),
        fetchTutorReviewStatsMap(supabase, [effectiveUser.id]),
      ]);

      const monthLessons = lessonsRes.data ?? [];
      const totalEarnings = monthLessons.reduce((sum, l) => sum + (l.price ?? 0), 0);
      const fromReviews = reviewStatsMap?.get(effectiveUser.id);

      setStats({
        classesThisMonth: monthLessons.length,
        avgRating:
          fromReviews?.rating ?? profileRes.data?.rating ?? null,
        earningsThisMonth: totalEarnings,
      });
    } catch (e) {
      console.error("Error loading stats:", e);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadTodayLessons = async () => {
    if (!effectiveUser.id) return;

    setTodayLoading(true);
    try {
      const supabase = createClient();

      const { data } = await supabase
        .from("lessons")
        .select(
          "id, student_id, scheduled_date_time, duration_minutes, price, status, meet_link, subject:subjects(name)"
        )
        .eq("tutor_id", effectiveUser.id)
        .in("status", ["confirmed", "scheduled"])
        .gte("scheduled_date_time", startOfTodayAsLessonTimestamp())
        .lte("scheduled_date_time", endOfTodayAsLessonTimestamp())
        .order("scheduled_date_time", { ascending: true });

      const rows = (data ?? []) as unknown as Array<
        TodayLesson & { student_id: string | null }
      >;
      const names = await fetchStudentNames(
        supabase,
        rows.map((l) => l.student_id)
      );
      setTodayLessons(
        rows.map(({ student_id, ...lesson }) => ({
          ...lesson,
          student: student_id
            ? { id: student_id, user: { username: names.get(student_id) ?? "" } }
            : null,
        }))
      );
    } catch (e) {
      console.error("Error loading today lessons:", e);
    } finally {
      setTodayLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData) {
      void loadPending();
      void loadStats();
      void loadTodayLessons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUser.id, initialData]);

  // Refresh pending requests, stats and today's classes when a booking event
  // arrives through realtime (new request, cancellation...).
  const { latest: latestNotification } = useNotificationsContext();
  useEffect(() => {
    if (!latestNotification?.type.startsWith("booking_")) return;
    void loadPending();
    void loadStats();
    void loadTodayLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestNotification?.id]);

  const openRejectDialog = (item: PendingBookingItem) => {
    setRejectTarget(item);
    setRejectReason("tutor unavailable");
    setRejectDialogOpen(true);
  };

  const handleConfirm = async (booking: Booking, videoLink?: string) => {
    if (!effectiveUser.id) return;

    setActionLoadingBookingId(booking.id);
    try {
      const response = await fetch("/api/bookings/tutor/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          action: "confirm",
          ...(videoLink ? { meetLink: videoLink } : {}),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        code?: string;
        meetStatus?: string;
      };
      if (result.code === "invalid_meet_link") {
        toast.error(td("meetLinkInvalid"));
        return;
      }
      if (!response.ok) throw new Error(result.error || t("confirmError"));

      setConfirmMeetLink("");
      toast.success(t("confirmSuccess"));
      if (result.meetStatus === "failed") toast.warning(td("meetAutoCreateFailed"));
      await loadPending();
    } catch (e) {
      console.error("Error confirming booking:", e);
      toast.error(t("confirmError"));
    } finally {
      setActionLoadingBookingId(null);
    }
  };

  const saveMeetLink = async (lessonId: number) => {
    setMeetLinkSaving(true);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/meet-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetLink: editingMeetLinkValue }),
      });
      const result = (await response.json()) as { error?: string; code?: string };
      if (result.code === "invalid_meet_link") {
        toast.error(td("meetLinkInvalid"));
        return;
      }
      if (!response.ok) throw new Error(result.error || td("meetLinkUpdateError"));

      setTodayLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId
            ? { ...l, meet_link: editingMeetLinkValue.trim() || null }
            : l
        )
      );
      setEditingMeetLinkId(null);
      setEditingMeetLinkValue("");
      toast.success(td("meetLinkUpdated"));
    } catch (e) {
      console.error("Error saving meet link:", e);
      toast.error(td("meetLinkUpdateError"));
    } finally {
      setMeetLinkSaving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !effectiveUser.id) return;

    const { booking } = rejectTarget;

    setActionLoadingBookingId(booking.id);
    try {
      // The API frees the slot, stores the reason and notifies the student.
      const response = await fetch("/api/bookings/tutor/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          action: "reject",
          reason: rejectReason,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || t("rejectError"));

      setRejectDialogOpen(false);
      setRejectTarget(null);

      toast.success(t("rejectSuccess"));
      await loadPending();
    } catch (e) {
      console.error("Error rejecting booking:", e);
      toast.error(t("rejectError"));
    } finally {
      setActionLoadingBookingId(null);
    }
  };

  const formatTime = (dateString: string) => {
    return formatLessonTimestamp(dateString, locale, timeZone, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statCards = [
    {
      label: td("classesThisMonth"),
      value: stats.classesThisMonth,
      icon: BookOpen,
      color: "bg-blue-100 text-blue-600",
      accent: "border-blue-200",
    },
    {
      label: td("pendingRequests"),
      value: pendingItems.length,
      icon: Clock,
      color: "bg-amber-100 text-amber-600",
      accent: "border-amber-200",
    },
    {
      label: td("avgRating"),
      value: stats.avgRating != null ? stats.avgRating.toFixed(1) : "—",
      icon: Star,
      color: "bg-ft-accent-soft text-ft-accent-deep",
      accent: "border-ft-line",
      suffix: stats.avgRating != null ? "/5" : "",
    },
    {
      label: td("monthlyEarnings"),
      value: `${stats.earningsThisMonth.toFixed(0)}€`,
      icon: Euro,
      color: "bg-emerald-100 text-emerald-600",
      accent: "border-emerald-200",
    },
  ];

  const quickActions = [
    {
      label: td("manageAvailability"),
      href: `/${locale}/teacher-profile`,
      icon: Calendar,
      description: td("manageAvailability"),
    },
    {
      label: td("browseCourses"),
      href: `/${locale}/courses`,
      icon: BookOpen,
      description: td("browseCourses"),
    },
    {
      label: td("myMessages"),
      href: `/${locale}/messages`,
      icon: MessageSquare,
      description: td("myMessages"),
    },
    {
      label: td("viewProfile"),
      href: `/${locale}/teacher-profile`,
      icon: Users,
      description: td("viewProfile"),
    },
  ];

  const greetingName = effectiveUser.email?.split("@")[0] ?? "Tutor";
  const todayLabel = new Date().toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-screen-md pb-24 md:max-w-screen-lg md:pb-10 lg:max-w-screen-xl lg:px-9 lg:py-8">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <StudentSidebarNav isTutor />

        <div className="min-w-0">
      {/* ═══════════════ MOBILE VIEW (< md) ═══════════════ */}
      <div className="space-y-6 px-4 pt-2 md:hidden">
        {/* Compact welcome */}
        <section>
          <p className="text-sm font-medium text-ft-ink-2">{td("welcomeSubtitle")}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
            Hola, {greetingName}
          </h1>
        </section>

        {/* Metric cards - tall, colorful, horizontal scroll */}
        <section className="-mx-4 flex gap-3 overflow-x-auto px-4 no-scrollbar">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className={`flex h-36 w-40 shrink-0 flex-col justify-between rounded-ft-xl p-5 ${stat.color}`}
            >
              <stat.icon className="h-6 w-6" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                  {stat.label}
                </p>
                {statsLoading ? (
                  <Loader2 className="mt-1 h-4 w-4 animate-spin" />
                ) : (
                  <p className="text-xl font-extrabold">
                    {stat.value}
                    {stat.suffix && <span className="text-xs font-normal">{stat.suffix}</span>}
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* Pending requests - compact */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{t("title")}</h2>
            <span className="text-sm font-semibold text-ft-ink-2">
              {pendingItems.length} {t("pending")}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pendingItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noPendingBookings")}</p>
          ) : (
            <div className="space-y-2">
              {pendingItems.map((item) => {
                const { booking } = item;
                const display = getItemDisplay(item);
                const studentName = display.studentName || t("student");
                const initials = studentName.slice(0, 2).toUpperCase();
                const timeLabel = display.scheduledDateTime
                  ? formatTime(display.scheduledDateTime)
                  : "—";

                return (
                  <div
                    key={booking.id}
                    className={`flex items-center justify-between gap-3 rounded-ft-lg p-4 shadow-sm ${
                      display.isCustomRequest ? "bg-amber-50" : "bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback
                          className="text-xs font-semibold text-white"
                          style={{ backgroundColor: getAvatarColor(studentName) }}
                        >
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-bold text-slate-900">
                          {studentName}
                          {display.isCustomRequest ? (
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {display.subjectName ?? t("lessonUnknown")} &middot; {timeLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100"
                        onClick={() => openRejectDialog(item)}
                        disabled={actionLoadingBookingId === booking.id}
                      >
                        <span className="text-lg font-bold">✕</span>
                      </button>
                      <button
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-ft-ink text-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.20)] transition-colors hover:bg-[#2a241b]"
                        onClick={() => handleConfirm(booking)}
                        disabled={actionLoadingBookingId === booking.id}
                      >
                        {actionLoadingBookingId === booking.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <span className="text-lg font-bold">✓</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Today's agenda - timeline */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{td("todaySchedule")}</h2>
          {todayLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : todayLessons.length === 0 ? (
            <div className="py-8 text-center">
              <Calendar className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{td("noClassesToday")}</p>
            </div>
          ) : (
            <div className="relative ml-3 space-y-6 border-l-2 border-ft-line-soft pl-7">
              {todayLessons.map((lesson, idx) => {
                const studentName = lesson.student?.user?.username || "—";
                const isCurrent = idx === 0;
                const endTime = new Date(
                  lessonTimestampToEpoch(lesson.scheduled_date_time) +
                    lesson.duration_minutes * 60000
                );

                return (
                  <div key={lesson.id} className="relative">
                    <div
                      className={`absolute -left-[33px] top-1 h-3.5 w-3.5 rounded-full border-[3px] border-white ${
                        isCurrent ? "bg-ft-ink" : "bg-slate-300"
                      }`}
                    />
                    <div
                      className={`rounded-ft-xl p-5 ${
                        isCurrent ? "bg-ft-surface-1" : "bg-white/80 opacity-80"
                      }`}
                    >
                      <span
                        className={`inline-block rounded-ft-xs px-2.5 py-1 text-xs font-bold ${
                          isCurrent
                            ? "bg-ft-surface-2 text-ft-ink"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {formatTime(lesson.scheduled_date_time)} -{" "}
                        {endTime.toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone,
                        })}
                      </span>
                      <h3 className="mt-2.5 text-lg font-bold text-slate-900">
                        {lesson.subject?.name ?? "—"}
                      </h3>
                      <div className="mt-2 flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback
                            className="text-[10px] font-semibold text-white"
                            style={{ backgroundColor: getAvatarColor(studentName) }}
                          >
                            {studentName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <p className="text-sm text-slate-500">Con {studentName}</p>
                      </div>
                      {lesson.meet_link ? (
                        <Button
                          className="mt-4 w-full rounded-ft-md border border-ft-line bg-white text-ft-ink-2 hover:bg-ft-surface-1"
                          onClick={() => window.open(lesson.meet_link!, "_blank")}
                        >
                          <Video className="mr-2 h-4 w-4" />
                          {isCurrent ? td("resumeClass") : td("openVideoCall")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="mt-4 w-full rounded-ft-md border-ft-line text-ft-ink-2"
                          onClick={() => {
                            setEditingMeetLinkId(lesson.id);
                            setEditingMeetLinkValue("");
                          }}
                        >
                          <LinkIcon className="mr-2 h-4 w-4" />
                          {td("addMeetLink")}
                        </Button>
                      )}

                      {editingMeetLinkId === lesson.id && (
                        <div className="mt-3 space-y-2">
                          <Input
                            type="url"
                            className="h-10 w-full text-sm"
                            value={editingMeetLinkValue}
                            onChange={(e) => setEditingMeetLinkValue(e.target.value)}
                            placeholder={t("meetLinkPlaceholder")}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={meetLinkSaving}
                              onClick={() => void saveMeetLink(lesson.id)}
                            >
                              {meetLinkSaving ? td("meetLinkSaving") : "OK"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingMeetLinkId(null)}
                            >
                              {t("cancelReject")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ═══════════════ TABLET / DESKTOP VIEW (md+) ═══════════════ */}
      <div className="hidden space-y-6 md:block">
        {/* Hero card */}
        <div className="rounded-ft-2xl border border-ft-line-soft bg-gradient-to-br from-ft-surface-2 to-ft-surface-1 p-7 shadow-sm">
          <div>
            <p className="text-sm font-medium text-ft-ink-2">{todayLabel}</p>
            <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900 lg:text-5xl">
              {td("tutorDashboard")}
            </h1>
            <p className="mt-2 text-base text-slate-600">
              {td("welcomeSubtitle")} {greetingName}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {statCards.map((stat) => (
            <Card
              key={stat.label}
              className={`border ${stat.accent} bg-white/90 backdrop-blur transition-shadow hover:shadow-md`}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-ft-sm p-2.5 ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
                  {statsLoading ? (
                    <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="text-lg font-bold leading-tight text-slate-900">
                      {stat.value}
                      {stat.suffix && (
                        <span className="text-xs font-normal text-muted-foreground">{stat.suffix}</span>
                      )}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main grid: content + sidebar */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            {/* Pending requests - full detail */}
            <Card className="border-ft-line-soft">
              <CardHeader
                className="flex cursor-pointer flex-row items-start justify-between gap-4 select-none"
                onClick={() => setPendingOpen((prev) => !prev)}
              >
                <div className="flex-1 space-y-1">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    {t("title")}
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        pendingOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </CardTitle>
                  <p className="text-sm text-gray-600">{t("description")}</p>
                </div>
                <Badge className="bg-ft-surface-2 text-ft-ink hover:bg-ft-surface-2">
                  {pendingItems.length} {t("pending")}
                </Badge>
              </CardHeader>

              {pendingOpen && (
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="text-sm text-gray-500">{t("loading")}</span>
                    </div>
                  ) : pendingItems.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500">{t("noPendingBookings")}</div>
                  ) : (
                    <div className="grid gap-3">
                      {pendingItems.map((item) => {
                        const { booking } = item;
                        const display = getItemDisplay(item);
                        const scheduledLabel = display.scheduledDateTime
                          ? formatLessonTimestamp(display.scheduledDateTime, locale, timeZone, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—";
                        const studentName = display.studentName || t("student");
                        const initials = studentName.slice(0, 2).toUpperCase();

                        return (
                          <div
                            key={booking.id}
                            className={`space-y-3 rounded-ft-base border p-4 ${
                              display.isCustomRequest
                                ? "border-amber-200 bg-amber-50/50"
                                : "border-ft-line-soft bg-ft-paper-deep"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar className="h-10 w-10 shrink-0">
                                  <AvatarFallback
                                    className="text-xs font-semibold text-white"
                                    style={{ backgroundColor: getAvatarColor(studentName) }}
                                  >
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-slate-900">
                                    {display.subjectName ?? t("lessonUnknown")}
                                  </p>
                                  <p className="truncate text-xs text-slate-600">
                                    {t("student")}: {studentName}
                                  </p>
                                </div>
                              </div>
                              {display.isCustomRequest ? (
                                <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                                  <Sparkles className="h-3 w-3" />
                                  {t("customRequestBadge")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">{t("pending")}</Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-sm text-slate-700">
                              <div className="rounded-ft-sm bg-white/80 p-2">
                                <p className="text-xs text-slate-500">{t("scheduledAt")}</p>
                                <p className="font-medium">{scheduledLabel}</p>
                              </div>
                              <div className="rounded-ft-sm bg-white/80 p-2">
                                <p className="text-xs text-slate-500">{t("duration")}</p>
                                <p className="font-medium">
                                  {display.durationMinutes ?? "—"} {t("minutes")}
                                </p>
                              </div>
                              <div className="rounded-ft-sm bg-white/80 p-2">
                                <p className="text-xs text-slate-500">{t("price")}</p>
                                <p className="font-medium">
                                  {display.isCustomRequest
                                    ? t("priceFromHourlyRate")
                                    : display.price != null ? `${display.price}€` : "—"}
                                </p>
                              </div>
                            </div>

                            {display.notes ? (
                              <div className="rounded-ft-xs bg-white/70 p-2 text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">
                                  {t("studentNotes")}:
                                </span>{" "}
                                {display.notes}
                              </div>
                            ) : null}

                            <div className="space-y-2 border-t border-ft-line-soft pt-2">
                              <div className="flex items-center gap-2">
                                <Video className="h-4 w-4 text-ft-ink-3" />
                                <Input
                                  type="url"
                                  className="h-8 flex-1 text-xs"
                                  placeholder={t("meetLinkPlaceholder")}
                                  value={confirmMeetLink}
                                  onChange={(e) => setConfirmMeetLink(e.target.value)}
                                />
                              </div>
                              <p className="text-[11px] text-slate-500">{t("meetLinkHint")}</p>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                  onClick={() => openRejectDialog(item)}
                                  disabled={actionLoadingBookingId === booking.id}
                                >
                                  {t("reject")}
                                </Button>
                                <Button
                                  className="bg-ft-ink hover:bg-[#2a241b]"
                                  onClick={() => handleConfirm(booking, confirmMeetLink)}
                                  disabled={actionLoadingBookingId === booking.id}
                                >
                                  {actionLoadingBookingId === booking.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    t("accept")
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Today schedule - timeline */}
            <Card className="border-ft-line-soft">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Calendar className="h-5 w-5 text-ft-ink-2" />
                    {td("todaySchedule")}
                  </CardTitle>
                  <Link href={`/${locale}/teacher-profile`}>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-ft-ink">
                      {td("viewAll")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {todayLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : todayLessons.length === 0 ? (
                  <div className="py-8 text-center">
                    <Calendar className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{td("noClassesToday")}</p>
                  </div>
                ) : (
                  <div className="relative space-y-3 pl-4 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[2px] before:bg-ft-surface-2">
                    {todayLessons.map((lesson, idx) => {
                      const studentName = lesson.student?.user?.username || "—";
                      const isCurrent = idx === 0;
                      return (
                        <div
                          key={lesson.id}
                          className={`relative rounded-ft-base border p-4 ${
                            isCurrent
                              ? "border-ft-line bg-ft-surface-1 shadow-sm"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <span
                            className={`absolute -left-[23px] top-5 h-3 w-3 rounded-full border-2 border-white ${
                              isCurrent ? "bg-ft-ink" : "bg-slate-300"
                            }`}
                          />
                          <div className="flex flex-row items-center justify-between gap-3">
                            <div className="min-w-0">
                              {isCurrent ? (
                                <span className="mb-1 inline-block rounded-full bg-ft-ink px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                  {t("liveBadge")}
                                </span>
                              ) : null}
                              <p className="text-xs font-semibold text-ft-ink">
                                {formatTime(lesson.scheduled_date_time)} · {lesson.duration_minutes} min
                              </p>
                              <p className="truncate text-base font-semibold text-slate-900">
                                {lesson.subject?.name ?? "—"}
                              </p>
                              <p className="truncate text-sm text-slate-600">{studentName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {lesson.meet_link ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    onClick={() => {
                                      navigator.clipboard.writeText(lesson.meet_link!);
                                      toast.success(td("meetLinkCopied"));
                                    }}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={isCurrent ? "default" : "outline"}
                                    className={`gap-1 ${isCurrent ? "bg-ft-ink hover:bg-[#2a241b]" : ""}`}
                                    onClick={() => window.open(lesson.meet_link!, "_blank")}
                                  >
                                    <Video className="h-3.5 w-3.5" />
                                    {isCurrent ? td("resumeClass") : td("openVideoCall")}
                                  </Button>
                                </>
                              ) : editingMeetLinkId === lesson.id ? (
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    type="url"
                                    className="h-8 w-52 text-xs"
                                    value={editingMeetLinkValue}
                                    onChange={(e) => setEditingMeetLinkValue(e.target.value)}
                                    placeholder={t("meetLinkPlaceholder")}
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    disabled={meetLinkSaving}
                                    onClick={() => void saveMeetLink(lesson.id)}
                                  >
                                    {meetLinkSaving ? td("meetLinkSaving") : "OK"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingMeetLinkId(null)}
                                  >
                                    ✕
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-ft-ink-2"
                                  onClick={() => {
                                    setEditingMeetLinkId(lesson.id);
                                    setEditingMeetLinkValue(lesson.meet_link ?? "");
                                  }}
                                >
                                  <LinkIcon className="h-3.5 w-3.5" />
                                  {td("addMeetLink")}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6 lg:col-span-4">
            <Card className="border-ft-line-soft">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-ft-ink-2" />
                  {td("quickActions")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {quickActions.map((action) => (
                    <Link key={action.href + action.label} href={action.href}>
                      <div className="flex h-full cursor-pointer flex-col items-center justify-center gap-2 rounded-ft-base border border-ft-line-soft bg-ft-paper-deep p-4 text-center transition-all hover:bg-ft-ink hover:text-white">
                        <action.icon className="h-5 w-5" />
                        <span className="text-xs font-semibold leading-tight">{action.label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-ft-line-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{t("mentorTipTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm italic text-slate-600">
                  &quot;{t("mentorTipBody")}&quot;
                </p>
                <Button variant="ghost" className="w-full justify-center text-ft-ink">
                  {t("moreTips")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden p-0 sm:max-w-[540px]">
          <DialogHeader className="px-4 pt-6 sm:px-6">
            <DialogTitle>{t("rejectDialogTitle")}</DialogTitle>
          </DialogHeader>

          {rejectTarget ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div
                ref={rejectDialogBodyScrollRef}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-1 sm:px-6"
              >
              <div className="space-y-2">
                <Label htmlFor="reject-reason">{t("rejectReason")}</Label>
                <SelectMenu
                  id="reject-reason"
                  value={rejectReason}
                  onValueChange={(v) =>
                    setRejectReason(v as BookingRejectionReason)
                  }
                  options={rejectReasonOptions}
                  disabled={actionLoadingBookingId === rejectTarget.booking.id}
                  aria-label={t("rejectReason")}
                  nestedScrollParentRef={rejectDialogBodyScrollRef}
                  triggerClassName="h-10 rounded-ft border border-gray-300 bg-white shadow-sm hover:bg-gray-50/90"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("notesOptional")}</Label>
                <Input
                  placeholder={t("notesOptionalPlaceholder")}
                  value={rejectTarget.booking.notes ?? ""}
                  disabled
                />
              </div>
              </div>
              <div className="mt-2 flex shrink-0 justify-end gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
                <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                  {t("cancelReject")}
                </Button>
                <Button
                  onClick={() => void handleReject()}
                  disabled={actionLoadingBookingId === rejectTarget.booking.id}
                >
                  {t("confirmReject")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
}
