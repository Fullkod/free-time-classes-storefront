"use client";

import { useState } from "react";
import { Link as LinkIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { FT_FIELD } from "@/components/teacher/ftStyles";
import { useTranslations } from "@/i18n/translations";
import { cn } from "@/lib/utils";

/**
 * Add or change the video call link of a booked upcoming class (G-prof-4).
 * The API checks ownership, status and that the class has not started.
 */
export default function MeetLinkEditor({
  lessonId,
  meetLink,
  onSaved,
}: {
  lessonId: number;
  meetLink: string | null;
  onSaved: (meetLink: string | null) => void;
}) {
  const t = useTranslations("bookingsPage.meetLink");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(meetLink ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/meet-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetLink: value }),
      });
      const json = (await res.json().catch(() => null)) as { code?: string } | null;
      if (json?.code === "invalid_meet_link") {
        toast.error(t("invalid"));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(value.trim() || null);
      setEditing(false);
      toast.success(t("saved"));
    } catch (err) {
      console.error("[MeetLinkEditor] save failed:", err);
      toast.error(t("error"));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(meetLink ?? "");
          setEditing(true);
        }}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-ft-ink-2 underline-offset-2 hover:text-ft-ink hover:underline"
      >
        <LinkIcon width={12} height={12} />
        {meetLink ? t("edit") : t("add")}
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("placeholder")}
        aria-label={t("label")}
        autoFocus
        className={cn(FT_FIELD, "min-w-0 flex-1 border px-3 text-[13px]")}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-10 items-center gap-1 rounded-ft-md bg-ft-ink px-4 text-[12px] font-semibold text-ft-paper disabled:opacity-60"
        >
          {saving && <Loader2 width={12} height={12} className="animate-spin" />}
          {t("save")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="h-10 rounded-ft-md border border-ft-line px-4 text-[12px] font-semibold text-ft-ink-2"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
