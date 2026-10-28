"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FT_BTN_PRIMARY, FT_FIELD } from "@/components/teacher/ftStyles";
import { useTranslations } from "@/i18n/translations";
import { getSubjects } from "@/lib/supabase/queries/subjects";
import {
  addTutorSubject,
  getTutorSubjectDetails,
  removeTutorSubject,
} from "@/lib/supabase/queries/tutors";
import type { Subject } from "@/types/subject";
import { useEffect, useMemo, useState } from "react";
import { requestCatalogRevalidation } from "@/lib/catalog/revalidate";

interface TutorSubjectsManagerProps {
  tutorId: string;
  initialSubjects: Subject[];
  onSubjectsUpdated: (subjects: Subject[]) => void;
}

export default function TutorSubjectsManager({
  tutorId,
  initialSubjects,
  onSubjectsUpdated,
}: TutorSubjectsManagerProps) {
  const t = useTranslations("teacherProfile.subjectsManager");
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<number>>(
    () => new Set(initialSubjects.map((subject) => subject.id))
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSubjectIds(new Set(initialSubjects.map((subject) => subject.id)));
  }, [initialSubjects]);

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const subjects = await getSubjects();
        setAllSubjects(subjects);
      } catch (err) {
        console.error("Error loading subjects catalog:", err);
        setError(t("loadCatalogError"));
      } finally {
        setIsLoading(false);
      }
    };

    void loadSubjects();
  }, [t]);

  const selectedCount = selectedSubjectIds.size;
  const hasSubjects = allSubjects.length > 0;

  const selectedSubjects = useMemo(
    () =>
      allSubjects.filter((subject) => selectedSubjectIds.has(subject.id)).slice(0, 8),
    [allSubjects, selectedSubjectIds]
  );

  const toggleSubject = async (subjectId: number) => {
    if (isSaving) {
      return;
    }

    const wasSelected = selectedSubjectIds.has(subjectId);

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      if (wasSelected) {
        await removeTutorSubject(tutorId, subjectId);
      } else {
        await addTutorSubject(tutorId, subjectId);
      }
      void requestCatalogRevalidation();

      const updated = await getTutorSubjectDetails(tutorId);
      setSelectedSubjectIds(new Set(updated.map((subject) => subject.id)));
      onSubjectsUpdated(updated);
      setSuccessMessage(t("saved"));
    } catch (err) {
      console.error("Error updating tutor subjects:", err);
      setError(t("updateError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSubject = async () => {
    const normalizedName = newSubjectName.trim();

    if (!normalizedName) {
      setError(t("emptyNameError"));
      return;
    }

    const alreadyExists = allSubjects.some(
      (subject) => subject.name.toLowerCase() === normalizedName.toLowerCase()
    );

    if (alreadyExists) {
      setError(t("duplicateNameError"));
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/subjects/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName }),
      });

      const json = (await res.json()) as { error?: string; createdSubjectId?: number };

      if (!res.ok) {
        throw new Error(json.error || t("createError"));
      }

      const [updatedCatalog, updatedSelectedSubjects] = await Promise.all([
        getSubjects({ fresh: true }),
        getTutorSubjectDetails(tutorId),
      ]);

      setAllSubjects(updatedCatalog);
      setSelectedSubjectIds(
        new Set(updatedSelectedSubjects.map((subject) => subject.id))
      );
      onSubjectsUpdated(updatedSelectedSubjects);
      setNewSubjectName("");
      setSuccessMessage(t("createdAndSelected"));
    } catch (err) {
      console.error("Error creating subject:", err);
      setError(err instanceof Error ? err.message : t("createError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full rounded-ft-2xl border-ft-line bg-ft-paper shadow-none">
      <CardHeader>
        <CardTitle className="text-ft-ink">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ft-ink-3">
          {t("description")} {selectedCount > 0 ? `(${selectedCount})` : ""}
        </p>

        {isLoading ? (
          <p className="text-sm text-ft-ink-3">{t("loading")}</p>
        ) : !hasSubjects ? (
          <p className="text-sm text-ft-ink-3">{t("emptyCatalog")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allSubjects.map((subject) => {
              const isSelected = selectedSubjectIds.has(subject.id);

              return (
                <div
                  key={subject.id}
                  className="inline-flex items-center overflow-hidden rounded-ft border border-ft-line bg-ft-surface-1"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto rounded-none px-3 py-2 shadow-none",
                      isSelected
                        ? "bg-gradient-to-br from-ft-accent to-ft-accent-deep text-ft-paper hover:opacity-90"
                        : "bg-transparent text-ft-ink-2 hover:bg-ft-surface-2"
                    )}
                    disabled={isSaving}
                    onClick={() => {
                      void toggleSubject(subject.id);
                    }}
                  >
                    {subject.name}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-ft-ink-2">{t("createLabel")}</p>
          <div className="flex gap-2">
            <Input
              value={newSubjectName}
              onChange={(event) => setNewSubjectName(event.target.value)}
              placeholder={t("createPlaceholder")}
              disabled={isSaving}
              className={FT_FIELD}
            />
            <Button
              type="button"
              disabled={isSaving}
              onClick={handleCreateSubject}
              className={FT_BTN_PRIMARY}
            >
              {isSaving ? t("creating") : t("createAction")}
            </Button>
          </div>
        </div>

        {selectedSubjects.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-ft-ink-2">{t("selectedLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {selectedSubjects.map((subject) => (
                <Badge
                  key={subject.id}
                  variant="secondary"
                  className="border-transparent bg-ft-surface-2 text-ft-ink-2 hover:bg-ft-surface-2"
                >
                  {subject.name}
                </Badge>
              ))}
              {selectedCount > selectedSubjects.length && (
                <Badge variant="outline" className="border-ft-line text-ft-ink-3">
                  +{selectedCount - selectedSubjects.length} {t("more")}
                </Badge>
              )}
            </div>
          </div>
        )}

        {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
