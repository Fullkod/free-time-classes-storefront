"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/UserContext";
import { useTranslations } from "@/i18n/translations";
import { toast } from "sonner";
import { Star } from "lucide-react";
import type { Review } from "@/types/review";
import { createReview } from "@/lib/supabase/queries/reviews";
import { cn } from "@/lib/utils";

export default function LeaveReviewModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: number | null;
  /** Si no hay reserva, reseña ligada a la lección completada (migración 018). */
  lessonId: number | null;
  tutorId: string | null;
  onCreated: (review: Review) => void;
}) {
  const { user } = useAuth();
  const t = useTranslations("studentProfile");

  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const MAX_COMMENT_LENGTH = 500;
  // Stored inside the comment text, in the reviewer's language.
  const highlightOptions = (["precise", "constructive", "inspiring", "expert", "punctual"] as const).map(
    (key) => t(`reviewHighlights.${key}`)
  );

  const isReady = useMemo(
    () =>
      Boolean(
        user?.id &&
          props.tutorId &&
          (props.bookingId != null || props.lessonId != null)
      ),
    [props.bookingId, props.lessonId, props.tutorId, user?.id]
  );

  useEffect(() => {
    if (!props.open) return;
    setRating(5);
    setComment("");
    setSelectedHighlights([]);
  }, [props.open, props.bookingId, props.lessonId, props.tutorId]);

  function toggleHighlight(tag: string) {
    setSelectedHighlights((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user?.id || !props.tutorId) return;
    if (props.bookingId == null && props.lessonId == null) return;

    const trimmed = comment.trim();
    if (trimmed.length === 0) {
      toast.error(t("reviewCommentRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const created = await createReview({
        ...(props.bookingId != null
          ? { booking_id: props.bookingId }
          : { lesson_id: props.lessonId! }),
        student_id: user.id,
        tutor_id: props.tutorId,
        rating,
        comment:
          selectedHighlights.length > 0
            ? `[${selectedHighlights.join(", ")}] ${trimmed}`
            : trimmed,
      });

      props.onCreated(created);
      toast.success(t("reviewSubmittedSuccess"));
      props.onOpenChange(false);
    } catch (err) {
      console.error("[reviews] createReview error:", err);
      toast.error(t("reviewSubmitError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        data-theme="freetime"
        className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] flex-col overflow-hidden rounded-ft-2xl border border-ft-line bg-ft-paper p-0 text-ft-ink shadow-[0_28px_80px_rgba(45,36,26,0.18)] sm:max-w-[640px] [&>button]:hidden"
      >
        <DialogHeader className="mb-1 px-5 pt-5 text-left sm:px-8 sm:pt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-extrabold tracking-tight text-ft-ink sm:text-2xl">
                {t("leaveReviewTitle")}
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-[54ch] text-sm leading-relaxed text-ft-ink-3">
                {t("leaveReviewDescription")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-4 pt-2 sm:px-8">
            <div className="rounded-ft bg-ft-surface-1 p-4 sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ft-accent-deep">
              {t("reviewRating")}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
              {Array.from({ length: 5 }).map((_, idx) => {
                const value = idx + 1;
                const active = value <= rating;
                return (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "rounded-full p-1 transition-transform hover:scale-110",
                      active ? "text-ft-accent" : "text-ft-surface-2"
                    )}
                    onClick={() => setRating(value)}
                    aria-label={`${value}/5`}
                  >
                    <Star
                      className={cn("h-8 w-8 sm:h-9 sm:w-9", active ? "text-ft-accent" : "text-ft-surface-2")}
                      fill={active ? "currentColor" : "transparent"}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ft-ink-3">
              {t("reviewHighlightsTitle")}
            </div>
            <div className="flex flex-wrap gap-2">
              {highlightOptions.map((option) => {
                const isActive = selectedHighlights.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleHighlight(option)}
                    className={cn(
                      "rounded-full px-4 py-2 text-xs font-semibold transition-colors sm:text-sm",
                      isActive
                        ? "bg-gradient-to-br from-ft-accent to-ft-accent-deep text-ft-paper shadow-none"
                        : "bg-ft-surface-1 text-ft-ink-2 hover:bg-ft-surface-2 hover:text-ft-ink"
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-ft-ink-2">{t("reviewComment")}</div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("reviewCommentPlaceholder")}
              maxLength={MAX_COMMENT_LENGTH}
              className="min-h-[140px] resize-none rounded-ft border border-ft-line bg-ft-surface-1 px-4 py-3 text-ft-ink placeholder:text-ft-ink-3 shadow-none focus-visible:border-ft-accent-deep focus-visible:ring-2 focus-visible:ring-ft-accent/40"
            />
            <div className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-ft-ink-3">
              {comment.length} / {MAX_COMMENT_LENGTH}
            </div>
          </div>

          </div>
          <DialogFooter className="mt-2 flex shrink-0 flex-col gap-3 border-t border-ft-line bg-ft-paper px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:gap-3 sm:px-8">
            <Button
              type="button"
              variant="ghost"
              className="h-12 w-full rounded-ft-md text-ft-ink-2 hover:bg-ft-surface-1 hover:text-ft-ink sm:order-1 sm:w-auto sm:min-w-[160px]"
              onClick={() => props.onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              className="h-12 w-full rounded-ft-md bg-gradient-to-br from-ft-accent to-ft-accent-deep font-semibold text-ft-paper shadow-none hover:opacity-90 sm:order-2 sm:w-auto sm:min-w-[190px]"
              disabled={!isReady || submitting}
            >
              {submitting ? t("reviewSubmitting") : t("reviewSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

