-- FRE0013 F036 (with F034/F035) — when a student can review.
-- Product decision (2026-10-28): only completed classes, one review per
-- class, up to 30 days after the class (Madrid wall-clock, like lessons).
-- Mirrors src/lib/reviews/reviewWindow.ts.
--
-- * Booking reviews: the booking must be `completed` (no longer `confirmed`
--   or a pending booking whose lesson completed).
-- * Lesson reviews (legacy lessons booked without a booking, 018): only when
--   no booking exists for that lesson, so a class cannot get two reviews
--   (one by booking_id and another by lesson_id).
-- Restrictive, but nothing in the deployed app inserts reviews yet.

drop policy if exists reviews_student_insert on public.reviews;

create policy reviews_student_insert on public.reviews
  for insert to authenticated
  with check (
    auth.uid() = student_id
    and (
      (
        booking_id is not null and lesson_id is null
        and exists (
          select 1
          from public.bookings b
          join public.lessons l on l.id = b.lesson_id
          where b.id = reviews.booking_id
            and b.student_id = auth.uid()
            and b.tutor_id = reviews.tutor_id
            and b.status = 'completed'
            and l.scheduled_date_time >= (now() at time zone 'Europe/Madrid') - interval '30 days'
        )
      )
      or (
        lesson_id is not null and booking_id is null
        and exists (
          select 1
          from public.lessons l
          where l.id = reviews.lesson_id
            and l.student_id = auth.uid()
            and l.tutor_id = reviews.tutor_id
            and l.status = 'completed'
            and l.scheduled_date_time >= (now() at time zone 'Europe/Madrid') - interval '30 days'
            and not exists (select 1 from public.bookings b where b.lesson_id = l.id)
        )
      )
    )
    and (
      course_id is null
      or exists (
        select 1 from public.courses c
        where c.id = reviews.course_id and c.tutor_id = reviews.tutor_id
      )
    )
  );
