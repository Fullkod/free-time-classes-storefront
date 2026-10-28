import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publicError } from "@/lib/api/http";

/**
 * Subject catalog for authenticated clients (e.g. student filters).
 * Uses the service role so listing works even when RLS only allows anon reads.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server misconfigured: missing Supabase env vars." },
        { status: 500 }
      );
    }

    const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await admin
      .from("subjects")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        publicError(error, "Failed to load subjects."),
        { status: 400 }
      );
    }

    return NextResponse.json(
      { items: data ?? [] },
      {
        headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
      }
    );
  } catch (err) {
    console.error("[api/subjects GET] error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
