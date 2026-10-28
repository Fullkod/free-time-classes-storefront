import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
  currentPassword: string;
  password: string;
};

/**
 * Checks the current password with a throwaway client (no cookies), then
 * closes the session that check opened (F104).
 */
async function isCurrentPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  const verifier = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  if (error) return false;
  await verifier.auth.signOut({ scope: "local" });
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<Body>(request);
    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
    // Passwords are used exactly as typed: no trimming (F104).
    const password = typeof body.password === "string" ? body.password : "";
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";

    if (password.length < 6 || !currentPassword) {
      return noStoreJson({ error: "Invalid password." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return noStoreJson({ error: "Unauthorized." }, { status: 401 });
    }

    if (!(await isCurrentPassword(user.email, currentPassword))) {
      return noStoreJson(
        { error: "The current password is not correct.", code: "wrong_current_password" },
        { status: 403 }
      );
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

