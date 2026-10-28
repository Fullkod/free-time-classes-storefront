-- F101: SECURITY DEFINER functions must pin search_path so a caller cannot
-- shadow the objects they use. These three review triggers were the last
-- ones without it; their bodies already schema-qualify every object.

alter function public.prevent_review_rating_comment_updates() set search_path = public;
alter function public.set_review_course_id_from_booking() set search_path = public;
alter function public.update_course_rating_from_reviews() set search_path = public;
