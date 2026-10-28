-- G-priv-3: every bucket gets a size cap, and course_materials an allowlist
-- of types (avatars and course_covers already had both).

update storage.buckets set file_size_limit = 10485760 where id = 'certifications';  -- 10 MB
update storage.buckets set file_size_limit = 1048576 where id = 'subject_icons';    -- 1 MB
update storage.buckets
  set file_size_limit = 26214400,                                                   -- 25 MB
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  where id = 'course_materials';
