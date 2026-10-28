import type { Course } from "./course";

/** Curso mínimo para la home (tarjetas populares + derivación de tutores destacados). */
export type HomeCourseCard = Pick<
  Course,
  "id" | "title" | "description" | "level" | "max_students" | "cover_image"
> & {
  tutor?: { id: string; username: string } | null;
  enrolled_students_count?: number;
};

/** A subject with its number of active courses (home categories strip). */
export type HomeCategory = {
  id: number;
  name: string;
  coursesCount: number;
};

export type HomeFeaturedTeacher = {
  id: string;
  name: string;
  specialty: string;
  yearsOfExperience: number;
  coursesCount: number;
  profilePicture: string;
};
