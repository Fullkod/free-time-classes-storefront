/**
 * Builds the WhatsApp text body for a notification.
 *
 * The in-app notification's title/body are reused as the base, and we
 * enrich it per type with the scheduled time and the Meet link when present.
 *
 * IMPORTANT (project rule): `scheduled_date_time` is already a wall-clock
 * Madrid string (`YYYY-MM-DDThh:mm:ss`). We parse its parts directly — we do
 * NOT build a `Date`, which would reinterpret it against the server timezone.
 */
import type { NotificationType } from "@/types/notification";
import { BUSINESS_TIMEZONE } from "@/lib/datetime/lessonTime";
import { convertWallClock } from "@/lib/datetime/zonedTime";

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * "2026-06-15T14:30:00" → "15 de junio · 14:30" (Madrid wall-clock). With
 * `timeZone` (PRP-002, tutor recipients) the time is converted to that zone
 * and labelled: "15 de junio · 08:30 (hora de Havana)".
 */
function formatLessonTime(value: unknown, timeZone?: string): string | null {
  if (typeof value !== "string") return null;
  const wall = timeZone
    ? convertWallClock(value.replace(" ", "T").slice(0, 19), BUSINESS_TIMEZONE, timeZone)
    : value.replace(" ", "T");
  const m = wall ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall) : null;
  if (!m) return null;
  const [, , month, day, hour, minute] = m;
  const monthName = MONTHS_ES[Number(month) - 1] ?? month;
  const zone = timeZone ? ` (hora de ${timeZone.split("/").pop()?.replace(/_/g, " ")})` : "";
  return `${Number(day)} de ${monthName} · ${hour}:${minute}${zone}`;
}

export function buildWhatsAppMessage(params: {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Recipient's agenda zone (tutors only); students keep Madrid time. */
  timeZone?: string;
}): string {
  const { type, title, body, data = {}, timeZone } = params;

  const lines: string[] = [`*${title}*`, body];

  const when = formatLessonTime(data.scheduled_date_time, timeZone);
  if (when) lines.push(`🗓️ ${when}`);

  const meetLink = typeof data.meet_link === "string" ? data.meet_link.trim() : "";
  if (type === "booking_confirmed" && meetLink) {
    lines.push(`🔗 ${meetLink}`);
  }

  // For requests the tutor can act on by replying to this WhatsApp, spell out
  // how to confirm or reject. (In-app these use buttons, so it's WhatsApp-only.)
  if (type === "booking_request" || type === "booking_custom_request") {
    lines.push(
      "",
      "Responde a este mensaje para gestionarla:",
      "✅ *SÍ* (o _ok_, _vale_, _confirmar_) para aceptar.",
      "❌ *NO* (o _cancelar_, _rechazar_) para rechazar.",
    );
  }

  lines.push("", "_FreeTime Classes_");

  return lines.filter((l) => l !== undefined).join("\n");
}
