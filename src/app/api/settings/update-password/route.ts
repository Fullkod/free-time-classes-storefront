import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  password: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<Body>(request);
    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
    const password = typeof body.password === "string" ? body.password.trim() : "";

    if (password.length < 6) {
      return noStoreJson({ error: "Invalid password." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    const { data, error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      return noStoreJson(
        { error: error.message || "Failed to update password." },
        { status: 400 }
      );
    }

    return noStoreJson(
      {
        ok: true,
        user: {
          id: data.user?.id ?? user.id,
          updated_at: data.user?.updated_at ?? null,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[settings/update-password] error:", err);
    return noStoreJson(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

