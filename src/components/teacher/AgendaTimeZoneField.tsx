"use client";

import { useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { toast } from "sonner";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import { FT_BTN_PRIMARY, FT_FIELD } from "@/components/teacher/ftStyles";
import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "@/i18n/translations";
import { cn } from "@/lib/utils";
import { isValidTimeZone } from "@/lib/datetime/zonedTime";
import { timeZoneLabel, useViewerTimeZone } from "@/lib/datetime/viewerTime";

function zoneName(timeZone: string, locale: string): string {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  return `${city} (${timeZoneLabel(locale, timeZone)})`;
}

/**
 * Zone of the tutor's agenda (PRP-002). A tutor without one confirms it
 * (pre-filled with the browser zone) before adding windows; changing it keeps
 * the windows' local hours.
 */
export default function AgendaTimeZoneField({
  timeZone,
  onSaved,
}: {
  /** Stored tutor_profiles.timezone; null when the tutor never set it. */
  timeZone: string | null;
  onSaved: (timeZone: string) => void;
}) {
  const t = useTranslations("teacherProfile.agendaTimeZone");
  const locale = useLocale();
  const browserZone = useViewerTimeZone();
  const zones = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    const all = new Set([...supported, browserZone, ...(timeZone ? [timeZone] : [])]);
    return [...all].filter((zone) => isValidTimeZone(zone)).sort();
  }, [browserZone, timeZone]);

  const [editing, setEditing] = useState(timeZone == null);
  const [draft, setDraft] = useState(timeZone ?? browserZone);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/availability/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: draft }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(draft);
      setEditing(false);
      setConfirmOpen(false);
      toast.success(t("saved"));
    } catch (err) {
      console.error("[AgendaTimeZoneField] save failed:", err);
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!editing && timeZone) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 rounded-ft border border-ft-line-soft bg-ft-surface-1 px-3 py-2 text-[13px] text-ft-ink-2">
          <Globe className="h-4 w-4 text-ft-ink-3" />
          <span>{t("current", { zone: zoneName(timeZone, locale) })}</span>
          <button
            type="button"
            onClick={() => {
              setDraft(timeZone);
              setEditing(true);
            }}
            className="font-semibold text-ft-ink underline-offset-2 hover:underline"
          >
            {t("change")}
          </button>
        </div>
        {browserZone !== timeZone && (
          <p className="text-[12px] text-ft-ink-3">
            {t("browserDiffers", { browser: zoneName(browserZone, locale), zone: zoneName(timeZone, locale) })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-ft border border-ft-line bg-ft-surface-1 p-3">
      <p className="m-0 text-[13px] font-semibold text-ft-ink">
        {timeZone ? t("changeTitle") : t("confirmTitle")}
      </p>
      <p className="m-0 text-[12px] text-ft-ink-3">{t("confirmDescription")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label={t("selectLabel")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={cn(FT_FIELD, "h-10 flex-1")}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <Button
          type="button"
          disabled={saving}
          onClick={() => (timeZone && draft !== timeZone ? setConfirmOpen(true) : void save())}
          className={FT_BTN_PRIMARY}
        >
          {timeZone ? t("changeAction") : t("confirmAction")}
        </Button>
        {timeZone && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            {t("cancel")}
          </Button>
        )}
      </div>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("changeDialogTitle")}
        description={t("changeDialogDescription", { zone: zoneName(draft, locale) })}
        cancelLabel={t("cancel")}
        confirmLabel={t("changeAction")}
        loading={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void save()}
      />
    </div>
  );
}
