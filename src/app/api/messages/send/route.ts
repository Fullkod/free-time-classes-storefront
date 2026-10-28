import { NextRequest, NextResponse, after } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { insertNotification } from "@/lib/notifications";

/**
 * Send an internal message.
 *
 * Replaces the previous client-side insert so the server can fan out a
 * notification (in-app + WhatsApp via insertNotification) to the other
 * participant(s) on every message. The insert itself still runs as the
 * authenticated user, so the messages RLS policy keeps enforcing that the
 * sender is a participant.
 */
const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Cache-Control": "no-store" },
  });

const PREVIEW_MAX = 120;
// A recipient who read this conversation within this window is treated as
// "active" (still looking) and is NOT pinged again — avoids spamming in-app +
// WhatsApp during an active back-and-forth. Sending a message refreshes the
// sender's own last_read_at, and the open chat marks incoming realtime
// messages as read, so both sides stay "active" while actually chatting.
const ACTIVE_WINDOW_MS = 60_000;
// One pending (unread) message notification per conversation and recipient
// in this window: a burst of messages produces a single in-app + WhatsApp ping.
const GROUP_WINDOW_MS = 10 * 60_000;

type Body = { conversationId?: number | string; content?: string };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const conversationId =
      typeof body.conversationId === "number"
        ? body.conversationId
        : Number(body.conversationId);
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return noStoreJson({ error: "Invalid conversationId." }, { status: 400 });
    }
    if (!content) {
      return noStoreJson({ error: "Message cannot be empty." }, { status: 400 });
    }
    if (content.length > 2000) {
      return noStoreJson({ error: "Message too long (max 2000)." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    // Insert as the authenticated user — RLS enforces sender ∈ participants.
    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: user.id, content })
      .select("id, conversation_id, sender_id, content, created_at")
      .single();

    if (insertError || !message) {
      // RLS rejection (not a participant) surfaces here too.
      return noStoreJson(
        { error: insertError?.message || "Failed to send message." },
        { status: 400 }
      );
    }

    // Notifications are best-effort: never fail the send if they error.
    // after() keeps the function alive until they finish on Vercel.
    after(() =>
      notifyOtherParticipants({
        conversationId,
        senderId: user.id,
        content,
      }).catch((err) => console.error("[messages/send] notify error:", err))
    );

    return noStoreJson(message, { status: 200 });
  } catch (err) {
    console.error("[messages/send] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}

async function notifyOtherParticipants(args: {
  conversationId: number;
  senderId: string;
  content: string;
}): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();

  // Sending implies the sender is present and caught up — refresh their own
  // read marker so their replies keep them "active" for the guard below.
  await admin
    .from("conversation_participants")
    .update({ last_read_at: nowIso })
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.senderId);

  // Other participants (admin bypasses the "select own row only" RLS).
  const { data: participants } = await admin
    .from("conversation_participants")
    .select("user_id, last_read_at")
    .eq("conversation_id", args.conversationId)
    .neq("user_id", args.senderId);

  if (!participants?.length) return;

  // Skip recipients who are currently active (read very recently).
  const now = Date.now();
  const inactive = participants.filter((p) => {
    const lastRead = p.last_read_at ? new Date(p.last_read_at as string).getTime() : 0;
    return now - lastRead >= ACTIVE_WINDOW_MS;
  });

  if (!inactive.length) return;

  const { data: recentUnread } = await admin
    .from("notifications")
    .select("user_id")
    .in(
      "user_id",
      inactive.map((p) => p.user_id as string)
    )
    .eq("type", "message_received")
    .eq("is_read", false)
    .eq("data->>conversation_id", String(args.conversationId))
    .gte("created_at", new Date(now - GROUP_WINDOW_MS).toISOString());
  const alreadyPinged = new Set((recentUnread ?? []).map((n) => n.user_id as string));
  const toNotify = inactive.filter((p) => !alreadyPinged.has(p.user_id as string));

  if (!toNotify.length) return;

  const { data: sender } = await admin
    .from("users")
    .select("username")
    .eq("id", args.senderId)
    .single();
  const senderName = sender?.username ?? "Alguien";

  const preview =
    args.content.length > PREVIEW_MAX
      ? `${args.content.slice(0, PREVIEW_MAX).trimEnd()}…`
      : args.content;

  await Promise.all(
    toNotify.map((p) =>
      insertNotification(admin, {
        userId: p.user_id as string,
        type: "message_received",
        title: `Nuevo mensaje de ${senderName}`,
        body: preview,
        data: { conversation_id: args.conversationId, actor_name: sender?.username ?? null },
      })
    )
  );
}
