-- PRP-002 — the tutor agenda is kept in the tutor's own time zone.
-- tutor_availability (day_of_week, start_time, end_time) and
-- availability_exceptions (exception_date, start_time, end_time) are wall-clock
-- values in tutor_profiles.timezone (null = Europe/Madrid). Lessons keep their
-- Madrid wall-clock scheduled_date_time; the app converts per date
-- (src/lib/availability/openStartTimes.ts), so each country's DST is respected.

-- Product decision (2026-10-28): every current tutor starts in Europe/Madrid,
-- which is what their agenda was entered in; they change it if needed.
update public.tutor_profiles set timezone = 'Europe/Madrid' where timezone is null;

-- Only valid IANA zones: an invalid value would break the open-times engine.
create or replace function public.tutor_profiles_validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists tutor_profiles_validate_timezone on public.tutor_profiles;
create trigger tutor_profiles_validate_timezone
  before insert or update of timezone on public.tutor_profiles
  for each row execute function public.tutor_profiles_validate_timezone();

comment on column public.tutor_profiles.timezone is
  'IANA zone of the tutor agenda; null = Europe/Madrid. Written only via /api/availability/timezone.';
comment on table public.tutor_availability is
  'Weekly windows as wall-clock times in the tutor''s tutor_profiles.timezone.';
comment on table public.availability_exceptions is
  'Blocked/extra dates and times as wall-clock values in the tutor''s tutor_profiles.timezone.';
