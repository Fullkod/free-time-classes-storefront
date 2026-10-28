import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
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
  name: string;
};

const MAX_SUBJECT_NAME_LENGTH = 80;

// Escapes LIKE wildcards so `ilike` behaves as a case-insensitive equality.
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function POST(
  request: NextRequest
) {
  try {
    const body = await readJson<Body>(request);
    if (!body) return noStoreJson({ error: "Invalid JSON." }, { status: 400 });
    const name = (typeof body.name === "string" ? body.name : "")
      .trim()
      .replace(/\s+/g, " ");

    if (!name || name.length > MAX_SUBJECT_NAME_LENGTH) {
      return noStoreJson(
        { error: "Invalid subject name." },
        { status: 400 }
      );
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    const missing: string[] = [];
    if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

    if (missing.length > 0) {
      return noStoreJson(
        {
          error: `Server misconfigured: missing ${missing.join(", ")}.`,
        },
        { status: 500 }
      );
    }

    // Service role bypasses RLS (server-side only).
    const supabaseAdmin = createSupabaseAdminClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { persistSession: false } }
    );

    const findExisting = () =>
      supabaseAdmin
        .from("subjects")
        .select("id")
        .ilike("name", escapeLike(name))
        .limit(1)
        .maybeSingle();

    // Reuse an existing subject (case-insensitive) instead of duplicating it.
    let subjectId: number | null = null;
    let createdNow = false;

    const { data: existing, error: existingError } = await findExisting();
    if (existingError) {
      return noStoreJson(
        { error: "Could not validate subject name." },
        { status: 500 }
      );
    }

    if (existing) {
      subjectId = existing.id as number;
    } else {
      const { data: createdSubject, error: createError } = await supabaseAdmin
        .from("subjects")
        .insert({ name })
        .select("id")
        .single();

      if (createError?.code === "23505") {
        // Lost a race against a concurrent insert of the same name.
        const { data: raced } = await findExisting();
        subjectId = (raced?.id as number | undefined) ?? null;
      } else if (createdSubject) {
        subjectId = createdSubject.id as number;
        createdNow = true;
      }

      if (subjectId === null) {
        return noStoreJson(
          { error: "Failed to create subject." },
          { status: 400 }
        );
      }
    }

    const { error: linkError } = await supabaseAdmin
      .from("tutor_subjects")
      .insert({ tutor_id: user.id, subject_id: subjectId });

    // 23505: the tutor already had this subject, nothing to do.
    if (linkError && linkError.code !== "23505") {
      // No transactions over PostgREST: undo the subject we just created.
      if (createdNow) {
        await supabaseAdmin.from("subjects").delete().eq("id", subjectId);
      }
      return noStoreJson(
        { error: "Failed to assign subject." },
        { status: 400 }
      );
    }

    revalidateTag("subjects");
    revalidateTag("tutors");

    return noStoreJson(
      { createdSubjectId: subjectId },
      { status: 200 }
    );
  } catch (err) {
    console.error("[subjects/create] error:", err);
    return noStoreJson(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
