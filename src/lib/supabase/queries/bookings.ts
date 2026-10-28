import type { Booking } from "@/types/booking";
import { createClient } from "../client";

const supabase = createClient();

/**
 * Get bookings by tutor ID
 */
export async function getBookingsByTutor(tutorId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("tutor_id", tutorId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as Booking[];
}

/** Estados que siempre permiten reseña (coincide con RLS en Supabase, salvo excepción `pending`). */
export const BOOKING_STATUSES_ELIGIBLE_FOR_REVIEW: Booking["status"][] = [
  "completed",
  "confirmed",
];
