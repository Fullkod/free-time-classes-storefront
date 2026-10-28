"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FT_BTN_PRIMARY } from "@/components/teacher/ftStyles";
import { useTranslations } from "@/i18n/translations";
import { updateTutorProfile } from "@/lib/supabase/queries/tutors";
import type { TutorProfile } from "@/types/tutor";
import type {
  TutorCVData,
  CVEducation,
  CVCertification,
  CVExperience,
} from "@/types/tutor-cv";
import { parseCVData, stringifyCVData } from "@/types/tutor-cv";
import {
  Award,
  Briefcase,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { requestCatalogRevalidation } from "@/lib/catalog/revalidate";

const FT_FIELD_SM =
  "h-9 rounded-ft border-ft-line bg-ft-paper text-ft-ink placeholder:text-ft-ink-3 shadow-none focus-visible:ring-2 focus-visible:ring-ft-accent/40";
const FT_GHOST_SM =
  "h-8 gap-1 rounded-ft-md text-xs text-ft-ink-2 hover:bg-ft-surface-1 hover:text-ft-ink";

interface TutorCVSectionProps {
  tutorId: string;
  certifications: string | Record<string, unknown> | null | undefined;
  onTutorProfileUpdated?: (updates: Partial<TutorProfile>) => void;
}

type SectionKey = "education" | "certifications" | "experience";
type EditingState =
  | { section: SectionKey; id: string | null }
  | null;

export default function TutorCVSection({
  tutorId,
  certifications,
  onTutorProfileUpdated,
}: TutorCVSectionProps) {
  const t = useTranslations("teacherProfile.cv");
  const [cvData, setCvData] = useState<TutorCVData>(() =>
    parseCVData(certifications)
  );
  const [editing, setEditing] = useState<EditingState>(null);
  const [saving, setSaving] = useState(false);

  // --- Form drafts ---
  const [eduDraft, setEduDraft] = useState<CVEducation>({
    id: "",
    degree: "",
    institution: "",
    year: "",
  });
  const [certDraft, setCertDraft] = useState<CVCertification>({
    id: "",
    name: "",
    issuer: "",
    year: "",
  });
  const [expDraft, setExpDraft] = useState<CVExperience>({
    id: "",
    role: "",
    institution: "",
    period: "",
    description: "",
  });

  const persist = useCallback(
    async (next: TutorCVData) => {
      setSaving(true);
      try {
        const value = stringifyCVData(next);
        await updateTutorProfile(tutorId, { certifications: value });
        void requestCatalogRevalidation();
        setCvData(next);
        onTutorProfileUpdated?.({ certifications: value });
        toast.success(t("saved"));
      } catch (err) {
        console.error("Error saving CV data:", err);
        toast.error(t("saveError"));
      } finally {
        setSaving(false);
      }
    },
    [tutorId, onTutorProfileUpdated, t]
  );

  // --- Education ---
  const startAddEducation = () => {
    setEduDraft({ id: "", degree: "", institution: "", year: "" });
    setEditing({ section: "education", id: null });
  };
  const startEditEducation = (item: CVEducation) => {
    setEduDraft({ ...item });
    setEditing({ section: "education", id: item.id });
  };
  const saveEducation = async () => {
    if (!eduDraft.degree.trim()) return;
    let next: TutorCVData;
    if (editing?.id) {
      next = {
        ...cvData,
        education: cvData.education.map((e) =>
          e.id === editing.id ? { ...eduDraft } : e
        ),
      };
    } else {
      next = {
        ...cvData,
        education: [
          ...cvData.education,
          { ...eduDraft, id: crypto.randomUUID() },
        ],
      };
    }
    await persist(next);
    setEditing(null);
  };
  const deleteEducation = async (id: string) => {
    const next = {
      ...cvData,
      education: cvData.education.filter((e) => e.id !== id),
    };
    await persist(next);
  };

  // --- Certifications ---
  const startAddCert = () => {
    setCertDraft({ id: "", name: "", issuer: "", year: "" });
    setEditing({ section: "certifications", id: null });
  };
  const startEditCert = (item: CVCertification) => {
    setCertDraft({ ...item });
    setEditing({ section: "certifications", id: item.id });
  };
  const saveCert = async () => {
    if (!certDraft.name.trim()) return;
    let next: TutorCVData;
    if (editing?.id) {
      next = {
        ...cvData,
        certifications: cvData.certifications.map((c) =>
          c.id === editing.id ? { ...certDraft } : c
        ),
      };
    } else {
      next = {
        ...cvData,
        certifications: [
          ...cvData.certifications,
          { ...certDraft, id: crypto.randomUUID() },
        ],
      };
    }
    await persist(next);
    setEditing(null);
  };
  const deleteCert = async (id: string) => {
    const next = {
      ...cvData,
      certifications: cvData.certifications.filter((c) => c.id !== id),
    };
    await persist(next);
  };

  // --- Experience ---
  const startAddExp = () => {
    setExpDraft({ id: "", role: "", institution: "", period: "", description: "" });
    setEditing({ section: "experience", id: null });
  };
  const startEditExp = (item: CVExperience) => {
    setExpDraft({ ...item });
    setEditing({ section: "experience", id: item.id });
  };
  const saveExp = async () => {
    if (!expDraft.role.trim()) return;
    let next: TutorCVData;
    if (editing?.id) {
      next = {
        ...cvData,
        experience: cvData.experience.map((x) =>
          x.id === editing.id ? { ...expDraft } : x
        ),
      };
    } else {
      next = {
        ...cvData,
        experience: [
          ...cvData.experience,
          { ...expDraft, id: crypto.randomUUID() },
        ],
      };
    }
    await persist(next);
    setEditing(null);
  };
  const deleteExp = async (id: string) => {
    const next = {
      ...cvData,
      experience: cvData.experience.filter((x) => x.id !== id),
    };
    await persist(next);
  };

  const cancelEditing = () => setEditing(null);

  const isEditing = (section: SectionKey) => editing?.section === section;

  return (
    <Card className="rounded-ft-2xl border-ft-line bg-ft-paper shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl text-ft-ink">{t("title")}</CardTitle>
        <CardDescription className="text-ft-ink-3">
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ─── Education ─── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-ft bg-ft-accent-soft">
                <GraduationCap className="h-4 w-4 text-ft-accent-deep" />
              </div>
              <h3 className="font-semibold text-ft-ink">{t("education")}</h3>
            </div>
            {!isEditing("education") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startAddEducation}
                className="h-8 gap-1 rounded-ft-md border-ft-line bg-ft-paper text-xs text-ft-ink-2 shadow-none hover:bg-ft-surface-1 hover:text-ft-ink"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("add")}
              </Button>
            )}
          </div>

          {cvData.education.length === 0 && !isEditing("education") && (
            <p className="rounded-ft-lg border border-dashed border-ft-line bg-ft-surface-1/50 px-4 py-6 text-center text-sm text-ft-ink-3">
              {t("educationEmpty")}
            </p>
          )}

          <div className="space-y-2">
            {cvData.education.map((item) => (
              <div
                key={item.id}
                className="group flex items-center justify-between rounded-ft-lg border border-ft-line bg-ft-surface-1 px-4 py-3 transition-colors hover:bg-ft-surface-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <GraduationCap className="hidden h-4 w-4 shrink-0 text-ft-accent-deep sm:block" />
                  <span className="truncate text-sm text-ft-ink-2">
                    <span className="font-medium text-ft-ink">{item.degree}</span>
                    {item.institution && (
                      <span className="text-ft-ink-3"> · {item.institution}</span>
                    )}
                    {item.year && (
                      <span className="text-ft-ink-3"> · {item.year}</span>
                    )}
                  </span>
                </div>
                <div className="ml-2 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => startEditEducation(item)}
                    className="rounded-ft p-1.5 text-ft-ink-3 hover:bg-ft-surface-2 hover:text-ft-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEducation(item.id)}
                    disabled={saving}
                    className="rounded-ft p-1.5 text-ft-ink-3 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {isEditing("education") && (
            <div className="mt-2 space-y-3 rounded-ft-lg border border-ft-line bg-ft-surface-1/50 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("degree")} *</Label>
                  <Input
                    value={eduDraft.degree}
                    onChange={(e) =>
                      setEduDraft((d) => ({ ...d, degree: e.target.value }))
                    }
                    placeholder={t("degreePlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("institution")}</Label>
                  <Input
                    value={eduDraft.institution}
                    onChange={(e) =>
                      setEduDraft((d) => ({ ...d, institution: e.target.value }))
                    }
                    placeholder={t("institutionPlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("year")}</Label>
                  <Input
                    value={eduDraft.year}
                    onChange={(e) =>
                      setEduDraft((d) => ({ ...d, year: e.target.value }))
                    }
                    placeholder={t("yearPlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  className={FT_GHOST_SM}
                >
                  <X className="h-3.5 w-3.5" />
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveEducation}
                  disabled={saving || !eduDraft.degree.trim()}
                  className={cn(FT_BTN_PRIMARY, "h-8 gap-1 text-xs")}
                >
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          )}
        </section>

        <hr className="border-ft-line" />

        {/* ─── Certifications ─── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-ft-sm bg-amber-100">
                <Award className="h-4 w-4 text-amber-700" />
              </div>
              <h3 className="font-semibold text-slate-800">
                {t("certifications")}
              </h3>
            </div>
            {!isEditing("certifications") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startAddCert}
                className="h-8 gap-1 rounded-ft-md border-ft-line bg-ft-paper text-xs text-ft-ink-2 shadow-none hover:bg-ft-surface-1 hover:text-ft-ink"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("add")}
              </Button>
            )}
          </div>

          {cvData.certifications.length === 0 && !isEditing("certifications") && (
            <p className="rounded-ft-lg border border-dashed border-ft-line bg-ft-surface-1/50 px-4 py-6 text-center text-sm text-ft-ink-3">
              {t("certificationsEmpty")}
            </p>
          )}

          <div className="space-y-2">
            {cvData.certifications.map((item) => (
              <div
                key={item.id}
                className="group flex items-center justify-between rounded-ft-lg border border-ft-line bg-ft-surface-1 px-4 py-3 transition-colors hover:bg-ft-surface-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Award className="hidden h-4 w-4 shrink-0 text-amber-500 sm:block" />
                  <span className="truncate text-sm text-ft-ink-2">
                    <span className="font-medium text-ft-ink">{item.name}</span>
                    {item.issuer && (
                      <span className="text-ft-ink-3"> · {item.issuer}</span>
                    )}
                    {item.year && (
                      <span className="text-ft-ink-3"> · {item.year}</span>
                    )}
                  </span>
                </div>
                <div className="ml-2 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => startEditCert(item)}
                    className="rounded-ft p-1.5 text-ft-ink-3 hover:bg-ft-surface-2 hover:text-ft-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCert(item.id)}
                    disabled={saving}
                    className="rounded-ft p-1.5 text-ft-ink-3 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {isEditing("certifications") && (
            <div className="mt-2 space-y-3 rounded-ft-lg border border-ft-line bg-ft-surface-1/50 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("certName")} *</Label>
                  <Input
                    value={certDraft.name}
                    onChange={(e) =>
                      setCertDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    placeholder={t("certNamePlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("certIssuer")}</Label>
                  <Input
                    value={certDraft.issuer}
                    onChange={(e) =>
                      setCertDraft((d) => ({ ...d, issuer: e.target.value }))
                    }
                    placeholder={t("certIssuerPlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("year")}</Label>
                  <Input
                    value={certDraft.year}
                    onChange={(e) =>
                      setCertDraft((d) => ({ ...d, year: e.target.value }))
                    }
                    placeholder={t("yearPlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  className={FT_GHOST_SM}
                >
                  <X className="h-3.5 w-3.5" />
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveCert}
                  disabled={saving || !certDraft.name.trim()}
                  className={cn(FT_BTN_PRIMARY, "h-8 gap-1 text-xs")}
                >
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          )}
        </section>

        <hr className="border-ft-line" />

        {/* ─── Experience ─── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-ft-sm bg-emerald-100">
                <Briefcase className="h-4 w-4 text-emerald-700" />
              </div>
              <h3 className="font-semibold text-slate-800">
                {t("experience")}
              </h3>
            </div>
            {!isEditing("experience") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startAddExp}
                className="h-8 gap-1 rounded-ft-md border-ft-line bg-ft-paper text-xs text-ft-ink-2 shadow-none hover:bg-ft-surface-1 hover:text-ft-ink"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("add")}
              </Button>
            )}
          </div>

          {cvData.experience.length === 0 && !isEditing("experience") && (
            <p className="rounded-ft-lg border border-dashed border-ft-line bg-ft-surface-1/50 px-4 py-6 text-center text-sm text-ft-ink-3">
              {t("experienceEmpty")}
            </p>
          )}

          <div className="space-y-2">
            {cvData.experience.map((item) => (
              <div
                key={item.id}
                className="group rounded-ft-lg border border-ft-line bg-ft-surface-1 px-4 py-3 transition-colors hover:bg-ft-surface-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Briefcase className="hidden h-4 w-4 shrink-0 text-emerald-500 sm:block" />
                    <span className="truncate text-sm text-ft-ink-2">
                      <span className="font-medium text-ft-ink">{item.role}</span>
                      {item.institution && (
                        <span className="text-ft-ink-3"> · {item.institution}</span>
                      )}
                      {item.period && (
                        <span className="text-ft-ink-3"> · {item.period}</span>
                      )}
                    </span>
                  </div>
                  <div className="ml-2 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => startEditExp(item)}
                      className="rounded-ft p-1.5 text-ft-ink-3 hover:bg-ft-surface-2 hover:text-ft-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteExp(item.id)}
                      disabled={saving}
                      className="rounded-ft p-1.5 text-ft-ink-3 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {item.description && (
                  <p className="mt-1 pl-0 text-xs leading-relaxed text-ft-ink-3 sm:pl-6">
                    {item.description}
                  </p>
                )}
              </div>
            ))}
          </div>

          {isEditing("experience") && (
            <div className="mt-2 space-y-3 rounded-ft-lg border border-ft-line bg-ft-surface-1/50 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("role")} *</Label>
                  <Input
                    value={expDraft.role}
                    onChange={(e) =>
                      setExpDraft((d) => ({ ...d, role: e.target.value }))
                    }
                    placeholder={t("rolePlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("institution")}</Label>
                  <Input
                    value={expDraft.institution}
                    onChange={(e) =>
                      setExpDraft((d) => ({
                        ...d,
                        institution: e.target.value,
                      }))
                    }
                    placeholder={t("expInstitutionPlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-ft-ink-2">{t("period")}</Label>
                  <Input
                    value={expDraft.period}
                    onChange={(e) =>
                      setExpDraft((d) => ({ ...d, period: e.target.value }))
                    }
                    placeholder={t("periodPlaceholder")}
                    className={FT_FIELD_SM}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-ft-ink-2">{t("expDescription")}</Label>
                <Textarea
                  value={expDraft.description}
                  onChange={(e) =>
                    setExpDraft((d) => ({ ...d, description: e.target.value }))
                  }
                  placeholder={t("expDescriptionPlaceholder")}
                  className="min-h-[60px] resize-y rounded-ft border-ft-line bg-ft-paper text-ft-ink placeholder:text-ft-ink-3 shadow-none focus-visible:ring-2 focus-visible:ring-ft-accent/40"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  className={FT_GHOST_SM}
                >
                  <X className="h-3.5 w-3.5" />
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveExp}
                  disabled={saving || !expDraft.role.trim()}
                  className={cn(FT_BTN_PRIMARY, "h-8 gap-1 text-xs")}
                >
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
