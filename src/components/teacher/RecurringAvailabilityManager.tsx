"use client";

import { Button } from "@/components/ui/button";
import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  FT_BTN_OUTLINE,
  FT_BTN_PRIMARY,
  FT_CARD,
  FT_FIELD,
  FT_SELECT_TRIGGER,
} from "@/components/teacher/ftStyles";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/translations";
import { createClient } from "@/lib/supabase/client";
import AgendaTimeZoneField from "@/components/teacher/AgendaTimeZoneField";
import type { AvailabilityException, TutorAvailabilityRule } from "@/types/availability";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface RecurringAvailabilityManagerProps {
  tutorId: string;
  onChanged?: () => void;
  /** Zone of the agenda (PRP-002); null until the tutor confirms it. */
  tutorTimeZone: string | null;
  onTimeZoneSaved: (timeZone: string) => void;
}

function formatTimeHm(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export default function RecurringAvailabilityManager({
  tutorId,
  onChanged,
  tutorTimeZone,
  onTimeZoneSaved,
}: RecurringAvailabilityManagerProps) {
  const t = useTranslations("teacherProfile.recurringAvailability");
  const tTeacher = useTranslations("teacherProfile");

  const [rules, setRules] = useState<TutorAvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loading, setLoading] = useState(true);

  const [ruleForm, setRuleForm] = useState({
    day_of_week: "1",
    start_time: "16:00",
    end_time: "18:00",
  });
  const [ruleSaving, setRuleSaving] = useState(false);

  const [blockForm, setBlockForm] = useState({
    exception_date: "",
    start_time: "",
    end_time: "",
    reason: "",
  });
  const [blockSaving, setBlockSaving] = useState(false);

  const [extraForm, setExtraForm] = useState({
    exception_date: "",
    start_time: "10:00",
    end_time: "12:00",
    reason: "",
  });
  const [extraSaving, setExtraSaving] = useState(false);

  const [deleteRuleDialogOpen, setDeleteRuleDialogOpen] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);

  const [deleteExceptionDialogOpen, setDeleteExceptionDialogOpen] =
    useState(false);
  const [deleteExceptionId, setDeleteExceptionId] = useState<string | null>(
    null
  );
  const [deletingException, setDeletingException] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    try {
      setLoading(true);
      const [rulesRes, exRes] = await Promise.all([
        supabase
          .from("tutor_availability")
          .select("*")
          .eq("tutor_id", tutorId)
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("availability_exceptions")
          .select("*")
          .eq("tutor_id", tutorId)
          .order("exception_date", { ascending: false }),
      ]);

      if (rulesRes.error) {
        console.error(rulesRes.error);
        toast.error(t("loadRulesError"));
        setRules([]);
      } else {
        setRules((rulesRes.data || []) as TutorAvailabilityRule[]);
      }

      if (exRes.error) {
        console.error(exRes.error);
        toast.error(t("loadExceptionsError"));
        setExceptions([]);
      } else {
        setExceptions((exRes.data || []) as AvailabilityException[]);
      }
    } catch (e) {
      console.error(e);
      toast.error(t("loadRulesError"));
    } finally {
      setLoading(false);
    }
  }, [tutorId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const weekdayLabel = (d: number) => t(`weekdays.${d}`);

  const weekdayMenuOptions = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        value: String(d),
        label: t(`weekdays.${d}`),
      })),
    [t]
  );

  const raSelectTrigger = FT_SELECT_TRIGGER;

  const submitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorTimeZone) {
      toast.error(t("needZoneFirst"));
      return;
    }
    try {
      setRuleSaving(true);
      const res = await fetch(`/api/availability/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day_of_week: parseInt(ruleForm.day_of_week, 10),
          start_time: ruleForm.start_time,
          end_time: ruleForm.end_time,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || t("ruleSaveError"));
      }
      toast.success(t("windowSaved"));
      onChanged?.();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ruleSaveError"));
    } finally {
      setRuleSaving(false);
    }
  };

  const openDeleteRuleDialog = (id: string) => {
    setDeleteRuleId(id);
    setDeleteRuleDialogOpen(true);
  };

  const performDeleteRule = async () => {
    if (!deleteRuleId) return;
    try {
      setDeletingRule(true);
      const res = await fetch(
        `/api/availability/rules/${deleteRuleId}`,
        {
        method: "DELETE",
        }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || t("ruleDeleteError"));
      }
      toast.success(t("ruleDeleted"));
      onChanged?.();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ruleDeleteError"));
    } finally {
      setDeletingRule(false);
      setDeleteRuleDialogOpen(false);
    }
  };

  const submitBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorTimeZone) {
      toast.error(t("needZoneFirst"));
      return;
    }
    if (!blockForm.exception_date) {
      toast.error(t("pickDate"));
      return;
    }
    const hasPartial =
      Boolean(blockForm.start_time) || Boolean(blockForm.end_time);
    if (hasPartial && (!blockForm.start_time || !blockForm.end_time)) {
      toast.error(t("blockTimesBothOrNone"));
      return;
    }
    try {
      setBlockSaving(true);
      const res = await fetch(`/api/availability/exceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "blocked",
          exception_date: blockForm.exception_date,
          start_time: hasPartial ? blockForm.start_time : null,
          end_time: hasPartial ? blockForm.end_time : null,
          reason: blockForm.reason || null,
        }),
      });
      const json = (await res.json()) as { error?: string; bookedConflicts?: number };
      if (!res.ok) {
        throw new Error(json.error || t("exceptionSaveError"));
      }
      toast.success(t("blockSaved"));
      if (json.bookedConflicts) {
        toast.warning(t("blockOverlapsBooked", { count: json.bookedConflicts }));
      }
      setBlockForm({
        exception_date: "",
        start_time: "",
        end_time: "",
        reason: "",
      });
      onChanged?.();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exceptionSaveError"));
    } finally {
      setBlockSaving(false);
    }
  };

  const submitExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorTimeZone) {
      toast.error(t("needZoneFirst"));
      return;
    }
    if (!extraForm.exception_date) {
      toast.error(t("pickDate"));
      return;
    }
    try {
      setExtraSaving(true);
      const res = await fetch(`/api/availability/exceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "extra",
          exception_date: extraForm.exception_date,
          start_time: extraForm.start_time,
          end_time: extraForm.end_time,
          reason: extraForm.reason || null,
        }),
      });
      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        throw new Error(
          json.code === "window_in_past" ? t("windowInPast") : json.error || t("exceptionSaveError")
        );
      }
      toast.success(t("extraWindowSaved"));
      onChanged?.();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exceptionSaveError"));
    } finally {
      setExtraSaving(false);
    }
  };

  const openDeleteExceptionDialog = (id: string) => {
    setDeleteExceptionId(id);
    setDeleteExceptionDialogOpen(true);
  };

  const performDeleteException = async () => {
    if (!deleteExceptionId) return;
    try {
      setDeletingException(true);
      const res = await fetch(
        `/api/availability/exceptions/${deleteExceptionId}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || t("exceptionDeleteError"));
      }
      toast.success(t("exceptionDeleted"));
      onChanged?.();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exceptionDeleteError"));
    } finally {
      setDeletingException(false);
      setDeleteExceptionDialogOpen(false);
    }
  };

  if (loading && rules.length === 0 && exceptions.length === 0) {
    return (
      <div className="flex justify-center py-8 text-sm text-ft-ink-3">
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmActionDialog
        open={deleteRuleDialogOpen}
        onOpenChange={setDeleteRuleDialogOpen}
        title={t("confirmDeleteRule")}
        cancelLabel={tTeacher("cancel")}
        confirmLabel={deletingRule ? tTeacher("saving") : tTeacher("confirm")}
        loading={deletingRule}
        onCancel={() => setDeleteRuleDialogOpen(false)}
        onConfirm={() => void performDeleteRule()}
      />

      <ConfirmActionDialog
        open={deleteExceptionDialogOpen}
        onOpenChange={setDeleteExceptionDialogOpen}
        title={t("confirmDeleteException")}
        cancelLabel={tTeacher("cancel")}
        confirmLabel={deletingException ? tTeacher("saving") : tTeacher("confirm")}
        loading={deletingException}
        onCancel={() => setDeleteExceptionDialogOpen(false)}
        onConfirm={() => void performDeleteException()}
      />

      <Card className={FT_CARD}>
        <CardHeader>
          <CardTitle className="text-ft-ink">{t("weeklyTitle")}</CardTitle>
          <CardDescription className="text-ft-ink-3">{t("weeklyDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AgendaTimeZoneField timeZone={tutorTimeZone} onSaved={onTimeZoneSaved} />
          <p className="text-xs text-ft-ink-3">{t("weeklyGenerationNote")}</p>
          <form onSubmit={submitRule} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ra-day">{t("weekday")}</Label>
              <SelectMenu
                id="ra-day"
                value={ruleForm.day_of_week}
                onValueChange={(day_of_week) =>
                  setRuleForm((p) => ({ ...p, day_of_week }))
                }
                options={weekdayMenuOptions}
                disabled={ruleSaving}
                aria-label={t("weekday")}
                triggerClassName={raSelectTrigger}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-start">{t("windowStart")}</Label>
              <Input
                id="ra-start"
                type="time"
                value={ruleForm.start_time}
                onChange={(e) =>
                  setRuleForm((p) => ({ ...p, start_time: e.target.value }))
                }
                required
                className={FT_FIELD}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-end">{t("windowEnd")}</Label>
              <Input
                id="ra-end"
                type="time"
                value={ruleForm.end_time}
                onChange={(e) =>
                  setRuleForm((p) => ({ ...p, end_time: e.target.value }))
                }
                required
                className={FT_FIELD}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={ruleSaving} className={cn(FT_BTN_PRIMARY, "w-full sm:w-auto")}>
                {ruleSaving ? t("saving") : t("addRule")}
              </Button>
            </div>
          </form>

          {rules.length > 0 && (
            <ul className="divide-y divide-ft-line rounded-ft border border-ft-line text-sm text-ft-ink-2">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    <span className="font-medium">{weekdayLabel(r.day_of_week)}</span>
                    {" · "}
                    {formatTimeHm(r.start_time)}–{formatTimeHm(r.end_time)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDeleteRuleDialog(r.id)}
                    className={FT_BTN_OUTLINE}
                  >
                    {t("remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className={FT_CARD}>
        <CardHeader>
          <CardTitle className="text-ft-ink">{t("exceptionsTitle")}</CardTitle>
          <CardDescription className="text-ft-ink-3">{t("exceptionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="rounded-ft border border-ft-line bg-ft-surface-1/50 px-3 py-2 text-xs text-ft-ink-3">
            <p>
              <span className="font-medium text-red-700">{t("typeBlocked")}</span>:{" "}
              {t("typeBlockedHelp")}
            </p>
            <p className="mt-1">
              <span className="font-medium text-emerald-700">{t("typeExtra")}</span>:{" "}
              {t("typeExtraHelp")}
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-ft-ink">
              {t("blockTitle")}
            </h4>
            <form
              onSubmit={submitBlock}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div className="space-y-2">
                <Label htmlFor="blk-date">{t("date")}</Label>
                <Input
                  id="blk-date"
                  type="date"
                  value={blockForm.exception_date}
                  onChange={(e) =>
                    setBlockForm((p) => ({ ...p, exception_date: e.target.value }))
                  }
                  required
                  className={FT_FIELD}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blk-start">{t("optionalStart")}</Label>
                <Input
                  id="blk-start"
                  type="time"
                  value={blockForm.start_time}
                  onChange={(e) =>
                    setBlockForm((p) => ({ ...p, start_time: e.target.value }))
                  }
                  className={FT_FIELD}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blk-end">{t("optionalEnd")}</Label>
                <Input
                  id="blk-end"
                  type="time"
                  value={blockForm.end_time}
                  onChange={(e) =>
                    setBlockForm((p) => ({ ...p, end_time: e.target.value }))
                  }
                  className={FT_FIELD}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="blk-reason">{t("reasonOptional")}</Label>
                <Input
                  id="blk-reason"
                  value={blockForm.reason}
                  onChange={(e) =>
                    setBlockForm((p) => ({ ...p, reason: e.target.value }))
                  }
                  placeholder={t("reasonPlaceholder")}
                  className={FT_FIELD}
                />
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={blockSaving} className={FT_BTN_PRIMARY}>
                  {blockSaving ? t("saving") : t("saveBlock")}
                </Button>
              </div>
            </form>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-ft-ink">
              {t("extraTitle")}
            </h4>
            <form
              onSubmit={submitExtra}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <div className="space-y-2">
                <Label htmlFor="ex-date">{t("date")}</Label>
                <Input
                  id="ex-date"
                  type="date"
                  value={extraForm.exception_date}
                  onChange={(e) =>
                    setExtraForm((p) => ({ ...p, exception_date: e.target.value }))
                  }
                  required
                  className={FT_FIELD}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-start">{t("windowStart")}</Label>
                <Input
                  id="ex-start"
                  type="time"
                  value={extraForm.start_time}
                  onChange={(e) =>
                    setExtraForm((p) => ({ ...p, start_time: e.target.value }))
                  }
                  required
                  className={FT_FIELD}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-end">{t("windowEnd")}</Label>
                <Input
                  id="ex-end"
                  type="time"
                  value={extraForm.end_time}
                  onChange={(e) =>
                    setExtraForm((p) => ({ ...p, end_time: e.target.value }))
                  }
                  required
                  className={FT_FIELD}
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="ex-reason">{t("reasonOptional")}</Label>
                <Input
                  id="ex-reason"
                  value={extraForm.reason}
                  onChange={(e) =>
                    setExtraForm((p) => ({ ...p, reason: e.target.value }))
                  }
                  className={FT_FIELD}
                />
              </div>
              <div>
                <Button type="submit" disabled={extraSaving} className={FT_BTN_PRIMARY}>
                  {extraSaving ? t("saving") : t("saveExtra")}
                </Button>
              </div>
            </form>
          </div>

          {exceptions.length > 0 && (
            <ul className="divide-y divide-ft-line rounded-ft border border-ft-line text-sm text-ft-ink-2">
              {exceptions.map((ex) => (
                <li
                  key={ex.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    <span
                      className={`font-medium ${
                        ex.type === "blocked" ? "text-red-700" : "text-emerald-700"
                      }`}
                    >
                      {ex.type === "blocked" ? t("typeBlocked") : t("typeExtra")}
                    </span>
                    {" · "}
                    {ex.exception_date}
                    {ex.start_time && ex.end_time
                      ? ` · ${formatTimeHm(ex.start_time)}–${formatTimeHm(ex.end_time)}`
                      : ex.type === "blocked"
                        ? ` · ${t("fullDay")}`
                        : ""}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDeleteExceptionDialog(ex.id)}
                    className={FT_BTN_OUTLINE}
                  >
                    {t("remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

