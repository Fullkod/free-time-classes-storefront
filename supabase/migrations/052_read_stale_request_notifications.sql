-- F106: booking request notifications stayed unread after the request was
-- answered, cancelled or expired. The API now marks them read
-- (markRequestNotificationsRead); this applies the same rule to old rows.

update public.notifications n
   set is_read = true
 where n.type in ('booking_request', 'booking_custom_request')
   and not n.is_read
   and not exists (
     select 1
       from public.bookings b
      where b.id::text = n.data->>'booking_id'
        and b.status = 'pending'
   );
