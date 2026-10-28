-- F102: anyone could list the avatars bucket. Images are served through the
-- public URL, which does not need a SELECT policy; the owner still needs it
-- (remove() returns the deleted rows), so SELECT is limited to the owner.

drop policy if exists avatars_public_read on storage.objects;

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(split_part(name, '/', 1), '.', 1) = auth.uid()::text
    )
  );
