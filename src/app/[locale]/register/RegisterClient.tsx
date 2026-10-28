"use client";

import { useAuth } from "@/context/UserContext";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Brain,
  Eye,
  EyeOff,
  GraduationCap,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useState } from "react";

import { BrandLogo } from "@/components/ds/BrandLogo";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

type AccountType = "student" | "tutor" | "both";

const SIGNUP_ERROR_KEYS: Record<string, string> = {
  weak_password: "errors.weakPassword",
  user_already_exists: "errors.alreadyRegistered",
  email_exists: "errors.alreadyRegistered",
  email_address_invalid: "invalidEmail",
  over_email_send_rate_limit: "errors.rateLimited",
  over_request_rate_limit: "errors.rateLimited",
  signup_disabled: "errors.signupDisabled",
};

const LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3";
const INPUT =
  "mt-1.5 block w-full rounded-ft border border-ft-line bg-ft-surface-1 px-4 py-3.5 text-sm text-ft-ink outline-none transition-colors placeholder:text-ft-ink-3 focus:border-ft-accent-deep focus:bg-ft-paper";

const ROLE_OPTIONS: ReadonlyArray<{ value: AccountType; icon: LucideIcon }> = [
  { value: "student", icon: GraduationCap },
  { value: "tutor", icon: Brain },
  { value: "both", icon: Users },
];

// What each account type means, shown under the selector (G-signup-8).
const ROLE_DESCRIPTION_KEY: Record<AccountType, string> = {
  student: "hero.roleStudentDesc",
  tutor: "hero.roleTutorDesc",
  both: "hero.roleBothDesc",
};

export default function RegisterClient({ locale }: { locale: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("student");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registrationState, setRegistrationState] = useState<
    "idle" | "email_confirmation_required"
  >("idle");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle"
  );
  const { register, isLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("register");
  const tLogin = useTranslations("login");
  const supabase = createClient();

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    if (!validateEmail(newEmail) && newEmail.length > 0) {
      setEmailError(t("invalidEmail"));
    } else {
      setEmailError("");
    }
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) =>
    setPassword(e.target.value);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRegisterError(null);
    setRegistrationState("idle");

    if (!validateEmail(email)) {
      setEmailError(t("invalidEmail"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setRegisterError(t("errors.weakPassword", { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/${locale}/auth/callback`
          : undefined;
      const result = await register(email, password, accountType, {
        emailRedirectTo,
        username: name,
      });

      if (result === "email_confirmation_required") {
        setRegistrationState("email_confirmation_required");
        return;
      }

      if (accountType === "tutor") {
        router.push(`/${locale}/teacher-profile`);
      } else {
        router.push(`/${locale}/dashboard`);
      }
    } catch (error: unknown) {
      // Supabase AuthError codes → translated copy (never the raw English message).
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      const key = SIGNUP_ERROR_KEYS[code];
      setRegisterError(
        key ? t(key, { min: MIN_PASSWORD_LENGTH }) : t("registrationFailed")
      );
    }
  };

  const handleResendConfirmation = async () => {
    try {
      setResendState("sending");
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/${locale}/auth/callback` },
      });
      if (error) throw error;
      setResendState("sent");
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : t("resendFailed"));
      setResendState("idle");
    }
  };

  if (registrationState === "email_confirmation_required") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-ft-paper">
        <div
          className="flex flex-1 flex-col items-center justify-center px-7"
          style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))" }}
        >
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-8 w-fit">
              <BrandLogo size={48} />
            </div>
            <h1 className="m-0 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-ft-ink">
              {t("checkEmail.title")}
            </h1>
            <p className="mb-8 mt-3 text-sm text-ft-ink-2">
              {t("checkEmail.description", { email })}
            </p>
            {registerError && (
              <div className="mb-4 rounded-ft border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                {registerError}
              </div>
            )}
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendState === "sending"}
              className="w-full rounded-ft-md bg-ft-ink px-4 py-4 text-sm font-semibold text-ft-paper transition-colors hover:bg-[#2a241b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resendState === "sending"
                ? t("checkEmail.resending")
                : resendState === "sent"
                  ? t("checkEmail.resent")
                  : t("checkEmail.resend")}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/${locale}/login`)}
              className="mt-3 w-full rounded-ft-md border border-ft-line bg-ft-paper px-4 py-4 text-sm font-semibold text-ft-ink transition-colors hover:bg-ft-surface-1"
            >
              {t("checkEmail.goToLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ft-paper">
      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-7 pt-10"
        style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))" }}
      >
        <Link
          href={`/${locale}/`}
          aria-label="FreeTime"
          className="mb-9 inline-block w-fit transition-transform hover:scale-105"
        >
          <BrandLogo size={48} priority />
        </Link>

        <h1 className="m-0 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-ft-ink">
          {t.rich("hero.headline", {
            accent: (chunks) => (
              <span className="text-ft-accent-deep">{chunks}</span>
            ),
          })}
        </h1>
        <p className="mb-8 mt-3 text-sm text-ft-ink-3">
          {t("hero.editorial")}
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
          noValidate
        >
          {/* Account type selector */}
          <div>
            <span className={LABEL}>{t("accountType")}</span>
            <div
              role="radiogroup"
              aria-label={t("accountType")}
              className="mt-2 grid grid-cols-3 gap-2"
            >
              {ROLE_OPTIONS.map(({ value, icon: Icon }) => {
                const selected = accountType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAccountType(value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-ft-md border px-2 py-4 transition-colors",
                      selected
                        ? "border-ft-ink bg-ft-paper-deep text-ft-ink"
                        : "border-ft-line bg-ft-surface-1 text-ft-ink-2 hover:bg-ft-paper-deep"
                    )}
                  >
                    <Icon
                      width={20}
                      height={20}
                      strokeWidth={1.6}
                      className={selected ? "text-ft-accent-deep" : "text-ft-ink-3"}
                    />
                    <span className="text-[12px] font-semibold leading-tight tracking-tight">
                      {t(value)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ft-ink-3">{t(ROLE_DESCRIPTION_KEY[accountType])}</p>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="name" className={LABEL}>
                {t("name")}
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder={t("input.name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                className={INPUT}
              />
            </div>

            <div>
              <label htmlFor="email" className={LABEL}>
                {t("email")}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t("input.email")}
                value={email}
                onChange={handleEmailChange}
                required
                className={cn(
                  INPUT,
                  emailError && "border-red-500/50 focus:border-red-500/70"
                )}
              />
              {emailError && (
                <p className="mt-1.5 text-xs text-red-700">{emailError}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className={LABEL}>
                {t("password")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t("input.password")}
                  value={password}
                  onChange={handlePasswordChange}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  aria-describedby="password-hint"
                  className={cn(INPUT, "pr-12")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword
                      ? tLogin("hidePassword")
                      : tLogin("showPassword")
                  }
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ft-ink-3 transition-colors hover:text-ft-ink"
                >
                  {showPassword ? (
                    <EyeOff width={18} height={18} />
                  ) : (
                    <Eye width={18} height={18} />
                  )}
                </button>
              </div>
              <p id="password-hint" className="mt-1.5 text-xs text-ft-ink-3">
                {t("passwordHint", { min: MIN_PASSWORD_LENGTH })}
              </p>
            </div>
          </div>

          {registerError && (
            <div className="rounded-ft border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              {registerError}
            </div>
          )}

          <p className="text-xs leading-relaxed text-ft-ink-3">
            {t.rich("consent", {
              terms: (chunks) => (
                <Link href={`/${locale}/terms-of-service`} className="font-semibold text-ft-ink underline-offset-2 hover:underline">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href={`/${locale}/privacy-policy`} className="font-semibold text-ft-ink underline-offset-2 hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full rounded-ft-md bg-ft-ink px-4 py-4 text-sm font-semibold text-ft-paper transition-colors hover:bg-[#2a241b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? t("loading") : t("hero.submitCta")}
          </button>
        </form>
      </div>

      <div
        className="mx-auto w-full max-w-md px-7 pb-7 pt-5 text-center text-[13px] text-ft-ink-3"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        {t("alreadyHaveAccount")}{" "}
        <Link
          href={`/${locale}/login`}
          className="font-semibold text-ft-ink hover:underline"
        >
          {tLogin("login")}
        </Link>
      </div>
    </div>
  );
}
