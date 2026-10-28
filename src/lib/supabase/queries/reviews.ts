import type { Review, ReviewWithStudent } from "@/types/review";
import { createClient } from "../client";

const supabase = createClient();

export async function createReview(input: {
  booking_id?: number | null;
  lesson_id?: number | null;
  student_id: string;
  tutor_id: string;
  rating: number;
  comment: string;
}): Promise<Review> {
  const hasBooking =
    input.booking_id !== undefined && input.booking_id !== null;
  const hasLesson = input.lesson_id !== undefined && input.lesson_id !== null;
  if (hasBooking === hasLesson) {
    throw new Error("createReview: indica booking_id o lesson_id, no ambos ni ninguno");
  }

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      booking_id: hasBooking ? input.booking_id : null,
      lesson_id: hasLesson ? input.lesson_id : null,
      student_id: input.student_id,
      tutor_id: input.tutor_id,
      rating: input.rating,
      comment: input.comment,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Review;
}

export async function updateReviewTutorResponse(input: {
  reviewId: string;
  tutor_response: string;
}): Promise<Review> {
  const { data, error } = await supabase
    .from("reviews")
    .update({ tutor_response: input.tutor_response })
    .eq("id", input.reviewId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Review;
}

export async function getReviewsByTutor(
  tutorId: string,
  limit = 5
): Promise<ReviewWithStudent[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("tutor_id", tutorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ReviewWithStudent[];
}

export async function getReviewsByStudentAndBookingIds(
  studentId: string,
  bookingIds: number[]
): Promise<Review[]> {
  if (bookingIds.length === 0) return [];

  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("student_id", studentId)
    .in("booking_id", bookingIds);

  if (error) throw error;
  return (data || []) as Review[];
}

