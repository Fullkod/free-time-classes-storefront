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

    // F105: every table the user is party to, read with the service role and
    // filtered by their id. Google tokens are secrets and stay out.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return noStoreJson({ error: "Server misconfigured." }, { status: 500 });
    }
    const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const id = user.id;
    const both = (a: string, b: string) => `${a}.eq.${id},${b}.eq.${id}`;
    const { data: memberships } = await admin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", id);
    const conversationIds = (memberships ?? []).map((m) => m.conversation_id as number);

    const [bookings, lessons, reviews, rejections, favorites, notifications, courses,
      tutorSubjects, availability, exceptions, payments, whatsapp, messages] = await Promise.all([
      admin.from("bookings").select("*").or(both("student_id", "tutor_id")),
      admin.from("lessons").select("*").or(both("student_id", "tutor_id")),
      admin.from("reviews").select("*").or(both("student_id", "tutor_id")),
      admin.from("booking_rejections").select("*").or(both("student_id", "tutor_id")),
      admin.from("student_favorite_tutors").select("*").eq("student_id", id),
      admin.from("notifications").select("*").eq("user_id", id),
      admin.from("courses").select("*").eq("tutor_id", id),
      admin.from("tutor_subjects").select("*").eq("tutor_id", id),
      admin.from("tutor_availability").select("*").eq("tutor_id", id),
      admin.from("availability_exceptions").select("*").eq("tutor_id", id),
      admin.from("payments").select("*").eq("student_id", id),
      admin.from("wa_messages").select("id, booking_id, direction, created_at").eq("user_id", id),
      conversationIds.length
        ? admin.from("messages").select("*").in("conversation_id", conversationIds)
        : admin.from("messages").select("*").or(both("sender_id", "receiver_id")),
    ]);

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
        bookings: bookings.data ?? [],
        lessons: lessons.data ?? [],
        reviews: reviews.data ?? [],
        booking_rejections: rejections.data ?? [],
        favorite_tutors: favorites.data ?? [],
        notifications: notifications.data ?? [],
        courses: courses.data ?? [],
        tutor_subjects: tutorSubjects.data ?? [],
        availability_rules: availability.data ?? [],
        availability_exceptions: exceptions.data ?? [],
        payments: payments.data ?? [],
        whatsapp_deliveries: whatsapp.data ?? [],
        conversations: conversationIds,
        messages: messages.data ?? [],
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

