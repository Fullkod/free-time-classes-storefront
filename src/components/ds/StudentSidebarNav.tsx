"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Calendar,
  GraduationCap,
  Heart,
  Home,
  LogOut,
  MessageCircle,
  Receipt,
  Settings as SettingsIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "@/context/UserContext";
import { cn } from "@/lib/utils";

interface StudentSidebarNavProps {
  isTutor?: boolean;
  unreadMessages?: number;
}

interface NavItem {
  id: string;
  href: string;
  match: ReadonlyArray<string>;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/[a-z]{2}(\/.*)?$/i);
  if (!match) return pathname;
  return match[1] ?? "/";
}

/**
 * Desktop-only sidebar nav for the student/tutor area (Dashboard, Bookings,
 * Profile, Settings). Hidden below `lg` — mobile uses BottomNav instead.
 *
 * Switches the items based on `isTutor`: overview points to /tutor/dashboard
 * vs /dashboard, the 4th slot is "Mis estudiantes" instead of "Profesores
 * guardados", and the settings href routes to /teacher-profile vs
 * /student-profile.
 */
export function StudentSidebarNav({
  isTutor = false,
  unreadMessages = 0,
}: StudentSidebarNavProps) {
  const t = useTranslations("studentSidebar");
  const locale = useLocale();
  const pathname = usePathname();
  const suffix = stripLocale(pathname);
  const { logout } = useAuth();

  const profileHref = isTutor
    ? `/${locale}/teacher-profile`
    : `/${locale}/student-profile`;

  const items: ReadonlyArray<NavItem> = isTutor
    ? [
        {
          id: "overview",
          href: `/${locale}/tutor/dashboard`,
          match: ["/tutor/dashboard"],
          label: t("overview"),
          icon: Home,
        },
        {
          id: "classes",
          href: `/${locale}/bookings`,
          match: ["/bookings"],
          label: t("classes"),
          icon: Calendar,
        },
        {
          id: "messages",
          href: `/${locale}/messages`,
          match: ["/messages"],
          label: t("messages"),
          icon: MessageCircle,
          badge: unreadMessages > 0 ? unreadMessages : undefined,
        },
        {
          id: "courses",
          href: `/${locale}/courses/create`,
          match: ["/courses/create"],
          label: t("myCourses"),
          icon: GraduationCap,
        },
        {
          id: "earnings",
          href: `/${locale}/settings?tab=payments`,
          // Same route as Settings: highlighting both would be confusing (F109).
          match: [],
          label: t("earnings"),
          icon: Receipt,
        },
        {
          id: "settings",
          href: `/${locale}/settings`,
          match: ["/settings"],
          label: t("settings"),
          icon: SettingsIcon,
        },
      ]
    : [
        {
          id: "overview",
          href: `/${locale}/dashboard`,
          match: ["/dashboard"],
          label: t("overview"),
          icon: Home,
        },
        {
          id: "classes",
          href: `/${locale}/bookings`,
          match: ["/bookings"],
          label: t("classes"),
          icon: Calendar,
        },
        {
          id: "messages",
          href: `/${locale}/messages`,
          match: ["/messages"],
          label: t("messages"),
          icon: MessageCircle,
          badge: unreadMessages > 0 ? unreadMessages : undefined,
        },
        {
          id: "favorites",
          href: `/${locale}/saved-tutors`,
          match: ["/saved-tutors"],
          label: t("favorites"),
          icon: Heart,
        },
        {
          id: "payments",
          href: `/${locale}/settings?tab=payments`,
          // Same route as Settings: highlighting both would be confusing (F109).
          match: [],
          label: t("payments"),
          icon: Receipt,
        },
        {
          id: "settings",
          href: profileHref,
          match: ["/student-profile", "/student/profile"],
          label: t("settings"),
          icon: SettingsIcon,
        },
      ];

  const isActive = (item: NavItem): boolean =>
    item.match.some((m) => suffix === m || suffix.startsWith(m + "/"));

  return (
    <aside className="sticky top-0 hidden h-fit shrink-0 self-start py-2 lg:block lg:w-[220px]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ft-ink-3">
        {t("sectionLabel")}
      </div>
      <nav className="mt-2.5 flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-ft-sm px-3 py-2.5 text-[13px] transition-colors",
                active
                  ? "border border-ft-line-soft bg-ft-paper font-semibold text-ft-ink"
                  : "border border-transparent font-medium text-ft-ink-2 hover:bg-ft-paper-deep"
              )}
            >
              <Icon width={15} height={15} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ft-accent px-1.5 text-[10px] font-bold text-[#1a1410]">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-1 flex items-center gap-2.5 rounded-ft-sm border border-transparent px-3 py-2.5 text-left text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50"
        >
          <LogOut width={15} height={15} />
          <span className="flex-1">{t("signOut")}</span>
        </button>
      </nav>
    </aside>
  );
}
