import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidateCatalog } from "@/lib/catalog/revalidateServer";

const noStoreJson = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store",
    },
  });

type Body = {
  acceptTerms: boolean;
};

/**
 * Adds the tutor role to the signed-in user (FRE0009 F043). Product decision:
 * free and immediate. Role flags are not client-writable (034), and the
 * middleware reads them from the JWT metadata, so both are set here with the
 * service role. Idempotent; the client refreshes its session afterwards.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<Body>;
    if (body.acceptTerms !== true) {
      return noStoreJson({ error: "Terms must be accepted." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
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

    const { error: profileError } = await admin
      .from("tutor_profiles")
      .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
    if (profileError) {
      console.error("[become-tutor] tutor profile:", profileError.message);
      return noStoreJson({ error: "Could not create the tutor profile." }, { status: 500 });
    }

    const { error: roleError } = await admin
      .from("users")
      .update({ is_tutor: true, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (roleError) {
      console.error("[become-tutor] users.is_tutor:", roleError.message);
      return noStoreJson({ error: "Could not update the role." }, { status: 500 });
    }

    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), is_tutor: true },
    });
    if (metadataError) {
      console.error("[become-tutor] auth metadata:", metadataError.message);
      return noStoreJson({ error: "Could not update the role." }, { status: 500 });
    }

    // The new tutor shows up in the public catalog.
    revalidateCatalog();

    return noStoreJson({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[become-tutor] error:", err);
    return noStoreJson({ error: "Unexpected server error." }, { status: 500 });
  }
}
