"use client";

import { useMemo } from "react";
import {
  Bell,
  CalendarCheck2,
  CalendarPlus,
  CalendarX2,
  MessageCircle,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { StudentSidebarNav } from "@/components/ds/StudentSidebarNav";
import { useTranslations, useLocale } from "@/i18n/translations";
import { useAuth } from "@/context/UserContext";
import { useNotificationsContext } from "@/context/NotificationsContext";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/notification";

function IconByType({ type }: { type: NotificationType }) {
  switch (type) {
    case "booking_request":
    case "booking_custom_request":
      return <CalendarPlus className="h-4 w-4" />;
    case "booking_confirmed":
      return <CalendarCheck2 className="h-4 w-4" />;
    case "booking_rejected":
      return <XCircle className="h-4 w-4" />;
    case "booking_cancelled":
    case "booking_expired":
      return <CalendarX2 className="h-4 w-4" />;
    case "message_received":
      return <MessageCircle className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

function iconTone(type: NotificationType): string {
  switch (type) {
    case "booking_confirmed":
      return "bg-emerald-50 text-emerald-700";
    case "booking_rejected":
      return "bg-red-50 text-red-700";
    case "booking_cancelled":
    case "booking_expired":
      return "bg-amber-50 text-amber-700";
    case "booking_request":
    case "booking_custom_request":
      return "bg-ft-accent-soft text-ft-accent-deep";
    case "message_received":
      return "bg-sky-50 text-sky-700";
    default:
      return "bg-ft-surface-2 text-ft-ink-2";
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getNotificationHref(n: Notification, locale: string): string {
  switch (n.type) {
    case "booking_request":
    case "booking_custom_request":
      return `/${locale}/tutor/dashboard`;
    case "booking_confirmed":
    case "booking_rejected":
    case "booking_cancelled":
    case "booking_expired":
      return `/${locale}/bookings`;
    case "message_received":
      return `/${locale}/messages`;
    default:
      return `/${locale}/notifications`;
  }
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function NotificationsClient() {
  const t = useTranslations("notificationsPage");
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { notifications, loading, markAsRead, markAllAsRead } = useNotificationsContext();
  // Skeleton until the first load ends, so the empty state never flashes (F099).
  const showSkeleton = authLoading || (loading && notifications.length === 0);

  const grouped = useMemo(() => {
    const today: typeof notifications = [];
    const earlier: typeof notifications = [];
    for (const n of notifications) {
      if (isToday(n.created_at)) {
        today.push(n);
      } else {
        earlier.push(n);
      }
    }
    return { today, earlier };
  }, [notifications]);

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div className="mx-auto w-full max-w-screen-md md:max-w-screen-lg lg:max-w-screen-xl lg:px-9 lg:py-8">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <StudentSidebarNav isTutor={user?.is_tutor ?? false} />

        <div className="min-w-0">
          {/* Header */}
          <header className="px-5 pb-4 pt-[18px] md:px-9 md:pt-8 lg:px-0 lg:pt-0">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="inline-flex items-center rounded-full bg-ft-surface-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ft-accent-deep">
                  {t("badge")}
                </span>
                <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.025em] text-ft-ink md:text-[32px]">
                  {t("title")}
                </h1>
                <p className="mt-1 max-w-xl text-[13px] text-ft-ink-3 md:text-sm">
                  {t("subtitle")}
                </p>
              </div>
              {hasUnread && (
                <button
                  type="button"
                  onClick={() => markAllAsRead()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-ft-line bg-ft-paper px-4 text-[13px] font-semibold text-ft-ink transition-colors hover:bg-ft-surface-1 md:self-end"
                >
                  <Bell className="h-4 w-4" />
                  {t("markAllAsRead")}
                </button>
              )}
            </div>
          </header>

          {/* Content */}
          <div className="px-5 pb-6 md:px-9 lg:px-0">
            {showSkeleton ? (
              <div className="space-y-2.5" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-[72px] animate-pulse rounded-ft-lg border border-ft-line-soft bg-ft-surface-1"
                  />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-ft-lg border border-dashed border-ft-line bg-ft-paper py-16 text-center md:py-20">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-ft-surface-2">
                  <Bell className="h-7 w-7 text-ft-ink-3" />
                </div>
                <p className="text-[15px] font-semibold tracking-tight text-ft-ink">
                  {t("empty")}
                </p>
                <p className="mt-1 text-[13px] text-ft-ink-3">
                  {t("emptySubtitle")}
                </p>
              </div>
            ) : (
              <div className="space-y-7">
                {grouped.today.length > 0 && (
                  <section>
                    <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ft-ink-3">
                      {t("groupToday")}
                    </h2>
                    <div className="overflow-hidden rounded-ft-lg border border-ft-line-soft bg-ft-paper">
                      {grouped.today.map((item, i) => (
                        <NotificationRow
                          key={item.id}
                          item={item}
                          locale={locale}
                          onMarkRead={markAsRead}
                          onNavigate={(href) => router.push(href)}
                          divider={i > 0}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {grouped.earlier.length > 0 && (
                  <section>
                    <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ft-ink-3">
                      {t("groupEarlier")}
                    </h2>
                    <div className="overflow-hidden rounded-ft-lg border border-ft-line-soft bg-ft-paper">
                      {grouped.earlier.map((item, i) => (
                        <NotificationRow
                          key={item.id}
                          item={item}
                          locale={locale}
                          onMarkRead={markAsRead}
                          onNavigate={(href) => router.push(href)}
                          divider={i > 0}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {notifications.length > 0 && (
              <div className="mt-8 flex flex-col items-center justify-center text-center">
                <div className="mb-2 h-8 w-px bg-gradient-to-b from-ft-accent to-transparent" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ft-ink-3">
                  {t("endOfList")}
                </p>
              </div>
            )}

            {/* Promo */}
            <section className="mt-8 overflow-hidden rounded-ft-2xl bg-gradient-to-br from-[#2A2520] to-[#1A1714] p-6 text-ft-paper md:p-8">
              <div className="relative max-w-lg space-y-3">
                <div
                  aria-hidden
                  className="absolute -right-12 -top-12 h-32 w-32 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(201,168,106,0.30), transparent 70%)",
                  }}
                />
                <p className="relative text-[10px] font-bold uppercase tracking-[0.16em] text-ft-accent-soft">
                  {t("promoTag")}
                </p>
                <h3 className="relative text-[24px] font-semibold leading-[1.1] tracking-[-0.02em]">
                  <span className="font-instrument-serif italic">
                    {t("promoTitle")}
                  </span>
                </h3>
                <p className="relative text-[13px] text-white/70">
                  {t("promoDescription")}
                </p>
                <button
                  type="button"
                  className="relative inline-flex items-center gap-2 rounded-full bg-ft-accent px-4 py-2.5 text-[13px] font-semibold text-[#1a1410] transition-colors hover:brightness-95"
                >
                  <Sparkles className="h-4 w-4" />
                  {t("promoCta")}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationRow({
  item,
  locale,
  onMarkRead,
  onNavigate,
  divider,
}: {
  item: Notification;
  locale: string;
  onMarkRead: (id: number) => void;
  onNavigate: (href: string) => void;
  divider: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!item.is_read) onMarkRead(item.id);
        onNavigate(getNotificationHref(item, locale));
      }}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ft-paper-deep sm:px-5",
        divider && "border-t border-ft-line-soft"
      )}
    >
      <div
        className={cn(
          "mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full",
          iconTone(item.type)
        )}
      >
        <IconByType type={item.type} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "m-0 text-[14px] tracking-tight",
              !item.is_read
                ? "font-semibold text-ft-ink"
                : "font-medium text-ft-ink-2"
            )}
          >
            {item.title}
          </h3>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ft-ink-3">
              {timeAgo(item.created_at)}
            </span>
            {!item.is_read && (
              <span className="h-2 w-2 rounded-full bg-ft-accent" />
            )}
          </div>
        </div>
        {item.body && (
          <p
            className={cn(
              "mt-1 text-[12.5px] leading-relaxed",
              !item.is_read ? "text-ft-ink-2" : "text-ft-ink-3"
            )}
          >
            {item.body}
          </p>
        )}
      </div>
    </button>
  );
}
