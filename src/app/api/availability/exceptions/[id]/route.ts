import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publicError } from "@/lib/api/http";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: exceptionId } = await context.params;
    if (!exceptionId || typeof exceptionId !== "string") {
      return noStoreJson({ error: "Invalid exception id." }, { status: 400 });
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

    const { data: row, error: fetchErr } = await admin
      .from("availability_exceptions")
      .select("id,tutor_id")
      .eq("id", exceptionId)
      .single();

    if (fetchErr || !row || row.tutor_id !== user.id) {
      return noStoreJson({ error: "Exception not found." }, { status: 404 });
    }

    const { error: delErr } = await admin
      .from("availability_exceptions")
      .delete()
      .eq("id", exceptionId);

    if (delErr) {
      return noStoreJson(
        publicError(delErr, "Could not delete exception."),
        { status: 400 }
      );
    }

    return noStoreJson({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[availability/exceptions DELETE] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
