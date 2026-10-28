import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { completeFinishedBookings } from "@/lib/bookings/completeFinished";
import { expirePendingBookings } from "@/lib/bookings/expirePending";

// Daily job (Vercel Cron, see vercel.json). Idempotent:
// - pings Supabase so the free plan does not pause the project after 7 idle days;
// - expires pending requests past their deadline (F014);
// - marks confirmed bookings whose class already ended as completed;
// - purges old WhatsApp inbound events.
export const maxDuration = 60;

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

const INBOUND_RETENTION_DAYS = 30;

export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fail closed when
  // the secret is not configured.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return noStoreJson(
      { error: "Server misconfigured: missing Supabase env vars." },
      { status: 500 }
    );
  }

  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // PRP-001: open times are computed on demand, so no slots are generated.
  const failures: Array<{ ruleId: string; error: string }> = [];

  const { error: pingError } = await admin.rpc("ping");
  if (pingError) {
    failures.push({ ruleId: "keepalive-ping", error: pingError.message });
  }

  const expiry = await expirePendingBookings(admin);
  if (expiry.error) {
    failures.push({ ruleId: "expire-pending", error: expiry.error });
  }

  const completion = await completeFinishedBookings(admin);
  if (completion.error) {
    failures.push({ ruleId: "complete-bookings", error: completion.error });
  }

  // WhatsApp inbound events are only needed for idempotency and debugging.
  const inboundCutoff = new Date(
    Date.now() - INBOUND_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { error: purgeError } = await admin
    .from("wa_inbound_events")
    .delete()
    .lt("created_at", inboundCutoff);
  if (purgeError) {
    failures.push({ ruleId: "purge-wa-inbound", error: purgeError.message });
  }

  if (failures.length > 0) {
    console.error("[cron/daily] failures:", failures);
  }

  return noStoreJson(
    {
      ok: failures.length === 0,
      bookingsExpired: expiry.bookingsExpired,
      bookingsCompleted: completion.bookingsCompleted,
      failures,
    },
    { status: failures.length === 0 ? 200 : 207 }
  );
}
