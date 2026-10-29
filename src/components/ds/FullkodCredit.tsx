"use client";

import { useLocale } from "next-intl";

/** "Developed by Fullkod" credit (CREA0004): the same credit on every screen. */
export function FullkodCredit({ className = "" }: { className?: string }) {
  const locale = useLocale();
  return (
    <a
      href="https://fullkod.com/?ref=free-time-classes"
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-1.5 text-[12px] text-ft-ink-3 transition-colors hover:text-ft-ink ${className}`}
    >
      {locale === "es" ? "Desarrollado por" : "Built by"}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/fullkod-symbol.svg" alt="" className="h-3.5 w-3.5" />
      <span className="font-semibold text-ft-ink-2">Fullkod</span>
    </a>
  );
}
