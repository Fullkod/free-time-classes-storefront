/**
 * Wall-clock ↔ instant conversion for any IANA zone (PRP-002), with `Intl`
 * only. Wall-clock values are `YYYY-MM-DDTHH:mm:ss` without offset, like the
 * Madrid lesson timestamps in lessonTime.ts. Safe on server and client.
 */

export const DEFAULT_AGENDA_TIMEZONE = "Europe/Madrid";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Zone to use for a stored value: the value if valid, else Madrid. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_AGENDA_TIMEZONE;
}

/** Wall-clock (`YYYY-MM-DDTHH:mm:ss`) of an instant in `timeZone`. */
export function epochToWallClock(epochMs: number, timeZone: string): string {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

function wallAsUtcMs(wallClock: string): number {
  const [datePart, timePart = "00:00:00"] = wallClock.replace(" ", "T").slice(0, 19).split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, s = 0] = timePart.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

function offsetMs(epochMs: number, timeZone: string): number {
  return wallAsUtcMs(epochToWallClock(epochMs, timeZone)) - Math.floor(epochMs / 1000) * 1000;
}

/**
 * Instant of a wall-clock time in `timeZone`. Returns null for times that do
 * not exist (spring-forward gap); an ambiguous time (fall back) resolves to
 * its first occurrence.
 */
export function wallClockToEpoch(wallClock: string, timeZone: string): number | null {
  const wall = wallAsUtcMs(wallClock);
  const normalized = wallClock.replace(" ", "T").slice(0, 19);
  const target = normalized.length === 16 ? `${normalized}:00` : normalized;
  const day = 12 * 60 * 60 * 1000;
  const candidates = [wall - offsetMs(wall - day, timeZone), wall - offsetMs(wall + day, timeZone)]
    .filter((epoch) => epochToWallClock(epoch, timeZone) === target)
    .sort((a, b) => a - b);
  return candidates[0] ?? null;
}

/** Converts a wall-clock time between zones (null when it does not exist). */
export function convertWallClock(wallClock: string, fromZone: string, toZone: string): string | null {
  const epoch = wallClockToEpoch(wallClock, fromZone);
  return epoch == null ? null : epochToWallClock(epoch, toZone);
}
