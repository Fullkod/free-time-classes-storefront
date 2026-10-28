-- FRE0012 F014 — pending requests expire.
-- A pending booking the tutor did not answer in time (48 h after it was made,
-- or 2 h before the class, whichever comes first) becomes `expired`. The
-- expiry runs in the app (src/lib/bookings/expirePending.ts): daily cron,
-- before pending lists are read and before a request is answered.
-- Additive: only widens the allowed statuses.

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'expired'));
