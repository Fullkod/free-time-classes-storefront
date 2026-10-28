import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidateCatalog } from "@/lib/catalog/revalidateServer";
import { isValidTimeZone } from "@/lib/datetime/zonedTime";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

type Body = {
  timezone: string;
};

/**
 * Sets the zone of the tutor's agenda (PRP-002). Weekly windows keep their
 * local hours (product decision), so open times move with the new zone;
 * booked classes do not change. The database also rejects invalid zones.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<Body>;
    const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
    if (!isValidTimeZone(timezone)) {
      return noStoreJson({ error: "Invalid timezone.", code: "invalid_timezone" }, { status: 400 });
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

    const { error: updateError } = await admin
      .from("tutor_profiles")
      .update({ timezone })
      .eq("id", user.id);
    if (updateError) {
      // 22023: the database trigger does not know this zone.
      const invalid = updateError.code === "22023";
      return noStoreJson(
        invalid
          ? { error: "Invalid timezone.", code: "invalid_timezone" }
          : { error: "Could not save the timezone." },
        { status: invalid ? 400 : 500 }
      );
    }

    // Open times on course pages depend on it.
    revalidateCatalog();

    return noStoreJson({ timezone }, { status: 200 });
  } catch (err) {
    console.error("[availability/timezone] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
