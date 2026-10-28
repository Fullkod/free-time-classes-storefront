-- FRE0015 F097 — WhatsApp notifications become opt-in.
-- Product decision (2026-10-28): off by default, explicit consent in Settings
-- with its date, and existing users are switched off (they never consented
-- explicitly; each one turns it back on in Settings).
--
-- * whatsapp_consent_at: when the user turned WhatsApp on (null = no consent).
--   Kept by a trigger, so clients cannot forge it: they can only update
--   receive_whatsapp_notifications (column grants from 034).
-- * receive_whatsapp_notifications defaults to false.

alter table public.users
  add column if not exists whatsapp_consent_at timestamptz;

alter table public.users
  alter column receive_whatsapp_notifications set default false;

create or replace function public.set_whatsapp_consent_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.receive_whatsapp_notifications is distinct from old.receive_whatsapp_notifications then
    new.whatsapp_consent_at := case when new.receive_whatsapp_notifications then now() else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists users_whatsapp_consent on public.users;
create trigger users_whatsapp_consent
  before insert or update of receive_whatsapp_notifications on public.users
  for each row execute function public.set_whatsapp_consent_at();

-- Existing users never gave explicit consent.
update public.users
  set receive_whatsapp_notifications = false
  where receive_whatsapp_notifications;
