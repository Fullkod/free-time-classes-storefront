import { downscaleImage } from "@/lib/images/downscale";
import { createClient } from "./client";

const supabase = createClient();

/**
 * Upload avatar image to Supabase Storage
 * @param userId - User UUID
 * @param file - File to upload
 * @returns File path saved in bucket
 */
export async function uploadAvatar(
  userId: string,
  originalFile: File
): Promise<string> {
  const file = await downscaleImage(originalFile, 512);
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  // A new path per upload: reusing `${userId}.ext` kept serving the cached
  // old picture (same URL), so the object can now be cached for a year.
  const path = `${userId}/${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || "image/jpeg",
  });

  if (error) {
    throw error;
  }

  return path;
}

/**
 * Best-effort removal of an upload that is no longer referenced (G-prof-3):
 * the image a new one replaced, or a new one whose save failed. A failure
 * only leaves an orphan file, so it never breaks the save.
 */
export async function removeUnusedUpload(
  bucket: "avatars" | "course_covers",
  path: string | null | undefined,
  keepPath?: string | null
): Promise<void> {
  if (!path || path === keepPath || /^https?:\/\//.test(path)) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.warn(`[storage] could not remove ${bucket}/${path}:`, error.message);
}

/**
 * Get public URL for a file in storage
 * @param bucket - Storage bucket name
 * @param path - File path in the bucket
 * @returns Public URL
 */
export function getPublicUrl(bucket: string, path: string): string {
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return publicUrl;
}

/**
 * Resuelve la portada de un curso: URL absoluta o ruta en bucket course_covers.
 */
export function getCourseCoverPublicUrl(
  pathOrUrl: string | null | undefined
): string | null {
  if (pathOrUrl == null || typeof pathOrUrl !== "string") return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return getPublicUrl("course_covers", trimmed);
}

/**
 * Sube la imagen de portada del curso (el curso ya debe existir; RLS exige tutor titular).
 */
export async function uploadCourseCover(
  courseId: number | string,
  originalFile: File
): Promise<string> {
  const file = await downscaleImage(originalFile, 1600);
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `${courseId}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("course_covers")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    throw uploadError;
  }

  return filePath;
}
