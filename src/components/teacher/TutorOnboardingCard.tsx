"use client";

import { ArrowRight, Check } from "lucide-react";

import { useTranslations } from "@/i18n/translations";
import { cn } from "@/lib/utils";

export type TutorOnboardingStep = {
  id: "profile" | "availability" | "course";
  done: boolean;
  onAction: () => void;
};

/**
 * Checklist shown to tutors until they can receive bookings (FRE0013
 * G-signup-6): profile, weekly availability and a first course. Hidden once
 * every step is done.
 */
export default function TutorOnboardingCard({ steps }: { steps: TutorOnboardingStep[] }) {
  const t = useTranslations("teacherProfile.onboarding");
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;

  return (
    <section className="rounded-ft-lg border border-ft-line bg-ft-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[15px] font-semibold tracking-tight text-ft-ink">{t("title")}</h2>
          <p className="mt-1 text-[13px] text-ft-ink-3">{t("description")}</p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-ft-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ft-ink-2">
          {t("progress", { done: doneCount, total: steps.length })}
        </span>
      </div>

      <ol className="mt-4 space-y-2.5">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-3 rounded-ft border p-3.5",
              step.done ? "border-ft-line-soft bg-ft-surface-1" : "border-ft-line bg-ft-paper"
            )}
          >
            <span
              className={cn(
                "grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[12px] font-bold",
                step.done ? "bg-ft-accent-soft text-ft-accent-deep" : "bg-ft-ink text-ft-paper"
              )}
            >
              {step.done ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "m-0 text-[14px] font-semibold tracking-tight",
                  step.done ? "text-ft-ink-3 line-through" : "text-ft-ink"
                )}
              >
                {t(`${step.id}.title`)}
              </p>
              {!step.done && (
                <p className="mt-0.5 text-[12px] text-ft-ink-3">{t(`${step.id}.description`)}</p>
              )}
            </div>
            {step.done ? (
              <span className="text-[12px] font-semibold text-ft-accent-deep">{t("done")}</span>
            ) : (
              <button
                type="button"
                onClick={step.onAction}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-ft-ink px-3.5 py-2 text-[12px] font-semibold text-ft-paper hover:bg-[#2a241b]"
              >
                {t(`${step.id}.action`)}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
