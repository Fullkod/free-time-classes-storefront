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

type Body = {
  email: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<Body>(request);
    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!isValidEmail(email)) {
      return noStoreJson({ error: "Invalid email." }, { status: 400 });
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
      email,
    });

    if (error) {
      return noStoreJson(
        { error: error.message || "Failed to update email." },
        { status: 400 }
      );
    }

    const appliedEmail = data.user?.email ?? null;
    if (appliedEmail === email) {
      // users.email is not client-writable (migration 034): sync it with the
      // service role.
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
      const { error: publicUserError } = await admin
        .from("users")
        .update({
          email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (publicUserError) {
        return noStoreJson(
          publicError(publicUserError, "Failed to sync public user email."),
          { status: 400 }
        );
      }
    }

    return noStoreJson(
      {
        ok: true,
        user: {
          id: data.user?.id ?? user.id,
          email: appliedEmail,
          updated_at: data.user?.updated_at ?? null,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[settings/update-email] error:", err);
    return noStoreJson(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

