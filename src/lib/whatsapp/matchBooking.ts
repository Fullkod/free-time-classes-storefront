import type { SupabaseClient } from "@supabase/supabase-js";
import { expirePendingBookings } from "@/lib/bookings/expirePending";

export type PendingForReply = {
  bookingId: number;
  /** Madrid wall-clock of the class (requested time for custom requests). */
  scheduledDateTime: string | null;
};

/**
 * Resolve which tutor an inbound WhatsApp reply comes from, and their pending
 * bookings (oldest first), so the caller can pick one by code (F071).
 *
 * WhatsApp reports the sender as an `@lid` (an anonymous Linked ID) that is
 * NOT the phone number we sent to. We can't match it against `users.phone`.
 * Instead we match `from` against the delivered `message_id` of our outbound
 * messages (the id contains the delivered chatId — guide §5.4), and fall back
 * to the stored `chat_id` digit suffix when the reply comes as `@c.us`. The
 * tutor is the recipient of the most recent matching booking message.
 */
export async function matchTutorPendingBookings(
  admin: SupabaseClient,
  from: string,
): Promise<{ tutorId: string; pending: PendingForReply[] } | null> {
  const fromTrimmed = (from ?? "").trim();
  if (!fromTrimmed) return null;

  // The bare identifier without the @c.us / @lid suffix.
  const bareId = fromTrimmed.replace(/@(c\.us|lid|s\.whatsapp\.net)$/i, "");
  // Only numeric ids are valid; this also keeps LIKE wildcards and PostgREST
  // filter syntax out of the `.or()` below.
  if (!/^\d+$/.test(bareId)) return null;

  // Only request messages count: a student replying "ok" to a confirmation
  // must not be taken for a tutor.
  const { data: rows, error } = await admin
    .from("wa_messages")
    .select("user_id, notification:notifications!inner(type)")
    .eq("direction", "outbound")
    .not("booking_id", "is", null)
    .in("notification.type", ["booking_request", "booking_custom_request"])
    .or(`message_id.ilike.%${bareId}%,chat_id.ilike.%${bareId}@c.us`)
    .order("created_at", { ascending: false })
    .limit(1);

  const tutorId = !error ? (rows?.[0]?.user_id as string | undefined) : undefined;
  if (!tutorId) return null;

  // Stale requests must not count as pending (nor be confirmed by mistake).
  await expirePendingBookings(admin, { tutorId });

  const { data: bookings, error: bookingsError } = await admin
    .from("bookings")
    .select("id, requested_scheduled_date_time, lesson:lessons(scheduled_date_time)")
    .eq("tutor_id", tutorId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (bookingsError) return null;

  const pending = (bookings ?? []).map((b) => {
    const lesson = (Array.isArray(b.lesson) ? b.lesson[0] : b.lesson) as
      | { scheduled_date_time?: string | null }
      | null;
    return {
      bookingId: b.id as number,
      scheduledDateTime:
        (b.requested_scheduled_date_time as string | null) ?? lesson?.scheduled_date_time ?? null,
    };
  });
  return { tutorId, pending };
}
