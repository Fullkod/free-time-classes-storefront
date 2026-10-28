"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  FT_BTN_OUTLINE,
  FT_BTN_PRIMARY,
  FT_FIELD,
  FT_LABEL,
  FT_SELECT_TRIGGER,
  FT_TEXTAREA,
} from "@/components/teacher/ftStyles";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/UserContext";
import { useTranslations } from "@/i18n/translations";
import { COUNTRIES } from "@/lib/constants/countries";
import { updateTutorProfile } from "@/lib/supabase/queries/tutors";
import { updateUser } from "@/lib/supabase/queries/users";
import type { TutorProfile } from "@/types/tutor";
import type { User } from "@/types/user";
import { getPublicUrl, removeUnusedUpload, uploadAvatar } from "@/lib/supabase/storage";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { requestCatalogRevalidation } from "@/lib/catalog/revalidate";
import { UPLOADABLE_IMAGE_ACCEPT, isUploadableImage } from "@/lib/images/downscale";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Mismo `id` que `tutor_profiles` (FK a `users`). */
  tutorId: string;
  initialBio?: string | null;
  initialYearsOfExperience?: number | null;
  onTutorProfileUpdated?: (updates: Partial<TutorProfile>) => void;
}

interface FormData {
  username: string;
  phone: string;
  country: string;
  bio: string;
  yearsOfExperience: string;
}

export default function EditProfileModal({
  isOpen,
  onClose,
  tutorId,
  initialBio = "",
  initialYearsOfExperience,
  onTutorProfileUpdated,
}: EditProfileModalProps) {
  const { user, refreshUser } = useAuth();
  const t = useTranslations("teacherProfile");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<FormData>({
    username: user?.username || "",
    phone: user?.phone || "",
    country: user?.country || "",
    bio: initialBio ?? "",
    yearsOfExperience: initialYearsOfExperience != null ? String(initialYearsOfExperience) : "",
  });

  const [loading, setLoading] = useState(false);
  const dialogBodyScrollRef = useRef<HTMLDivElement>(null);

  const countryMenuOptions = useMemo(
    () => [
      { value: "", label: t("selectCountry") },
      ...COUNTRIES.map((c) => ({ value: c, label: c })),
    ],
    [t]
  );

  // Update form data when user data changes
  useEffect(() => {
    setFormData({
      username: user?.username || "",
      phone: user?.phone || "",
      country: user?.country || "",
      bio: initialBio ?? "",
      yearsOfExperience: initialYearsOfExperience != null ? String(initialYearsOfExperience) : "",
    });
  }, [user, initialBio, initialYearsOfExperience]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setLoading(true);

    // Username is required; phone and country can be cleared (G-prof-6).
    const formDataToUpdate: Partial<Pick<User, "username" | "phone" | "country">> = {
      phone: formData.phone.trim() || null,
      country: formData.country || null,
    };
    if (formData.username) formDataToUpdate.username = formData.username;

    let uploadedPicture: string | null = null;
    try {
      const previousPicture = user.profile_picture || null;
      let profilePicture = previousPicture;
      if (avatarFile) {
        profilePicture = await uploadAvatar(user.id, avatarFile);
        uploadedPicture = profilePicture;
      }

      await updateUser(user.id, {
        ...formDataToUpdate,
        profile_picture: profilePicture,
      });
      if (uploadedPicture) void removeUnusedUpload("avatars", previousPicture, uploadedPicture);
      uploadedPicture = null;
      const bioValue = formData.bio.trim() || null;
      const yearsValue = formData.yearsOfExperience ? parseInt(formData.yearsOfExperience, 10) : null;
      const tutorUpdates: Partial<TutorProfile> = {
        bio: bioValue,
        years_of_experience: Number.isNaN(yearsValue) ? null : yearsValue,
      };
      await updateTutorProfile(tutorId, tutorUpdates);
      void requestCatalogRevalidation();
      onTutorProfileUpdated?.(tutorUpdates);
      await refreshUser();
      toast.success(t("profileUpdated"));
      setAvatarFile(null);
      onClose();
    } catch (err) {
      // The new picture was never saved on the profile: drop the upload.
      if (uploadedPicture) void removeUnusedUpload("avatars", uploadedPicture);
      console.error("Error updating profile:", err);
      toast.error(t("updateError"));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isUploadableImage(file)) {
      toast.error(t("invalidImageType"));
      return;
    }

    setAvatarFile(file);
  };

  const avatarPreviewUrl = avatarFile
    ? URL.createObjectURL(avatarFile)
    : user?.profile_picture
      ? user.profile_picture.startsWith("http")
        ? user.profile_picture
        : getPublicUrl("avatars", user.profile_picture)
      : null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setAvatarFile(null);
          onClose();
        }
      }}
    >
      <DialogContent
        data-theme="freetime"
        className="flex min-h-0 max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col overflow-hidden border-ft-line bg-ft-paper p-0 text-ft-ink sm:max-w-[600px] sm:rounded-ft-2xl"
      >
        <DialogHeader className="shrink-0 px-4 pt-6 sm:px-6">
          <DialogTitle className="text-[20px] font-semibold tracking-[-0.02em] text-ft-ink">
            {t("editProfile")}
          </DialogTitle>
          <DialogDescription className="text-ft-ink-3">{t("editProfileDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div
            ref={dialogBodyScrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-1 sm:px-6"
          >
            <div className="space-y-2">
            <Label htmlFor="username" className={FT_LABEL}>{t("name")}</Label>
            <Input
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder={t("namePlaceholder") || "Nombre completo"}
              className={FT_FIELD}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className={FT_LABEL}>{t("phone")}</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+34 123 456 789"
              className={FT_FIELD}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="country" className={FT_LABEL}>{t("country")}</Label>
            <SelectMenu
              id="country"
              value={formData.country}
              onValueChange={(country) =>
                setFormData((prev) => ({ ...prev, country }))
              }
              options={countryMenuOptions}
              aria-label={t("country")}
              nestedScrollParentRef={dialogBodyScrollRef}
              searchable
              searchPlaceholder={t("countrySearchPlaceholder")}
              emptySearchMessage={t("countrySearchEmpty")}
              triggerClassName={FT_SELECT_TRIGGER}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio" className={FT_LABEL}>{t("bio")}</Label>
            <Textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              placeholder={t("bioPlaceholder")}
              className={cn(FT_TEXTAREA, "min-h-[100px] resize-y")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar_file" className={FT_LABEL}>{t("uploadNewPhoto")}</Label>
            <Input
              id="avatar_file"
              name="avatar_file"
              type="file"
              accept={UPLOADABLE_IMAGE_ACCEPT}
              onChange={handleAvatarChange}
              className={cn(FT_FIELD, "file:mr-3 file:text-ft-ink-2")}
            />
            {avatarPreviewUrl ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-full border border-ft-line">
                <Image
                  src={avatarPreviewUrl}
                  alt={t("profilePicturePreviewAlt")}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="yearsOfExperience" className={FT_LABEL}>{t("experience")}</Label>
            <Input
              id="yearsOfExperience"
              name="yearsOfExperience"
              type="number"
              min="0"
              max="99"
              value={formData.yearsOfExperience}
              onChange={handleChange}
              placeholder={t("experiencePlaceholder")}
              className={FT_FIELD}
            />
          </div>

          </div>
          <DialogFooter className="mt-auto flex shrink-0 flex-col gap-2 border-t border-ft-line bg-ft-paper px-4 pt-3 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] sm:flex-row sm:justify-end sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} className={FT_BTN_OUTLINE}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading} className={FT_BTN_PRIMARY}>
              {loading ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
