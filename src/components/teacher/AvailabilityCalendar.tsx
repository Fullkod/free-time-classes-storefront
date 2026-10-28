"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FT_BTN_OUTLINE, FT_BTN_PRIMARY } from "@/components/teacher/ftStyles";
import { useAuth } from "@/context/UserContext";
import { useLocale, useTranslations } from "@/i18n/translations";
import {
  deleteLesson,
  getLessonWithRelations,
} from "@/lib/supabase/queries/lessons";
import { createClient } from "@/lib/supabase/client";
import { BUSINESS_TIMEZONE } from "@/lib/datetime/lessonTime";
import { epochToWallClock, wallClockToEpoch } from "@/lib/datetime/zonedTime";
import { formatLessonTimestamp } from "@/lib/datetime/viewerTime";
import type { LessonWithRelations } from "@/types/lesson";
import { DateSelectArg, DatesSetArg, EventClickArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
});

const AddAvailabilityModal = dynamic(
  () => import("@/components/teacher/AddAvailabilityModal"),
  { ssr: false }
);

const ConfirmActionDialog = dynamic(
  () => import("@/components/common/ConfirmActionDialog"),
  { ssr: false }
);

// PRP-002: FullCalendar runs with timeZone="UTC" and receives wall-clock
// strings that are already in the tutor's zone, so every Date it hands back
// (range, selection) carries the tutor's wall-clock in its UTC fields.
interface Event {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  /** "background" for availability windows and blocks (not clickable). */
  display?: "background";
}

type WindowRule = { day_of_week: number; start_time: string; end_time: string };
type WindowException = {
  exception_date: string;
  start_time: string | null;
  end_time: string | null;
  type: "blocked" | "extra";
};

const WINDOW_COLOR = "#BBF7D0";
const BLOCK_COLOR = "#FECACA";

const wallDateKey = (d: Date) => d.toISOString().slice(0, 10);
const atTime = (dateKey: string, time: string) => `${dateKey}T${time.slice(0, 5)}:00`;
/** Instant (ISO) of a calendar Date whose UTC fields hold tutor wall-clock. */
const calendarDateToIso = (d: Date, timeZone: string) =>
  new Date(wallClockToEpoch(d.toISOString().slice(0, 19), timeZone) ?? d.getTime()).toISOString();

/**
 * Background events for the tutor's weekly windows and extras (green) and
 * blocks (red) in the visible range. Courses are booked inside the green
 * areas; open times are computed on the server (PRP-001).
 */
function windowBackgroundEvents(
  rules: WindowRule[],
  exceptions: WindowException[],
  start: Date,
  end: Date
): Event[] {
  const out: Event[] = [];
  for (const d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = wallDateKey(d);
    const dayExceptions = exceptions.filter((e) => e.exception_date === key);
    const fullDayBlock = dayExceptions.some(
      (e) => e.type === "blocked" && (e.start_time == null || e.end_time == null)
    );
    const windows = fullDayBlock
      ? []
      : [
          ...rules.filter((r) => r.day_of_week === d.getUTCDay()),
          ...dayExceptions.filter((e) => e.type === "extra" && e.start_time && e.end_time),
        ];
    windows.forEach((w, i) =>
      out.push({
        id: `window-${key}-${i}`,
        title: "",
        start: atTime(key, w.start_time as string),
        end: atTime(key, w.end_time as string),
        backgroundColor: WINDOW_COLOR,
        display: "background",
      })
    );
    dayExceptions
      .filter((e) => e.type === "blocked")
      .forEach((e, i) =>
        out.push({
          id: `block-${key}-${i}`,
          title: "",
          start: e.start_time ? atTime(key, e.start_time) : atTime(key, "00:00"),
          end: e.end_time ? atTime(key, e.end_time) : atTime(key, "23:59"),
          backgroundColor: BLOCK_COLOR,
          display: "background",
        })
      );
  }
  return out;
}

type CalendarApiItem = {
  lessonId: number;
  subjectName: string | null;
  scheduledDateTime: string | null;
  durationMinutes: number;
  price: number;
  lessonStatus: string;
  bookingStatus: string | null;
};

const STATUS_COLORS = {
  available: "#4CAF50",
  requested: "#F59E0B",
  confirmed: "#2563EB",
  fallback: "#6B7280",
};

interface AvailabilityCalendarProps {
  /** Increment to refetch events after bulk availability changes */
  refreshKey?: number;
  /** Zone the agenda is shown in (PRP-002). */
  tutorTimeZone: string;
}

export default function AvailabilityCalendar({
  refreshKey,
  tutorTimeZone,
}: AvailabilityCalendarProps) {
  const locale = useLocale();
  const t = useTranslations("teacherProfile");
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [selectedLesson, setSelectedLesson] =
    useState<LessonWithRelations | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const { user } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedWallClock, setSelectedWallClock] = useState<string | undefined>();
  const [currentRange, setCurrentRange] = useState<{ start: Date; end: Date } | null>(
    null
  );

  const loadCalendarEvents = useCallback(
    async (start: Date, end: Date, signal?: AbortSignal) => {
      try {
        setCalendarLoading(true);
        const params = new URLSearchParams({
          start: calendarDateToIso(start, tutorTimeZone),
          end: calendarDateToIso(end, tutorTimeZone),
        });
        const response = await fetch(
          `/api/bookings/tutor/calendar?${params}`,
          { signal }
        );
        const result = (await response.json()) as {
          error?: string;
          items?: CalendarApiItem[];
        };

        if (!response.ok) {
          throw new Error(result.error || "Failed to load calendar events");
        }

        const items = result.items || [];
        const lessonEvents = items
          .filter((item) => item.scheduledDateTime)
          .map((item) => {
            const statusKey =
              item.bookingStatus === "pending"
                ? "requested"
                : item.bookingStatus === "confirmed"
                  ? "confirmed"
                  : item.lessonStatus === "available"
                    ? "available"
                    : "fallback";

            // Lessons are Madrid wall-clock: show them in the tutor's zone.
            const startMs =
              wallClockToEpoch(
                item.scheduledDateTime!.replace(" ", "T").slice(0, 19),
                BUSINESS_TIMEZONE
              ) ?? 0;
            return {
              id: String(item.lessonId),
              title: `${item.subjectName || ""} · ${item.price}€`,
              start: epochToWallClock(startMs, tutorTimeZone),
              end: epochToWallClock(startMs + item.durationMinutes * 60000, tutorTimeZone),
              backgroundColor:
                STATUS_COLORS[statusKey as keyof typeof STATUS_COLORS] ||
                STATUS_COLORS.fallback,
            } satisfies Event;
          });

        let backgroundEvents: Event[] = [];
        if (user?.id) {
          const supabase = createClient();
          const [rulesRes, exRes] = await Promise.all([
            supabase
              .from("tutor_availability")
              .select("day_of_week, start_time, end_time")
              .eq("tutor_id", user.id)
              .eq("is_active", true),
            supabase
              .from("availability_exceptions")
              .select("exception_date, start_time, end_time, type")
              .eq("tutor_id", user.id)
              .gte("exception_date", wallDateKey(start))
              .lte("exception_date", wallDateKey(end)),
          ]);
          backgroundEvents = windowBackgroundEvents(
            (rulesRes.data ?? []) as WindowRule[],
            (exRes.data ?? []) as WindowException[],
            start,
            end
          );
        }

        if (signal?.aborted) return;
        setEvents([...backgroundEvents, ...lessonEvents]);
      } catch (error) {
        if (signal?.aborted) return;
        console.error("Error loading calendar events:", error);
        setEvents([]);
      } finally {
        if (!signal?.aborted) setCalendarLoading(false);
      }
    },
    [user?.id, tutorTimeZone]
  );

  // Stable identity: a new function each render makes FullCalendar reset its
  // view and fire datesSet again (update loop).
  const calendarNow = useCallback(
    // A Date whose UTC fields hold the tutor's wall-clock (timeZone="UTC").
    () => new Date(`${epochToWallClock(Date.now(), tutorTimeZone)}Z`),
    [tutorTimeZone]
  );

  const handleDatesSet = (arg: DatesSetArg) => {
    setCurrentRange({ start: arg.start, end: arg.end });
  };

  // Single fetch per visible range / refresh; a newer range aborts the old one (F046).
  useEffect(() => {
    if (!currentRange || !user?.id) return;
    const controller = new AbortController();
    void loadCalendarEvents(currentRange.start, currentRange.end, controller.signal);
    return () => controller.abort();
  }, [refreshKey, currentRange, user?.id, loadCalendarEvents]);

  // Load selected lesson when selectedLessonId changes
  useEffect(() => {
    async function loadLesson() {
      if (!selectedLessonId) {
        setSelectedLesson(null);
        return;
      }

      try {
        setLessonLoading(true);
        const lesson = await getLessonWithRelations(selectedLessonId);
        setSelectedLesson(lesson);
      } catch (error) {
        console.error("Error loading lesson:", error);
        setSelectedLesson(null);
      } finally {
        setLessonLoading(false);
      }
    }

    loadLesson();
  }, [selectedLessonId]);

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    const calendarApi = selectInfo.view.calendar;
    calendarApi.unselect();

    // Open the add availability modal with the selected (tutor) wall-clock
    setSelectedWallClock(selectInfo.start.toISOString().slice(0, 16));
    setShowAddModal(true);
  };

  const handleAddAvailabilitySuccess = () => {
    if (currentRange) {
      void loadCalendarEvents(currentRange.start, currentRange.end);
    }
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const lessonId = parseInt(clickInfo.event.id, 10);
    if (!isNaN(lessonId)) {
      setSelectedLessonId(lessonId);
    }
  };

  const handleCloseDialog = () => {
    setSelectedLessonId(null);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirmation(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedLessonId) return;

    try {
      setDeleteLoading(true);
      await deleteLesson(selectedLessonId);

      // Remove the event from the calendar
      setEvents(
        events.filter((event) => event.id !== String(selectedLessonId))
      );
      // Close both dialogs
      handleCloseDialog();
      setShowDeleteConfirmation(false);
      // Refresh the lessons list
      if (currentRange) {
        await loadCalendarEvents(currentRange.start, currentRange.end);
      }
    } catch (error) {
      console.error("Error deleting lesson:", error);
      // You might want to show an error message to the user here
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Card className="rounded-ft-2xl border-ft-line bg-ft-paper shadow-none">
      <CardHeader>
        <CardTitle className="text-ft-ink">{t("availability")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-2">
          <Button
            className={FT_BTN_PRIMARY}
            onClick={() => setShowAddModal(true)}
          >
            {t("addAvailability")}
          </Button>
        </div>
        <div className="mb-4 flex flex-wrap gap-3 text-xs text-ft-ink-2">
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: STATUS_COLORS.available }}
            />
            <span>{t("calendarStatus.available")}</span>
          </div>
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: STATUS_COLORS.requested }}
            />
            <span>{t("calendarStatus.requested")}</span>
          </div>
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: STATUS_COLORS.confirmed }}
            />
            <span>{t("calendarStatus.confirmed")}</span>
          </div>
        </div>
        <p className="mb-3 text-xs text-ft-ink-3">
          {t("calendarGenerationHint")}
        </p>
        <div className="ft-calendar relative h-[600px]">
          {calendarLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-ft bg-ft-paper/70 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-ft border border-ft-line bg-ft-paper px-3 py-2 text-sm text-ft-ink-2 shadow-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-ft-accent border-t-transparent" />
                <span>{t("calendarLoading")}</span>
              </div>
            </div>
          )}
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            buttonText={{
              today: t("calendar.today"),
              month: t("calendar.month"),
              week: t("calendar.week"),
              day: t("calendar.day"),
              list: t("calendar.list"),
              prev: t("calendar.previous"),
              next: t("calendar.next"),
              more: t("calendar.more"),
            }}
            noEventsText={t("calendar.noEvents")}
            initialView="timeGridWeek"
            editable={true}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            weekends={true}
            events={events}
            timeZone="UTC"
            now={calendarNow}
            select={handleDateSelect}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            slotMinTime="08:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={false}
            height="100%"
            locale={locale}
            slotDuration="01:00:00"
            expandRows={true}
            stickyHeaderDates={true}
            nowIndicator={true}
            businessHours={{
              daysOfWeek: [1, 2, 3, 4, 5],
              startTime: "08:00",
              endTime: "20:00",
            }}
          />
        </div>
      </CardContent>
      <Dialog open={!!selectedLessonId} onOpenChange={handleCloseDialog}>
        <DialogContent
          data-theme="freetime"
          className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden border-ft-line bg-ft-paper p-0 text-ft-ink sm:max-w-[525px] sm:rounded-ft-2xl"
        >
          <DialogHeader className="px-4 pt-6 sm:px-6">
            <DialogTitle className="text-[20px] font-semibold tracking-[-0.02em] text-ft-ink">
              {t("lessonDetails")}
            </DialogTitle>
          </DialogHeader>
          {lessonLoading ? (
            <div className="min-h-0 flex-1 px-4 pb-4 pt-1 sm:px-6">
              <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ft-accent"></div>
            </div>
            </div>
          ) : selectedLesson ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1 sm:px-6">
              <div className="space-y-4">
              {selectedLesson.tutor?.user && (
                <div>
                  <h3 className="font-semibold text-ft-ink">
                    {t("tutor")} {selectedLesson.tutor.user.username}
                  </h3>
                </div>
              )}
              {selectedLesson.subject && (
                <>
                  <div>
                    <h3 className="font-semibold text-ft-ink">
                      {selectedLesson.subject.name}
                    </h3>
                    {selectedLesson.subject.language && (
                      <p className="text-sm text-ft-ink-3">
                        {selectedLesson.subject.language.name}
                        {selectedLesson.subject.language.level &&
                          ` - ${selectedLesson.subject.language.level}`}
                      </p>
                    )}
                  </div>

                  {selectedLesson.subject.description && (
                    <div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm text-ft-ink-2">
                            {selectedLesson.subject.description}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-sm">{t("description")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                {selectedLesson.scheduled_date_time && (
                  <div>
                    <p className="text-sm font-medium text-ft-ink">
                      {t("date")}
                    </p>
                    <p className="text-sm text-ft-ink-2">
                      {formatLessonTimestamp(
                        selectedLesson.scheduled_date_time,
                        locale,
                        tutorTimeZone,
                        { dateStyle: "medium", timeStyle: "short" }
                      )}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-ft-ink">
                    {t("duration")}
                  </p>
                  <p className="text-sm text-ft-ink-2">
                    {selectedLesson.duration_minutes} {t("minutes")}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-ft-ink">
                    {t("price")}
                  </p>
                  <p className="text-sm text-ft-ink-2">{selectedLesson.price}€</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-ft-ink">
                    {t("status")}
                  </p>
                  <p className="text-sm text-ft-ink-2">{t(selectedLesson.status)}</p>
                </div>
              </div>
              {user?.id === selectedLesson.tutor?.user?.id && (
                <div className="mt-2 flex justify-end gap-2 border-t border-ft-line pt-3">
                  <Button
                    variant="outline"
                    className={FT_BTN_OUTLINE}
                    onClick={handleDeleteClick}
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? t("deleting") : t("delete")}
                  </Button>
                  <Button className={FT_BTN_PRIMARY}>
                    {t("edit")}
                  </Button>
                </div>
              )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={showDeleteConfirmation}
        onOpenChange={setShowDeleteConfirmation}
        title={t("confirmDelete")}
        description={t("confirmDeleteMessage")}
        cancelLabel={t("cancel")}
        confirmLabel={deleteLoading ? t("deleting") : t("confirm")}
        loading={deleteLoading}
        onCancel={() => setShowDeleteConfirmation(false)}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        contentClassName="sm:max-w-[425px]"
      />

      {/* Add Availability Modal */}
      <AddAvailabilityModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSelectedWallClock(undefined);
        }}
        onSuccess={handleAddAvailabilitySuccess}
        initialWallClock={selectedWallClock}
        tutorTimeZone={tutorTimeZone}
      />
    </Card>
  );
}
