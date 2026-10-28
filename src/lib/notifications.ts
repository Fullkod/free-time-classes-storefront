import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/types/notification";
import { isOpenWaConfigured, phoneToChatId, sendText } from "@/lib/whatsapp/openwa";
import { buildWhatsAppMessage } from "@/lib/whatsapp/messages";
import { loadTutorTimeZone } from "@/lib/availability/tutorTimeZone";

/** Notifications addressed to the tutor: their times go in the tutor's zone (PRP-002). */
const TUTOR_RECIPIENT_TYPES: ReadonlySet<NotificationType> = new Set([
  "booking_request",
  "booking_custom_request",
  "booking_cancelled",
]);

/**
 * Insert a notification using a Supabase admin client (service role).
 * Call this from API routes after booking events.
 *
 * After the in-app row is stored, the same notification is mirrored to
 * WhatsApp (best-effort) for users who provided a phone and opted in.
 */
export async function insertNotification(
  admin: SupabaseClient,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  const row = {
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data ?? {},
  };

  console.log("[insertNotification] inserting:", JSON.stringify(row));

  const { data, error } = await admin
    .from("notifications")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[insertNotification] FAILED:", error.code, error.message, error.details);
    return;
  }

  console.log("[insertNotification] OK, id:", data?.id);

  // Best-effort WhatsApp mirror. Never let a WhatsApp failure break the
  // in-app notification or the calling API route: run it after the
  // response is sent when we are inside a request.
  const send = () =>
    sendWhatsAppNotification(admin, {
      ...params,
      notificationId: data?.id ?? null,
    });

  try {
    after(send);
  } catch {
    // Outside a request scope (scripts): send inline.
    await send();
  }
}

async function sendWhatsAppNotification(
  admin: SupabaseClient,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    notificationId: number | null;
  },
): Promise<void> {
  if (!isOpenWaConfigured()) return;

  try {
    const { data: recipient, error } = await admin
      .from("users")
      .select("phone, receive_whatsapp_notifications")
      .eq("id", params.userId)
      .single();

    if (error || !recipient) return;
    if (!recipient.receive_whatsapp_notifications) return;

    const phone = typeof recipient.phone === "string" ? recipient.phone.trim() : "";
    if (!phone) return;

    const chatId = phoneToChatId(phone);
    const text = buildWhatsAppMessage({
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
      timeZone: TUTOR_RECIPIENT_TYPES.has(params.type)
        ? await loadTutorTimeZone(admin, params.userId)
        : undefined,
    });

    const result = await sendText(chatId, text);

    if (!result.success) {
      console.error("[insertNotification] WhatsApp send failed:", result.error?.code, result.error?.message);
      return;
    }

    const messageId = result.data?.messageId ?? null;
    const bookingId =
      typeof params.data?.booking_id === "number" ? params.data.booking_id : null;

    // Track the outbound message so Phase 2 (inbound webhook) can match a
    // reply's @lid against this delivered messageId.
    await admin.from("wa_messages").insert({
      message_id: messageId,
      user_id: params.userId,
      notification_id: params.notificationId,
      booking_id: bookingId,
      direction: "outbound",
      chat_id: chatId,
    });
  } catch (err) {
    console.error("[insertNotification] WhatsApp mirror error:", err);
  }
}
