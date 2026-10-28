"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BrandLogo } from "@/components/ds/BrandLogo";

type Status = "success" | "error";

export default function AuthCallbackClient({ locale }: { locale: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const t = useTranslations("authCallback");

  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);

  // Signup link opened on another device: the email is confirmed anyway, so
  // show the success screen and send the user to sign in.
  const confirmedElsewhere = params.get("error") === "confirmed_other_device";

  const errorMessage = useMemo(() => {
    const err = params.get("error");
    if (!err || err === "confirmed_other_device") return null;
    if (err === "missing_code") return t("missingCode");
    if (err === "recovery_other_device") return t("recoveryOtherDevice");
    return decodeURIComponent(err);
  }, [params, t]);

  const status: Status = errorMessage ? "error" : "success";

  useEffect(() => {
    if (status !== "success") return;

    setRedirectSeconds(3);
    const interval = window.setInterval(() => {
      setRedirectSeconds((s) => (s === null ? s : Math.max(0, s - 1)));
    }, 1000);

    const timeout = window.setTimeout(() => {
      router.push(`/${locale}/login`);
    }, 3000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [status, router, locale]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-ft-paper px-7">
      <div className="w-full max-w-md text-center">
        {status === "success" ? (
          <div className="mx-auto mb-8 grid h-14 w-14 place-items-center rounded-ft-md bg-ft-ink text-ft-accent">
            <Check width={26} height={26} strokeWidth={2.2} />
          </div>
        ) : (
          <div className="mx-auto mb-8 grid h-14 w-14 place-items-center rounded-ft-md border border-red-200 bg-red-50 text-red-700">
            <X width={26} height={26} strokeWidth={2.2} />
          </div>
        )}

        <h1 className="m-0 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-ft-ink">
          {status === "success" ? t("successTitle") : t("errorTitle")}
        </h1>

        {status === "success" ? (
          <>
            <p className="mb-2 mt-3 text-sm text-ft-ink-2">
              {confirmedElsewhere ? t("confirmedOtherDevice") : t("successDescription")}
            </p>
            {redirectSeconds !== null && (
              <p className="mb-8 text-xs text-ft-ink-3">
                {t("autoRedirect", { seconds: redirectSeconds })}
              </p>
            )}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => router.push(`/${locale}/login`)}
                className="w-full rounded-ft-md bg-ft-ink px-4 py-4 text-sm font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
              >
                {t("goToLogin")}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/${locale}/dashboard`)}
                className="w-full rounded-ft-md border border-ft-line bg-ft-paper px-4 py-4 text-sm font-semibold text-ft-ink transition-colors hover:bg-ft-surface-1"
              >
                {t("goToDashboard")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-8 mt-3 text-sm text-ft-ink-2">
              {errorMessage || t("genericError")}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/${locale}/login`)}
              className="w-full rounded-ft-md bg-ft-ink px-4 py-4 text-sm font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
            >
              {t("goToLogin")}
            </button>
          </>
        )}

        <div className="mt-12 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ft-ink-3">
          <BrandLogo size={16} />
          FreeTime
        </div>
      </div>
    </div>
  );
}
