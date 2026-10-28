"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  Loader2,
  Settings2,
  ShieldCheck,
  Trash2,
  Video,
  XCircle,
} from "lucide-react";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { StudentSidebarNav } from "@/components/ds/StudentSidebarNav";
import { useAuth } from "@/context/UserContext";
import { useTranslations } from "@/i18n/translations";
import { updateUser } from "@/lib/supabase/queries/users";
import { cn } from "@/lib/utils";

type SettingsTab = "account" | "notifications" | "payments" | "privacy";

function isValidEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default function SettingsClient({ locale }: { locale: string }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("settingsPage");
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: SettingsTab =
    tabParam === "account" ||
    tabParam === "notifications" ||
    tabParam === "payments" ||
    tabParam === "privacy"
      ? tabParam
      : "account";
  const [currentTab, setCurrentTab] = useState<SettingsTab>(initialTab);

  const [newEmail, setNewEmail] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState({
    receive_email_notifications: false,
    receive_sms_notifications: false,
    receive_whatsapp_notifications: false,
  });
  const [phone, setPhone] = useState("");
  const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const canUpdateNotifications = Boolean(user?.id);

  useEffect(() => {
    if (!user) return;
    setNotificationPrefs({
      receive_email_notifications: !!user.receive_email_notifications,
      receive_sms_notifications: !!user.receive_sms_notifications,
      receive_whatsapp_notifications: !!user.receive_whatsapp_notifications,
    });
    setPhone(user.phone ?? "");
  }, [user]);

  useEffect(() => {
    if (!user?.is_tutor) return;
    fetch("/api/google/status")
      .then((res) => res.json())
      .then((data: { connected?: boolean }) => setGoogleConnected(!!data.connected))
      .catch(() => setGoogleConnected(false));
  }, [user?.is_tutor]);

  useEffect(() => {
    const googleParam = searchParams.get("google");
    if (googleParam === "success") {
      toast.success(t("googleCalendarSuccess"));
      setGoogleConnected(true);
    } else if (googleParam === "error") {
      toast.error(t("googleCalendarError"));
    }
  }, [searchParams, t]);

  const handleGoogleConnect = async () => {
    setGoogleLoading(true);
    try {
      const res = await fetch("/api/google/auth");
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || t("googleCalendarError"));
        setGoogleLoading(false);
      }
    } catch {
      toast.error(t("googleCalendarError"));
      setGoogleLoading(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    setGoogleLoading(true);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      if (res.ok) {
        setGoogleConnected(false);
        toast.success(t("googleCalendarDisconnected"));
      } else {
        toast.error(t("googleCalendarDisconnectError"));
      }
    } catch {
      toast.error(t("googleCalendarDisconnectError"));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!user?.id) return;
    setIsExporting(true);
    try {
      const response = await fetch(`/api/settings/export-data`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || t("exportFailed"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("exportDownloaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!user?.id) return;
    const email = newEmail.trim();
    if (!isValidEmail(email)) {
      toast.error(t("invalidNewEmail"));
      return;
    }
    setIsUpdatingEmail(true);
    try {
      const response = await fetch(`/api/settings/update-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; user?: { email?: string | null } }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || t("emailUpdateError"));
      }
      setNewEmail("");
      toast.success(
        payload?.user?.email === email ? t("emailUpdated") : t("emailConfirmationSent")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("emailUpdateError"));
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!user?.id) return;
    if (newPassword.length < 6) {
      toast.error(t("passwordTooShort"));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error(t("passwordsDontMatch"));
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const response = await fetch(`/api/settings/update-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || t("passwordUpdateError"));
      }
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success(t("passwordUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("passwordUpdateError"));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleUpdateNotifications = async (updates: {
    receive_email_notifications?: boolean;
    receive_sms_notifications?: boolean;
    receive_whatsapp_notifications?: boolean;
  }) => {
    if (!user?.id) return;
    setIsUpdatingNotifications(true);
    try {
      const updatedUser = await updateUser(user.id, updates);
      setNotificationPrefs({
        receive_email_notifications: !!updatedUser.receive_email_notifications,
        receive_sms_notifications: !!updatedUser.receive_sms_notifications,
        receive_whatsapp_notifications: !!updatedUser.receive_whatsapp_notifications,
      });
      toast.success(t("notificationsUpdated"));
    } catch (err) {
      console.error("[settings] notifications update error:", err);
      toast.error(t("notificationsUpdateError"));
    } finally {
      setIsUpdatingNotifications(false);
    }
  };

  const handleUpdatePhone = async () => {
    if (!user?.id) return;
    const trimmed = phone.trim();
    // Require international format so the WhatsApp gateway gets an
    // unambiguous number (avoids the double-country-code trap).
    if (trimmed && !/^\+[1-9]\d{6,14}$/.test(trimmed)) {
      toast.error(t("phoneInvalid"));
      return;
    }
    setIsUpdatingPhone(true);
    try {
      const updatedUser = await updateUser(user.id, { phone: trimmed || null });
      setPhone(updatedUser.phone ?? "");
      toast.success(t("phoneUpdated"));
    } catch (err) {
      console.error("[settings] phone update error:", err);
      toast.error(t("phoneUpdateError"));
    } finally {
      setIsUpdatingPhone(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) return;
    setIsDeletingAccount(true);
    try {
      const res = await fetch(`/api/settings/delete-account`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || t("deleteAccountFailed"));
      }
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success(t("deleteAccountDeleted"));
      router.push(`/${locale}/login`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteAccountFailed"));
    } finally {
      setIsDeletingAccount(false);
      setIsDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-ft-ink-3" />
      </div>
    );
  }

  if (!user) return null;

  const TABS: Array<{ id: SettingsTab; label: string; icon: typeof ShieldCheck }> = [
    { id: "account", label: t("accountTab"), icon: ShieldCheck },
    { id: "notifications", label: t("notificationsTab"), icon: Bell },
    {
      id: "payments",
      label: user.is_tutor ? t("paymentsAndPayoutsTab") : t("paymentsTab"),
      icon: CreditCard,
    },
    { id: "privacy", label: t("privacyTab"), icon: Lock },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-md md:max-w-screen-lg lg:max-w-screen-xl lg:px-9 lg:py-8">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <StudentSidebarNav isTutor={user.is_tutor ?? false} />

        <div className="min-w-0">
      <header className="px-5 pb-4 pt-[18px] md:px-9 md:pt-8 lg:px-0 lg:pt-0">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-ft border border-ft-line-soft bg-ft-surface-1 text-ft-ink">
            <Settings2 width={18} height={18} />
          </span>
          <div>
            <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-ft-ink md:text-[28px]">
              {t("title")}
            </h1>
            <p className="mt-0.5 text-[13px] text-ft-ink-3">{t("subtitle")}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="hide-scroll mt-4 flex gap-1.5 overflow-x-auto rounded-ft-md border border-ft-line-soft bg-ft-surface-1 p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCurrentTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-ft-sm px-3 py-2 text-[12px] font-semibold transition-colors",
                  active
                    ? "bg-ft-paper text-ft-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    : "text-ft-ink-3 hover:text-ft-ink-2"
                )}
              >
                <Icon width={14} height={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-5 pb-6 md:px-9 lg:px-0">
        {/* ACCOUNT */}
        {currentTab === "account" && (
          <div className="space-y-4">
            {/* Language */}
            <section className="flex items-center justify-between gap-3 rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-ft-ink">
                  {t("languageSectionTitle")}
                </h2>
                <p className="mt-1 text-[13px] text-ft-ink-2">
                  {t("languageSectionDescription")}
                </p>
              </div>
              <LanguageSwitcher />
            </section>

            {/* Email change */}
            <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ft-surface-2 text-base font-semibold text-ft-ink-2">
                  {(user.username || user.email || "?")[0]?.toUpperCase()}
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ft-ink">
                    {user.username || t("accountTab")}
                  </p>
                  <p className="text-[12px] text-ft-ink-3">{user.email}</p>
                </div>
              </div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ft-ink">
                {t("emailSectionTitle")}
              </h2>

              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleUpdateEmail();
                }}
              >
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
                    {t("currentEmail")}
                  </label>
                  <p className="mt-1 text-[13px] text-ft-ink-2">{user.email}</p>
                </div>
                <div>
                  <label
                    htmlFor="newEmail"
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3"
                  >
                    {t("newEmail")}
                  </label>
                  <input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder={t("newEmailPlaceholder")}
                    autoComplete="email"
                    disabled={isUpdatingEmail || isUpdatingPassword}
                    className="mt-1.5 w-full rounded-ft border border-ft-line bg-ft-surface-1 px-4 py-3 text-[14px] text-ft-ink outline-none focus:border-ft-ink-3"
                  />
                  <p className="mt-1.5 text-[11px] text-ft-ink-3">
                    {t("emailVerificationHint")}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isUpdatingEmail}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ft-ink px-4 py-2.5 text-[13px] font-semibold text-ft-paper transition-colors hover:bg-[#2a241b] disabled:opacity-60"
                >
                  {isUpdatingEmail ? t("updating") : t("updateEmail")}
                </button>
              </form>
            </section>

            {/* Password */}
            <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
              <h2 className="text-[15px] font-semibold tracking-tight text-ft-ink">
                {t("passwordSectionTitle")}
              </h2>
              <form
                className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleUpdatePassword();
                }}
              >
                <div>
                  <label
                    htmlFor="newPassword"
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3"
                  >
                    {t("newPassword")}
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t("newPasswordPlaceholder")}
                      autoComplete="new-password"
                      disabled={isUpdatingPassword}
                      className="w-full rounded-ft border border-ft-line bg-ft-surface-1 px-4 py-3 pr-10 text-[14px] text-ft-ink outline-none focus:border-ft-ink-3"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center text-ft-ink-3"
                      aria-label="toggle"
                    >
                      {showNewPassword ? (
                        <EyeOff width={14} height={14} />
                      ) : (
                        <Eye width={14} height={14} />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="confirmNewPassword"
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3"
                  >
                    {t("confirmNewPassword")}
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="confirmNewPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder={t("confirmNewPasswordPlaceholder")}
                      autoComplete="new-password"
                      disabled={isUpdatingPassword}
                      className="w-full rounded-ft border border-ft-line bg-ft-surface-1 px-4 py-3 pr-10 text-[14px] text-ft-ink outline-none focus:border-ft-ink-3"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((p) => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center text-ft-ink-3"
                      aria-label="toggle"
                    >
                      {showConfirmPassword ? (
                        <EyeOff width={14} height={14} />
                      ) : (
                        <Eye width={14} height={14} />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="md:col-span-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-ft-ink px-4 py-2.5 text-[13px] font-semibold text-ft-paper transition-colors hover:bg-[#2a241b] disabled:opacity-60"
                >
                  {isUpdatingPassword ? t("updating") : t("updatePassword")}
                </button>
              </form>
            </section>

            {/* Google Calendar (tutor only) */}
            {user.is_tutor && (
              <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-ft bg-ft-surface-1 text-ft-ink">
                    <Video width={18} height={18} />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-tight text-ft-ink">
                      {t("googleCalendarIntegrationsTitle")}
                    </h2>
                    <p className="mt-0.5 text-[12px] text-ft-ink-3">
                      {t("googleCalendarDescription")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-ft border border-ft-line-soft bg-ft-surface-1 p-4">
                  <div>
                    <p className="text-[14px] font-semibold text-ft-ink">
                      {t("googleCalendarTitle")}
                    </p>
                    {googleConnected === null ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[12px] text-ft-ink-3">
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </div>
                    ) : googleConnected ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[12px] text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("googleCalendarConnected")}
                      </div>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1 text-[12px] text-ft-ink-3">
                        <XCircle className="h-3.5 w-3.5" />
                        {t("googleCalendarNotConnected")}
                      </div>
                    )}
                  </div>
                  {googleConnected ? (
                    <button
                      type="button"
                      onClick={() => void handleGoogleDisconnect()}
                      disabled={googleLoading}
                      className="rounded-full border border-ft-line bg-ft-paper px-3 py-2 text-[12px] font-semibold text-ft-ink hover:bg-ft-surface-2"
                    >
                      {googleLoading
                        ? t("googleCalendarDisconnecting")
                        : t("googleCalendarDisconnect")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleGoogleConnect()}
                      disabled={googleLoading || googleConnected === null}
                      className="inline-flex items-center gap-1.5 rounded-full bg-ft-ink px-3.5 py-2 text-[12px] font-semibold text-ft-paper hover:bg-[#2a241b]"
                    >
                      {googleLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      {googleLoading
                        ? t("googleCalendarConnecting")
                        : t("googleCalendarConnect")}
                    </button>
                  )}
                </div>
                {googleConnected && (
                  <p className="mt-2.5 text-[11px] text-ft-ink-3">
                    {t("googleCalendarAutoMeetHint")}
                  </p>
                )}
              </section>
            )}

            {/* Delete account */}
            <section className="rounded-ft-lg border border-red-100 bg-red-50/50 p-5">
              <h2 className="text-[15px] font-semibold tracking-tight text-red-800">
                {t("deleteSectionTitle")}
              </h2>
              <p className="mt-1.5 text-[12px] text-red-700/80">
                {t("deleteSectionDescription")}
              </p>
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={isDeletingAccount}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3.5 py-2 text-[12px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                <Trash2 width={13} height={13} />
                {t("deleteAccount")}
              </button>
            </section>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {currentTab === "notifications" && (
          <div className="space-y-4">
            <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
              <h2 className="text-[15px] font-semibold tracking-tight text-ft-ink">
                {t("notificationsSectionTitle")}
              </h2>
              <div className="mt-3 space-y-3">
                <label className="flex items-center justify-between gap-3 rounded-ft border border-ft-line-soft bg-ft-surface-1 p-3.5">
                  <div>
                    <p className="text-[14px] font-medium text-ft-ink">
                      {t("emailNotifications")}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationPrefs.receive_email_notifications}
                    disabled={!canUpdateNotifications || isUpdatingNotifications}
                    onChange={(e) =>
                      void handleUpdateNotifications({
                        receive_email_notifications: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-ft-ink"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-ft border border-ft-line-soft bg-ft-surface-1 p-3.5">
                  <div>
                    <p className="text-[14px] font-medium text-ft-ink">
                      {t("smsNotifications")}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationPrefs.receive_sms_notifications}
                    disabled={!canUpdateNotifications || isUpdatingNotifications}
                    onChange={(e) =>
                      void handleUpdateNotifications({
                        receive_sms_notifications: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-ft-ink"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-ft border border-ft-line-soft bg-ft-surface-1 p-3.5">
                  <div>
                    <p className="text-[14px] font-medium text-ft-ink">
                      {t("whatsappNotifications")}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ft-ink-3">
                      {t("whatsappNotificationsDescription")}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationPrefs.receive_whatsapp_notifications}
                    disabled={
                      !canUpdateNotifications ||
                      isUpdatingNotifications ||
                      !phone.trim()
                    }
                    onChange={(e) =>
                      void handleUpdateNotifications({
                        receive_whatsapp_notifications: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-ft-ink"
                  />
                </label>

                <div className="rounded-ft border border-ft-line-soft bg-ft-surface-1 p-3.5">
                  <label
                    htmlFor="phone"
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3"
                  >
                    {t("phoneLabel")}
                  </label>
                  <form
                    className="mt-1.5 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleUpdatePhone();
                    }}
                  >
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+34600111222"
                      autoComplete="tel"
                      disabled={isUpdatingPhone}
                      className="w-full rounded-ft border border-ft-line bg-ft-paper px-4 py-3 text-[14px] text-ft-ink outline-none focus:border-ft-ink-3"
                    />
                    <button
                      type="submit"
                      disabled={isUpdatingPhone}
                      className="shrink-0 rounded-full bg-ft-ink px-4 py-2.5 text-[13px] font-semibold text-ft-paper transition-colors hover:bg-[#2a241b] disabled:opacity-60"
                    >
                      {isUpdatingPhone ? t("updating") : t("save")}
                    </button>
                  </form>
                  <p className="mt-1.5 text-[11px] text-ft-ink-3">
                    {t("phoneHint")}
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-ft-line-soft pt-4">
                <p className="text-[14px] font-semibold text-ft-ink">
                  {t("pushNotifications")}
                </p>
                <p className="mt-1 text-[12px] text-ft-ink-3">
                  {t("pushNotificationsDescription")}
                </p>
                <button
                  type="button"
                  disabled
                  className="mt-3 rounded-full border border-ft-line bg-ft-paper px-3.5 py-2 text-[12px] font-semibold text-ft-ink-3"
                >
                  {t("configurePush")} ({t("comingSoon")})
                </button>
              </div>
            </section>
          </div>
        )}

        {/* PAYMENTS */}
        {currentTab === "payments" && (
          <div className="space-y-4">
            {user.is_tutor && (
              <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
                <h2 className="text-[15px] font-semibold tracking-tight text-ft-ink">
                  {t("tutorPayoutsTitle")}
                </h2>
                <button
                  type="button"
                  disabled
                  className="mt-3 w-full rounded-full border border-ft-line bg-ft-paper px-3.5 py-2.5 text-left text-[13px] font-medium text-ft-ink-3"
                >
                  {t("connectBankAccount")} ({t("comingSoon")})
                </button>
                <p className="mt-3 text-[12px] text-ft-ink-3">{t("earningsHistory")}</p>
                <p className="text-[12px] text-ft-ink-3">{t("upcomingPayouts")}</p>
              </section>
            )}

            <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
              <h3 className="text-[14px] font-semibold tracking-tight text-ft-ink">
                {t("billingSupportTitle")}
              </h3>
              <p className="mt-1.5 text-[13px] text-ft-ink-3">
                {t("billingSupportDescription")}
              </p>
              <Link
                href={`/${locale}/contact`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ft-line bg-ft-paper px-3.5 py-2 text-[12px] font-semibold text-ft-ink hover:bg-ft-surface-1"
              >
                {t("contactSupport")}
              </Link>
            </section>

            {!user.is_student && !user.is_tutor && (
              <p className="text-[13px] text-ft-ink-3">{t("noPaymentRole")}</p>
            )}
          </div>
        )}

        {/* PRIVACY */}
        {currentTab === "privacy" && (
          <div className="space-y-4">
            <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
              <h2 className="text-[15px] font-semibold tracking-tight text-ft-ink">
                {t("profileVisibility")}
              </h2>
              {/* F081: students are only visible to tutors they booked or talk
                  with (RLS, migration 039); tutor profiles are public. */}
              <p className="mt-1.5 text-[12px] text-ft-ink-3">
                {t(user?.is_tutor ? "profileVisibilityTutor" : "profileVisibilityDescription")}
              </p>
            </section>

            <section className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5">
              <h2 className="text-[15px] font-semibold tracking-tight text-ft-ink">
                {t("exportData")}
              </h2>
              <p className="mt-1.5 text-[12px] text-ft-ink-3">
                {t("exportDataDescription")}
              </p>
              <button
                type="button"
                onClick={() => void handleExportData()}
                disabled={isExporting}
                className="mt-3 rounded-full border border-ft-line bg-ft-paper px-3.5 py-2 text-[12px] font-semibold text-ft-ink hover:bg-ft-surface-1 disabled:opacity-60"
              >
                {isExporting ? t("exporting") : t("exportDataButton")}
              </button>
              <p className="mt-2 text-[11px] text-ft-ink-3">
                {t("exportUnavailable")}
              </p>
            </section>
          </div>
        )}
      </div>

      <ConfirmActionDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title={t("deleteAccountConfirmTitle")}
        description={t("deleteAccountConfirmDescription")}
        cancelLabel={t("cancel")}
        confirmLabel={
          isDeletingAccount ? t("deleting") : t("deleteAccountConfirm")
        }
        loading={isDeletingAccount}
        onCancel={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          void handleDeleteAccount();
        }}
      />
        </div>
      </div>
    </div>
  );
}
