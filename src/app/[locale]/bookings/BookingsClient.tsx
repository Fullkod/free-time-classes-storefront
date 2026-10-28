"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  ArrowRight,
  ChevronRight,
  Loader2,
  Sparkles,
  Video,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/ds/Avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StudentSidebarNav } from "@/components/ds/StudentSidebarNav";
import { useAuth } from "@/context/UserContext";
import { useTranslations } from "@/i18n/translations";
import { isLessonInPast } from "@/lib/datetime/lessonTime";
import { isPendingExpired } from "@/lib/bookings/pendingExpiry";
import {
  lessonTimestampToDate,
  lessonTimestampToEpoch,
  useViewerTimeZone,
} from "@/lib/datetime/viewerTime";
import {
  STUDENT_CANCEL_HOURS,
  canStudentCancelConfirmed,
} from "@/lib/bookings/cancellationPolicy";
import { createClient } from "@/lib/supabase/client";
import { getPublicUrl } from "@/lib/supabase/storage";
import { cn } from "@/lib/utils";

type BookingStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "completed"
  | "expired";

interface Booking {
  id: number;
  student_id: string;
  tutor_id: string;
  lesson_id?: number | null;
  status: BookingStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Custom requests have no lesson until the tutor confirms them.
  requested_scheduled_date_time?: string | null;
  requested_duration_minutes?: number | null;
  requested_subject?: { name: string } | null;
  course?: { title: string } | null;
  tutor?: { id: string; user?: PersonUser | null } | null;
  student?: { id: string; user?: PersonUser | null } | null;
  lesson?: {
    id: number;
    scheduled_date_time: string;
    duration_minutes: number;
    price: number;
    status: string;
    meet_link?: string | null;
    subject?: { name: string } | null;
  } | null;
}

type PersonUser = {
  id: string;
  username: string | null;
  profile_picture?: string | null;
};

function bookingStart(b: Booking): string | null {
  return b.lesson?.scheduled_date_time ?? b.requested_scheduled_date_time ?? null;
}

// F014: a pending request past its deadline is shown as expired even before
// the server sweep stores it.
function withExpiry(b: Booking): Booking {
  return b.status === "pending" &&
    isPendingExpired({ created_at: b.created_at, start: bookingStart(b) })
    ? { ...b, status: "expired" }
    : b;
}

function bookingSubjectName(b: Booking): string | null {
  return b.course?.title ?? b.lesson?.subject?.name ?? b.requested_subject?.name ?? null;
}

function bookingDuration(b: Booking): number | null {
  return b.lesson?.duration_minutes ?? b.requested_duration_minutes ?? null;
}

const STATUS_LABEL_KEYS: Record<BookingStatus, string> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  rejected: "statusRejected",
  cancelled: "statusCancelled",
  completed: "statusCompleted",
  expired: "statusExpired",
};

type Tab = "upcoming" | "past" | "cancelled";
type ViewRole = "student" | "tutor";

const LIVE_WINDOW_MIN = 30;
// Most recent bookings loaded per view (F091); older history is not shown yet.
const BOOKINGS_LIMIT = 100;

function isStartingSoon(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const target = lessonTimestampToEpoch(iso);
  const diffMin = (target - Date.now()) / 60000;
  return diffMin >= -LIVE_WINDOW_MIN && diffMin <= LIVE_WINDOW_MIN;
}

export default function BookingsClient({ locale }: { locale: string }) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("bookingsPage");
  const timeZone = useViewerTimeZone();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  const supabaseRef = useRef(createClient());
  const isBothRoles = !!user?.is_student && !!user?.is_tutor;
  const [viewRole, setViewRole] = useState<ViewRole | null>(() =>
    user?.is_student ? "student" : user?.is_tutor ? "tutor" : null
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/${locale}/login`);
    }
  }, [authLoading, user, router, locale]);

  useEffect(() => {
    if (user) {
      // Keep the role the user picked; only pick a default once.
      setViewRole((current) =>
        current ?? (user.is_student ? "student" : user.is_tutor ? "tutor" : null)
      );
    }
  }, [user]);

  const fetchBookings = useCallback(async () => {
    if (!user || !viewRole) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = supabaseRef.current;

      if (viewRole === "student") {
        const { data, error: fetchError } = await supabase
          .from("bookings")
          .select(
            `
            id, student_id, tutor_id, lesson_id, course_id, requested_date, status, notes, created_at, updated_at, requested_subject_id, requested_scheduled_date_time, requested_duration_minutes,
            lesson:lessons(
              id, scheduled_date_time, duration_minutes, price, status, meet_link,
              subject:subjects(name)
            ),
            requested_subject:subjects!bookings_requested_subject_id_fkey(name),
            course:courses!bookings_course_id_fkey(title),
            tutor:tutor_profiles!bookings_tutor_id_fkey(
              id,
              user:users!tutor_profiles_id_fkey(id, username, profile_picture)
            )
          `
          )
          .eq("student_id", user.id)
          .order("created_at", { ascending: false })
          .limit(BOOKINGS_LIMIT);

        if (fetchError) throw fetchError;
        setBookings(((data as unknown as Booking[]) ?? []).map(withExpiry));
      } else {
        const { data, error: fetchError } = await supabase
          .from("bookings")
          .select(
            `
            id, student_id, tutor_id, lesson_id, course_id, requested_date, status, notes, created_at, updated_at, requested_subject_id, requested_scheduled_date_time, requested_duration_minutes,
            lesson:lessons(
              id, scheduled_date_time, duration_minutes, price, status, meet_link,
              subject:subjects(name)
            ),
            requested_subject:subjects!bookings_requested_subject_id_fkey(name),
            course:courses!bookings_course_id_fkey(title)
          `
          )
          .eq("tutor_id", user.id)
          .order("created_at", { ascending: false })
          .limit(BOOKINGS_LIMIT);

        if (fetchError) throw fetchError;
        const rows = (data as unknown as Booking[]) ?? [];

        // student_profiles is private to its owner; the public users row of
        // a tutor's own students is readable (migration 039).
        const studentIds = [...new Set(rows.map((b) => b.student_id))];
        const { data: students } = studentIds.length
          ? await supabase
              .from("users")
              .select("id, username, profile_picture")
              .in("id", studentIds)
          : { data: [] as PersonUser[] };
        const byId = new Map(
          ((students ?? []) as PersonUser[]).map((u) => [u.id, u])
        );
        setBookings(
          rows.map((b) => ({
            ...withExpiry(b),
            student: { id: b.student_id, user: byId.get(b.student_id) ?? null },
          }))
        );
      }
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [user, viewRole, t]);

  useEffect(() => {
    if (user) void fetchBookings();
  }, [user, fetchBookings]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchBookings();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchBookings]);

  const upcoming = useMemo(
    () =>
      bookings.filter(
        (b) =>
          (b.status === "pending" || b.status === "confirmed") &&
          !isLessonInPast(bookingStart(b))
      ),
    [bookings]
  );
  const past = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status === "completed" ||
          ((b.status === "pending" || b.status === "confirmed") &&
            isLessonInPast(bookingStart(b)))
      ),
    [bookings]
  );
  const cancelled = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === "cancelled" || b.status === "rejected" || b.status === "expired"
      ),
    [bookings]
  );

  const visible = tab === "upcoming" ? upcoming : tab === "past" ? past : cancelled;

  const liveBooking = useMemo(() => {
    return upcoming.find(
      (b) =>
        b.status === "confirmed" && isStartingSoon(b.lesson?.scheduled_date_time)
    );
  }, [upcoming]);

  // Students cancel; tutors can only reject pending requests (confirmed
  // classes have no tutor-side cancel API yet). Both go through the API so the
  // slot is released and the other party is notified.
  const isTutorView = viewRole === "tutor";

  const handleCancel = async (booking: Booking) => {
    setCancellingId(booking.id);
    try {
      const response = await fetch(
        isTutorView ? "/api/bookings/tutor/respond" : "/api/bookings/student/cancel",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isTutorView
              ? { bookingId: booking.id, action: "reject" }
              : { bookingId: booking.id }
          ),
        }
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);

      setCancelTarget(null);
      toast.success(t(isTutorView ? "rejectSuccess" : "cancelSuccess"));
      await fetchBookings();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      toast.error(message ?? t(isTutorView ? "rejectError" : "cancelError"));
    } finally {
      setCancellingId(null);
    }
  };

  function getPersonName(booking: Booking): string {
    if (viewRole === "student") {
      return booking.tutor?.user?.username || t("tutor");
    }
    return booking.student?.user?.username || t("student");
  }

  function getPersonAvatar(booking: Booking): string | null {
    const pic =
      viewRole === "student"
        ? booking.tutor?.user?.profile_picture
        : booking.student?.user?.profile_picture;
    if (!pic) return null;
    return pic.startsWith("http") ? pic : getPublicUrl("avatars", pic);
  }

  function formatDateTime(iso: string): { date: string; time: string; countdown: string } {
    const d = lessonTimestampToDate(iso);
    const date = d.toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    });
    const time = d.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
    const diffMin = Math.round((d.getTime() - Date.now()) / 60000);
    let countdown = "";
    if (diffMin >= 0) {
      if (diffMin < 60) countdown = t("inMinutes", { minutes: diffMin });
      else if (diffMin < 60 * 24) countdown = t("inHours", { hours: Math.round(diffMin / 60) });
      else countdown = t("inDays", { days: Math.round(diffMin / (60 * 24)) });
    }
    return { date, time, countdown };
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-ft-ink-3" />
      </div>
    );
  }

  if (!user) return null;

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "upcoming", label: t("tabUpcoming") },
    { id: "past", label: t("tabPast") },
    { id: "cancelled", label: t("tabCancelled") },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-md md:max-w-screen-lg lg:max-w-screen-xl lg:px-9 lg:py-8">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <StudentSidebarNav isTutor={user.is_tutor ?? false} />

        <div className="min-w-0">
      <div className="px-5 pt-[18px] md:px-9 md:pt-8 lg:px-0 lg:pt-0">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-ft-ink md:text-[32px]">
          {t("title")}
        </h1>

        {isBothRoles && (
          <div className="mt-4 inline-flex gap-1.5 rounded-full border border-ft-line-soft bg-ft-surface-1 p-1">
            <button
              type="button"
              onClick={() => setViewRole("student")}
              className={cn(
                "rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
                viewRole === "student"
                  ? "bg-ft-paper text-ft-ink shadow-sm"
                  : "text-ft-ink-3 hover:text-ft-ink-2"
              )}
            >
              {t("student")}
            </button>
            <button
              type="button"
              onClick={() => setViewRole("tutor")}
              className={cn(
                "rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
                viewRole === "tutor"
                  ? "bg-ft-paper text-ft-ink shadow-sm"
                  : "text-ft-ink-3 hover:text-ft-ink-2"
              )}
            >
              {t("tutor")}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="mt-3.5 flex gap-1.5 rounded-ft-md border border-ft-line-soft bg-ft-surface-1 p-1">
          {TABS.map((it) => {
            const active = tab === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setTab(it.id)}
                className={cn(
                  "flex-1 rounded-ft-sm border-none px-0 py-2.5 text-[13px] font-semibold transition-colors",
                  active
                    ? "bg-ft-paper text-ft-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    : "bg-transparent text-ft-ink-3 hover:text-ft-ink-2"
                )}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3.5 md:px-9 lg:px-0 lg:py-4">
        {/* Live banner */}
        {tab === "upcoming" && liveBooking && (
          <div
            className="mb-3.5 flex items-center gap-3 rounded-ft-base p-3.5"
            style={{
              background: "linear-gradient(135deg, var(--ft-accent) 0%, #B89B5E 100%)",
              color: "#1a1410",
            }}
          >
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#1a1410] text-ft-accent">
              <Sparkles width={16} height={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-85">
                {t("liveStartingSoon")}
              </div>
              <div className="text-[14px] font-semibold tracking-tight">
                {liveBooking.lesson?.subject?.name ?? t("lesson")} ·{" "}
                {liveBooking.lesson
                  ? formatDateTime(liveBooking.lesson.scheduled_date_time).time
                  : ""}
              </div>
            </div>
            {liveBooking.lesson?.meet_link ? (
              <a
                href={liveBooking.lesson.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1a1410] px-3.5 py-2 text-[12px] font-semibold text-ft-paper"
              >
                {t("joinClass")}
                <ArrowRight width={12} height={12} />
              </a>
            ) : null}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[130px] animate-pulse rounded-ft-lg border border-ft-line-soft bg-ft-paper-deep"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-ft-lg border border-red-200 bg-red-50/60 p-4 text-[13px] text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void fetchBookings()}
              className="mt-3 rounded-full border border-red-300 px-3 py-1.5 text-[12px] font-semibold"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && visible.length === 0 && (
          <div className="rounded-ft-lg border border-dashed border-ft-line bg-ft-paper p-8 text-center md:p-10">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-ft-surface-2">
              <AudioLines width={20} height={20} className="text-ft-accent-deep" />
            </div>
            <p className="text-[15px] font-semibold tracking-tight text-ft-ink">
              {tab === "upcoming"
                ? t("noUpcomingBookings")
                : tab === "past"
                  ? t("noPastBookings")
                  : t("noCancelledBookings")}
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-[13px] text-ft-ink-3">
              {t("noBookingsHint")}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/${locale}/courses`)}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ft-ink px-5 py-2.5 text-[13px] font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
            >
              {t("exploreCourses")}
              <ChevronRight width={13} height={13} />
            </button>
          </div>
        )}

        {/* List */}
        {!loading && !error && visible.length > 0 && (
          <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {visible.map((booking) => {
              const personName = getPersonName(booking);
              const personAvatar = getPersonAvatar(booking);
              const lesson = booking.lesson;
              const startsAt = bookingStart(booking);
              const dateTime = startsAt ? formatDateTime(startsAt) : null;
              const durationMinutes = bookingDuration(booking);
              const cancelWindowClosed =
                !isTutorView &&
                booking.status === "confirmed" &&
                !canStudentCancelConfirmed(lesson?.scheduled_date_time);
              const isCancelable =
                tab === "upcoming" &&
                (booking.status === "pending" ||
                  (!isTutorView && booking.status === "confirmed" && !cancelWindowClosed));

              return (
                <article
                  key={booking.id}
                  className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ft-accent-deep">
                      {dateTime ? `${dateTime.date} · ${dateTime.time}` : t("dateUnknown")}
                    </div>
                    {tab === "upcoming" && dateTime?.countdown && (
                      <div className="text-[11px] text-ft-ink-3">{dateTime.countdown}</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[16px] font-semibold tracking-[-0.02em] text-ft-ink">
                      {bookingSubjectName(booking) ?? t("lesson")}
                    </div>
                    <span
                      className={cn(
                        "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        booking.status === "confirmed" || booking.status === "completed"
                          ? "bg-ft-accent-soft text-ft-accent-deep"
                          : "bg-ft-surface-2 text-ft-ink-2"
                      )}
                    >
                      {t(STATUS_LABEL_KEYS[booking.status])}
                    </span>
                  </div>

                  <div className="mt-3.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {personAvatar ? (
                        <Avatar src={personAvatar} name={personName} size={32} />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-ft-surface-2 text-[12px] font-semibold text-ft-ink-2">
                          {personName[0]?.toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-medium text-ft-ink">
                          {personName}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-ft-ink-3">
                          {durationMinutes
                            ? `${durationMinutes} ${t("minutesShort")}`
                            : null}
                          {lesson?.price != null && (
                            <>
                              <span className="opacity-50">·</span>
                              <span>{lesson.price.toFixed(0)}€</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 gap-1.5">
                      {booking.status === "confirmed" && lesson?.meet_link && (
                        <a
                          href={lesson.meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-ft-sm border border-ft-line bg-ft-paper px-3 py-2 text-[11px] font-semibold text-ft-ink hover:bg-ft-surface-1"
                        >
                          <Video width={12} height={12} />
                          {t("joinClass")}
                        </a>
                      )}
                      {isCancelable && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(booking)}
                          disabled={cancellingId === booking.id}
                          className="inline-flex items-center gap-1 rounded-ft-sm border border-ft-line bg-ft-paper px-3 py-2 text-[11px] font-semibold text-ft-ink-2 hover:bg-ft-surface-1 disabled:opacity-60"
                        >
                          {cancellingId === booking.id ? (
                            <Loader2 width={12} height={12} className="animate-spin" />
                          ) : (
                            <XCircle width={12} height={12} />
                          )}
                          {t(isTutorView ? "rejectBooking" : "cancelBooking")}
                        </button>
                      )}
                      {tab === "upcoming" && cancelWindowClosed && (
                        <span className="text-[11px] text-ft-ink-3">
                          {t("cancelWindowClosed", { hours: STUDENT_CANCEL_HOURS })}
                        </span>
                      )}
                    </div>
                  </div>

                  {booking.notes && (
                    <p className="mt-3 line-clamp-2 rounded-ft border border-ft-line-soft bg-ft-surface-1 px-3 py-2 text-[11px] text-ft-ink-2">
                      {booking.notes}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
        </div>
      </div>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && cancellingId === null) setCancelTarget(null);
        }}
      >
        {/* Portaled outside FreetimeShell: re-apply the FreeTime theme tokens. */}
        <DialogContent
          data-theme="freetime"
          className="rounded-ft-lg border-ft-line bg-ft-paper text-ft-ink sm:max-w-[420px] sm:rounded-ft-lg"
        >
          <DialogHeader>
            <DialogTitle>
              {t(isTutorView ? "rejectConfirmTitle" : "cancelConfirmTitle")}
            </DialogTitle>
            <DialogDescription className="text-ft-ink-2">
              {t(isTutorView ? "rejectConfirmBody" : "cancelConfirmBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              disabled={cancellingId !== null}
              className="inline-flex items-center justify-center rounded-ft-sm border border-ft-line bg-ft-paper px-4 py-2 text-[12px] font-semibold text-ft-ink-2 hover:bg-ft-surface-1 disabled:opacity-60"
            >
              {t("keepBooking")}
            </button>
            <button
              type="button"
              onClick={() => cancelTarget && void handleCancel(cancelTarget)}
              disabled={cancellingId !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-ft-sm bg-ft-ink px-4 py-2 text-[12px] font-semibold text-ft-paper hover:opacity-90 disabled:opacity-60"
            >
              {cancellingId !== null && (
                <Loader2 width={12} height={12} className="animate-spin" />
              )}
              {t(isTutorView ? "rejectBooking" : "cancelBooking")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
