import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { verifySignature } from "@/lib/whatsapp/verifySignature";
import { parseBookingCode, parseReply } from "@/lib/whatsapp/parseReply";
import { matchTutorPendingBookings, type PendingForReply } from "@/lib/whatsapp/matchBooking";
import { formatLessonTime } from "@/lib/whatsapp/messages";
import { loadTutorTimeZone } from "@/lib/availability/tutorTimeZone";
import { respondToBooking } from "@/lib/bookings/respond";
import { isOpenWaConfigured, sendText } from "@/lib/whatsapp/openwa";

// node:crypto (HMAC) needs the Node runtime, not edge.
export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.OPENWA_WEBHOOK_SECRET ?? "";

// WhatsApp sender ids are numeric with a known suffix (e.g. 34600111222@c.us,
// 123456789012345@lid). Anything else is rejected before it reaches a query.
const SENDER_ID_PATTERN = /^\d{5,20}@(c\.us|lid|s\.whatsapp\.net)$/i;

const isBogusKey = (k?: string | null) => !k || k === "msg_unknown" || k === "unknown";

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

const INBOUND_BODY_KEEP = 40;

/** "#47 · 3 de noviembre · 09:00 (hora de Havana)" lines for the tutor's pending requests. */
function pendingList(pending: PendingForReply[], timeZone: string): string {
  return pending
    .map((p) => {
      const when = formatLessonTime(p.scheduledDateTime, timeZone);
      return `• *#${p.bookingId}*${when ? ` · ${when}` : ""}`;
    })
    .join("\n");
}

export async function POST(request: NextRequest) {
  // Read the RAW body — HMAC must be verified against it, not re-serialized JSON.
  const rawBody = await request.text();

  // 1. Signature. Fail closed in production when no secret is configured.
  if (!WEBHOOK_SECRET && process.env.NODE_ENV === "production") {
    console.error("[wa-webhook] OPENWA_WEBHOOK_SECRET is not set; rejecting request.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  if (WEBHOOK_SECRET) {
    const ok = verifySignature(
      rawBody,
      request.headers.get("x-openwa-signature"),
      WEBHOOK_SECRET,
    );
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let env: Record<string, unknown>;
  try {
    env = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = (env.data ?? {}) as Record<string, unknown>;
  const event = String(env.event ?? "");

  const admin = adminClient();
  if (!admin) {
    // Tell OpenWA to retry — this is a server-side misconfig, not a bad event.
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Non-message events we care about
  if (event === "session.disconnected") {
    console.error("[wa-webhook] session.disconnected:", env.sessionId);
    return NextResponse.json({ ok: true, handled: "session.disconnected" });
  }
  if (event !== "message.received") {
    return NextResponse.json({ ok: true, skip: "event" });
  }

  // 2. Filter non-chat / echoes / groups / empty bodies (guide §5.6)
  const body = typeof data.body === "string" ? data.body : "";
  const type = typeof data.type === "string" ? data.type : "";
  if (data.fromMe === true || data.isGroup === true) {
    return NextResponse.json({ ok: true, skip: "echo_or_group" });
  }
  if (type && type !== "chat") {
    return NextResponse.json({ ok: true, skip: "non_chat" });
  }
  if (!body.trim()) {
    return NextResponse.json({ ok: true, skip: "empty" });
  }

  // 3. Idempotency — build our own key (guide §5.5) and dedup atomically via
  // the unique constraint on wa_inbound_events.idempotency_key. Only signed
  // fields count: an unsigned header would let a replayed body through (F095).
  const dataId = typeof data.id === "string" ? data.id : "";
  const deliveryId = typeof env.deliveryId === "string" ? env.deliveryId : "";
  const idemKey = !isBogusKey(dataId)
    ? `msgid:${dataId}`
    : !isBogusKey(env.idempotencyKey as string)
      ? (env.idempotencyKey as string)
      : !isBogusKey(deliveryId)
        ? `dlv:${deliveryId}`
        : `body:${createHash("sha256").update(rawBody).digest("hex")}`;

  const from = typeof data.from === "string" ? data.from.trim() : "";
  if (!SENDER_ID_PATTERN.test(from)) {
    return NextResponse.json({ ok: true, skip: "invalid_sender" });
  }

  const { error: insertError } = await admin
    .from("wa_inbound_events")
    // Keep only a short prefix: enough to debug SI/NO parsing without storing
    // users' full messages (purged after 30 days by the daily cron).
    .insert({ idempotency_key: idemKey, from_id: from, body: body.slice(0, INBOUND_BODY_KEEP) });

  if (insertError) {
    // 23505 = unique_violation → already processed this event.
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[wa-webhook] inbound insert failed:", insertError);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // 4. Resolve the tutor and their pending bookings (handles @lid)
  const match = await matchTutorPendingBookings(admin, from);
  if (!match || match.pending.length === 0) {
    await admin
      .from("wa_inbound_events")
      .update({ action: "no_match" })
      .eq("idempotency_key", idemKey);
    return NextResponse.json({ ok: true, skip: "no_match" });
  }

  // 5. Parse the reply into an action
  const action = parseReply(body);
  if (!action) {
    await admin
      .from("wa_inbound_events")
      .update({ action: "unrecognized" })
      .eq("idempotency_key", idemKey);
    if (from && isOpenWaConfigured()) {
      await sendText(
        from,
        "No entendí tu respuesta 🤔\nResponde *SÍ* (o _ok_, _vale_, _confirmar_) para aceptar, o *NO* (o _cancelar_, _rechazar_) para rechazar la solicitud.",
      ).catch(() => {});
    }
    return NextResponse.json({ ok: true, skip: "unrecognized" });
  }

  // 6. Which booking (F071): the code in the reply, or the only pending one.
  // Never guess between several.
  const code = parseBookingCode(body);
  const target = code != null
    ? match.pending.find((p) => p.bookingId === code)
    : match.pending.length === 1
      ? match.pending[0]
      : undefined;
  if (!target) {
    await admin
      .from("wa_inbound_events")
      .update({ action: code != null ? "unknown_code" : "ambiguous" })
      .eq("idempotency_key", idemKey);
    if (isOpenWaConfigured()) {
      const list = pendingList(match.pending, await loadTutorTimeZone(admin, match.tutorId));
      const intro = code != null
        ? `No tienes ninguna solicitud pendiente con el código #${code}. Estas son las pendientes:`
        : "Tienes varias solicitudes pendientes. ¿Cuál quieres gestionar?";
      const example = match.pending[0].bookingId;
      await sendText(
        from,
        `${intro}\n${list}\n\nResponde con el código, por ejemplo *SÍ ${example}* o *NO ${example}*.`,
      ).catch(() => {});
    }
    return NextResponse.json({ ok: true, skip: code != null ? "unknown_code" : "ambiguous" });
  }

  // 7. Act on the booking (reuses the same logic as the tutor API route)
  const result = await respondToBooking(admin, {
    bookingId: target.bookingId,
    tutorId: match.tutorId,
    action,
  });

  await admin
    .from("wa_inbound_events")
    .update({ action, booking_id: target.bookingId })
    .eq("idempotency_key", idemKey);

  // 8. Confirmation back to the tutor (reply to the same chat)
  if (from && isOpenWaConfigured()) {
    let reply: string;
    if (result.httpStatus === 200 && action === "confirm") {
      const meetLink =
        typeof result.payload.meetLink === "string" ? result.payload.meetLink : "";
      reply = meetLink
        ? `✅ Clase #${target.bookingId} confirmada. Enlace de la videollamada:\n${meetLink}`
        : `✅ Clase #${target.bookingId} confirmada.`;
    } else if (result.httpStatus === 200) {
      reply = `❌ Solicitud #${target.bookingId} rechazada.`;
    } else if (result.payload.code === "request_expired") {
      reply = "⌛ Esta solicitud ya había caducado.";
    } else if (result.httpStatus === 409) {
      reply = "Esta solicitud ya no está pendiente.";
    } else {
      reply = "No se pudo procesar la solicitud. Inténtalo desde la app.";
    }
    await sendText(from, reply).catch(() => {});
  }

  return NextResponse.json({ ok: true, action, bookingId: target.bookingId });
}
