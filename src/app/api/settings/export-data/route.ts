import { NextRequest, NextResponse } from "next/server";
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

export async function POST(_request: NextRequest) {
  void _request; // Explicitly mark as used; not needed for this endpoint
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    const [{ data: userRow, error: userRowError }, { data: student }, { data: tutor }] =
      await Promise.all([
        supabase.rpc("get_my_profile").maybeSingle(),
        supabase
          .from("student_profiles")
          .select("*")
          .eq("id", user.id)
          .single(),
        supabase
          .from("tutor_profiles")
          .select("*")
          .eq("id", user.id)
          .single(),
      ]);

    if (userRowError) {
      return noStoreJson(
        publicError(userRowError, "Failed to load user data."),
        { status: 400 }
      );
    }

    return new NextResponse(
      JSON.stringify({
        exportedAt: new Date().toISOString(),
        auth: {
          id: user.id,
          email: user.email,
        },
        profile: userRow,
        student_profile: student ?? null,
        tutor_profile: tutor ?? null,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[settings/export-data] error:", err);
    return noStoreJson(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

