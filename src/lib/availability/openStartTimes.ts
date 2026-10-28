import { BUSINESS_TIMEZONE } from "@/lib/datetime/lessonTime";
import { epochToWallClock, wallClockToEpoch } from "@/lib/datetime/zonedTime";

/**
 * Open start times for a course (PRP-001): the tutor's weekly windows plus
 * "extra" windows, minus "blocked" exceptions and already committed classes,
 * keeping only starts on the grid where the whole course duration fits.
 *
 * PRP-002: rules and exceptions are wall-clock in the tutor's zone; busy
 * classes, `minStart`, the date range and the output are Madrid wall-clock.
 * Windows are expanded per tutor date (so each country's DST applies) and
 * compared as instants; the server timezone never leaks in (F087).
 */

/** Minutes between two consecutive bookable start times. */
export const START_GRID_MINUTES = 30;

/** How far ahead a class can be booked (product decision 2026-10-20). */
export const BOOKING_HORIZON_WEEKS = 8;

export type AvailabilityWindowRule = {
  day_of_week: number; // 0 = Sunday … 6 = Saturday
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export type AvailabilityWindowException = {
  exception_date: string;
  start_time: string | null;
  end_time: string | null;
  type: "blocked" | "extra";
};

export type BusyInterval = {
  scheduled_date_time: string;
  duration_minutes: number;
};

export type OpenStartTimesInput = {
  rules: AvailabilityWindowRule[];
  exceptions: AvailabilityWindowException[];
  busy: BusyInterval[];
  durationMinutes: number;
  /** First and last day to return, inclusive (`YYYY-MM-DD`, Madrid). */
  fromDate: string;
  toDate: string;
  /** Earliest allowed start (`YYYY-MM-DDTHH:mm:ss`), e.g. now + minimum lead. */
  minStart: string;
  gridMinutes?: number;
  /** IANA zone of the tutor's agenda (rules and exceptions). Default Madrid. */
  tutorTimeZone?: string;
};

const DAY_MINUTES = 24 * 60;

function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function dateKeyFromDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function wallClock(day: number, minutes: number): string {
  const extraDays = Math.floor(minutes / DAY_MINUTES);
  const rest = minutes - extraDays * DAY_MINUTES;
  const hh = String(Math.floor(rest / 60)).padStart(2, "0");
  const mm = String(rest % 60).padStart(2, "0");
  return `${dateKeyFromDayNumber(day + extraDays)}T${hh}:${mm}:00`;
}

export function computeOpenStartTimes(input: OpenStartTimesInput): string[] {
  const grid = input.gridMinutes ?? START_GRID_MINUTES;
  const duration = input.durationMinutes;
  if (!(duration > 0) || !(grid > 0)) return [];
  const tutorZone = input.tutorTimeZone ?? BUSINESS_TIMEZONE;
  const toEpoch = (ts: string, zone: string) => wallClockToEpoch(ts.replace(" ", "T"), zone);
  const durationMs = duration * 60_000;

  const minStart = toEpoch(input.minStart, BUSINESS_TIMEZONE) ?? 0;
  const busy = input.busy.flatMap((b) => {
    const start = toEpoch(b.scheduled_date_time, BUSINESS_TIMEZONE);
    return start == null ? [] : [{ start, end: start + (b.duration_minutes ?? 0) * 60_000 }];
  });

  const out = new Set<string>();
  // A tutor date can map onto the previous or next Madrid date.
  const firstDay = dayNumber(input.fromDate) - 1;
  const lastDay = dayNumber(input.toDate) + 1;

  for (let day = firstDay; day <= lastDay; day++) {
    const dateKey = dateKeyFromDayNumber(day);
    // 1970-01-01 (day 0) was a Thursday.
    const dow = (((day + 4) % 7) + 7) % 7;

    const exceptions = input.exceptions.filter((e) => e.exception_date === dateKey);
    const blocks = exceptions.filter((e) => e.type === "blocked");
    if (blocks.some((b) => b.start_time == null || b.end_time == null)) continue;

    const windows: Array<{ start: number; end: number }> = [
      ...input.rules
        .filter((r) => r.is_active && r.day_of_week === dow)
        .map((r) => ({ start: timeToMinutes(r.start_time), end: timeToMinutes(r.end_time) })),
      ...exceptions
        .filter((e) => e.type === "extra" && e.start_time && e.end_time)
        .map((e) => ({
          start: timeToMinutes(e.start_time as string),
          end: timeToMinutes(e.end_time as string),
        })),
    ];
    const blocked = blocks.flatMap((b) => {
      const start = toEpoch(wallClock(day, timeToMinutes(b.start_time as string)), tutorZone);
      const end = toEpoch(wallClock(day, timeToMinutes(b.end_time as string)), tutorZone);
      return start == null || end == null ? [] : [{ start, end }];
    });

    for (const w of windows) {
      const firstStart = Math.ceil(w.start / grid) * grid;
      for (let m = firstStart; m + duration <= w.end; m += grid) {
        // Starts in the spring-forward gap do not exist: skip them.
        const start = toEpoch(wallClock(day, m), tutorZone);
        if (start == null) continue;
        const end = start + durationMs;
        if (start < minStart) continue;
        if (blocked.some((b) => start < b.end && end > b.start)) continue;
        if (busy.some((b) => start < b.end && end > b.start)) continue;
        const madrid = epochToWallClock(start, BUSINESS_TIMEZONE);
        const madridDate = madrid.slice(0, 10);
        if (madridDate < input.fromDate || madridDate > input.toDate) continue;
        out.add(madrid);
      }
    }
  }

  return [...out].sort();
}
