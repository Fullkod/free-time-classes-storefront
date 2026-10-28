"use client";

import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/context/UserContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CalendarCheck2,
  CalendarX2,
  CheckCheck,
  MessageCircle,
  XCircle,
  CalendarPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Notification, NotificationType } from "@/types/notification";

function notifIcon(type: NotificationType) {
  switch (type) {
    case "booking_request":
    case "booking_custom_request":
      return <CalendarPlus className="h-4 w-4 text-blue-600" />;
    case "booking_confirmed":
      return <CalendarCheck2 className="h-4 w-4 text-emerald-600" />;
    case "booking_rejected":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "booking_cancelled":
    case "booking_expired":
      return <CalendarX2 className="h-4 w-4 text-amber-500" />;
    case "message_received":
      return <MessageCircle className="h-4 w-4 text-sky-600" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
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

export default function NotificationBell() {
  const { user } = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("notifications");
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications(user?.id);

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label={t("title")}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-80 max-h-[420px] overflow-y-auto rounded-xl p-0 shadow-lg"
        align="end"
        forceMount
      >
        {/* Header */}
        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-bold">{t("title")}</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-ft-accent-deep hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t("markAllRead")}
            </button>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-0" />

        {/* Notification list */}
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Bell className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          notifications.slice(0, 20).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3 cursor-pointer focus:bg-ft-surface-1",
                !n.is_read && "bg-ft-accent/[0.06]",
              )}
              onSelect={() => {
                if (!n.is_read) markAsRead(n.id);
                router.push(getNotificationHref(n, locale));
              }}
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                {notifIcon(n.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "truncate text-sm",
                      !n.is_read ? "font-semibold" : "font-medium",
                    )}
                  >
                    {n.title}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {timeAgo(n.created_at)}
                  </span>
                </div>
                {n.body && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {n.body}
                  </p>
                )}
              </div>
              {!n.is_read && (
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ft-accent" />
              )}
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator className="my-0" />

        {/* Footer link */}
        <div className="p-2">
          <Link
            href={`/${locale}/notifications`}
            className="flex items-center justify-center rounded-ft py-2 text-xs font-semibold text-ft-accent-deep hover:bg-ft-surface-1 transition-colors"
          >
            {t("viewAll")}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
