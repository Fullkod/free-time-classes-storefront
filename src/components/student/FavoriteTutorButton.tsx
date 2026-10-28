"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/UserContext";
import { useTranslations } from "@/i18n/translations";
import {
  addFavoriteTutor,
  getFavoriteTutorIds,
  removeFavoriteTutor,
} from "@/lib/supabase/queries/studentFavorites";
import { cn } from "@/lib/utils";

/**
 * Heart toggle to save a tutor (FRE0013 F036). Only rendered for students
 * looking at someone else's profile.
 */
export default function FavoriteTutorButton({
  tutorId,
  className,
}: {
  tutorId: string;
  className?: string;
}) {
  const { user } = useAuth();
  const t = useTranslations("tutorPublicProfile");
  const [isFavorite, setIsFavorite] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const canFavorite = Boolean(user?.is_student && user.id !== tutorId);

  useEffect(() => {
    if (!canFavorite || !user?.id) return;
    let cancelled = false;
    getFavoriteTutorIds(user.id)
      .then((ids) => {
        if (!cancelled) setIsFavorite(ids.includes(tutorId));
      })
      .catch(() => {
        if (!cancelled) setIsFavorite(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFavorite, user?.id, tutorId]);

  if (!canFavorite || isFavorite === null || !user?.id) return null;

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (isFavorite) {
        await removeFavoriteTutor(user.id, tutorId);
        setIsFavorite(false);
      } else {
        await addFavoriteTutor(user.id, tutorId);
        setIsFavorite(true);
      }
    } catch (err) {
      console.error("[FavoriteTutorButton] toggle failed:", err);
      toast.error(t("favoriteError"));
    } finally {
      setSaving(false);
    }
  };

  const label = isFavorite ? t("unfavorite") : t("favorite");

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={saving}
      aria-pressed={isFavorite}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-full bg-[rgba(252,250,246,0.92)] transition-colors hover:bg-ft-paper disabled:opacity-60",
        isFavorite ? "text-red-500" : "text-ft-ink",
        className
      )}
    >
      <Heart
        width={16}
        height={16}
        fill={isFavorite ? "currentColor" : "none"}
        strokeWidth={isFavorite ? 0 : 2}
      />
    </button>
  );
}
