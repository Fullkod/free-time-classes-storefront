import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { respondToBooking } from "@/lib/bookings/respond";
import { readJson } from "@/lib/api/http";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

type Body = {
  bookingId: number;
  action: "confirm" | "reject";
  reason?: string;
  meetLink?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<Body>(request);
    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
    const bookingId =
      typeof body.bookingId === "number" ? body.bookingId : Number(body.bookingId);
    const action = body.action;

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return noStoreJson({ error: "Invalid bookingId." }, { status: 400 });
    }
    if (action !== "confirm" && action !== "reject") {
      return noStoreJson({ error: "Invalid action." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("is_tutor")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_tutor) {
      return noStoreJson({ error: "Forbidden." }, { status: 403 });
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

    const { httpStatus, payload } = await respondToBooking(admin, {
      bookingId,
      tutorId: user.id,
      action,
      meetLink: typeof body.meetLink === "string" ? body.meetLink : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });

    return noStoreJson(payload, { status: httpStatus });
  } catch (err) {
    console.error("[bookings/tutor/respond] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
