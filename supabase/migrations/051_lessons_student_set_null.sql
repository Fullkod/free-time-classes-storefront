-- F105: a student who ever had a class could not delete their account:
-- lessons.student_id (NO ACTION) blocked the cascade from auth.users. The
-- tutor keeps the class in their history, without the student.
-- (Upcoming classes are cancelled by /api/settings/delete-account first.)

alter table public.lessons drop constraint if exists lessons_student_id_fkey;
alter table public.lessons
  add constraint lessons_student_id_fkey
  foreign key (student_id) references public.student_profiles(id) on delete set null;
