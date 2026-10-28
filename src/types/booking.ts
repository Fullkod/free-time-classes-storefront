// Booking type matching Supabase bookings table
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "completed"
  | "expired";

export interface Booking {
  id: number; // Serial primary key
  student_id: string; // UUID, references student_profiles(id)
  tutor_id: string; // UUID, references tutor_profiles(id)
  lesson_id?: number | null; // References lessons(id) — null for custom requests
  requested_date?: string | null; // Timestamp (created/requested at)
  status: BookingStatus; // default 'pending'
  notes?: string | null;
  // Custom-request fields (populated when lesson_id is NULL)
  requested_subject_id?: number | null;
  requested_scheduled_date_time?: string | null; // Wall-clock Madrid (no TZ)
  requested_duration_minutes?: number | null;
  created_at: string;
  updated_at: string;
}

// Booking rejection type
export type BookingRejectionReason =
  | "tutor unavailable"
  | "sick tutor"
  | "sick student"
  | "scheduling conflict"
  | "emergency"
  | "technical issues"
  | "other";

export interface BookingRejection {
  id: number; // Serial primary key
  booking_id: number; // References bookings(id)
  student_id: string; // UUID
  tutor_id: string; // UUID
  reason: BookingRejectionReason;
  created_at: string;
}
