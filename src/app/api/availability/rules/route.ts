import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publicError, readJson } from "@/lib/api/http";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

// PRP-001: a rule is only a weekly time window. Courses decide subject,
// duration and price; open times are computed on demand (no pre-generated
// slots).
type CreateBody = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;

function normalizeTime(value: string): string {
  const v = value.trim();
  if (v.length === 5) return `${v}:00`;
  return v;
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await readJson<CreateBody>(request);

    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
    const dayOfWeek = Number(body.day_of_week);
    const startTime = typeof body.start_time === "string" ? body.start_time.trim() : "";
    const endTime = typeof body.end_time === "string" ? body.end_time.trim() : "";

    if (
      !Number.isInteger(dayOfWeek) ||
      dayOfWeek < 0 ||
      dayOfWeek > 6 ||
      !TIME_RE.test(startTime) ||
      !TIME_RE.test(endTime) ||
      normalizeTime(endTime) <= normalizeTime(startTime)
    ) {
      return noStoreJson({ error: "Invalid payload." }, { status: 400 });
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

    const { data: ruleRow, error: insertRuleError } = await admin
      .from("tutor_availability")
      .insert({
        tutor_id: user.id,
        day_of_week: dayOfWeek,
        start_time: normalizeTime(startTime),
        end_time: normalizeTime(endTime),
        is_active: true,
      })
      .select("id")
      .single();

    if (insertRuleError || !ruleRow) {
      return noStoreJson(
        publicError(insertRuleError, "Could not save rule."),
        { status: 400 }
      );
    }

    return noStoreJson({ ruleId: ruleRow.id }, { status: 200 });
  } catch (err) {
    console.error("[availability/rules POST] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
