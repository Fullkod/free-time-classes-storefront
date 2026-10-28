"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FT_BTN_OUTLINE,
  FT_BTN_PRIMARY,
  FT_FIELD,
  FT_LABEL,
} from "@/components/teacher/ftStyles";
import { useTranslations } from "@/i18n/translations";
import { useEffect, useState } from "react";
import { epochToWallClock, wallClockToEpoch } from "@/lib/datetime/zonedTime";

interface AddAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Selected start as tutor wall-clock (`YYYY-MM-DDTHH:mm`). */
  initialWallClock?: string;
  /** Zone of the tutor's agenda (PRP-002): the date and times are entered in it. */
  tutorTimeZone: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Next full hour in the tutor's zone, as wall-clock `YYYY-MM-DDTHH:mm`. */
function nextHourWallClock(timeZone: string): string {
  const now = epochToWallClock(Date.now(), timeZone);
  const hourStart = wallClockToEpoch(`${now.slice(0, 13)}:00:00`, timeZone) ?? Date.now();
  return epochToWallClock(hourStart + 60 * 60_000, timeZone).slice(0, 16);
}

/** Wall-clock `YYYY-MM-DDTHH:mm` plus one hour (calendar arithmetic). */
function plusOneHour(wallClock: string): string {
  const [date, time] = wallClock.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d, h + 1, mi));
  return `${shifted.toISOString().slice(0, 10)}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/**
 * Adds a one-off availability window (an "extra" exception) on a date.
 * Students book courses inside it; open times are computed (PRP-001).
 */
export default function AddAvailabilityModal({
  isOpen,
  onClose,
  onSuccess,
  initialWallClock,
  tutorTimeZone,
}: AddAvailabilityModalProps) {
  const t = useTranslations("teacherProfile.addAvailabilityModal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ date: "", start: "", end: "" });

  // Keep the form synced when opening the modal from a calendar selection.
  useEffect(() => {
    if (!isOpen) return;
    const start = initialWallClock ?? nextHourWallClock(tutorTimeZone);
    const end = plusOneHour(start);
    setFormData({
      date: start.slice(0, 10),
      start: start.slice(11, 16),
      end: end.slice(0, 10) === start.slice(0, 10) ? end.slice(11, 16) : "23:59",
    });
    setError(null);
  }, [isOpen, initialWallClock, tutorTimeZone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (formData.end <= formData.start) {
      setError(t("endAfterStart"));
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/availability/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "extra",
          exception_date: formData.date,
          start_time: formData.start,
          end_time: formData.end,
        }),
      });
      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        setError(json.code === "window_in_past" ? t("windowInPast") : t("createError"));
        return;
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error creating availability window:", err);
      setError(t("createError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        data-theme="freetime"
        className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden border-ft-line bg-ft-paper p-0 text-ft-ink sm:max-w-[525px] sm:rounded-ft-2xl"
      >
        <DialogHeader className="px-4 pt-6 sm:px-6">
          <DialogTitle className="text-[20px] font-semibold tracking-[-0.02em] text-ft-ink">
            {t("title")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-1 sm:px-6">
            <p className="text-sm text-ft-ink-3">{t("description")}</p>
            {error && (
              <div className="rounded-ft border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="extra-date" className={FT_LABEL}>{t("date")}</Label>
              <Input
                id="extra-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                required
                className={FT_FIELD}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="extra-start" className={FT_LABEL}>{t("start")}</Label>
                <Input
                  id="extra-start"
                  type="time"
                  step={1800}
                  value={formData.start}
                  onChange={(e) => setFormData((p) => ({ ...p, start: e.target.value }))}
                  required
                  className={FT_FIELD}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extra-end" className={FT_LABEL}>{t("end")}</Label>
                <Input
                  id="extra-end"
                  type="time"
                  step={1800}
                  value={formData.end}
                  onChange={(e) => setFormData((p) => ({ ...p, end: e.target.value }))}
                  required
                  className={FT_FIELD}
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex shrink-0 justify-end gap-2 border-t border-ft-line bg-ft-paper px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className={FT_BTN_OUTLINE}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading} className={FT_BTN_PRIMARY}>
              {loading ? t("creating") : t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
