"use client";

import { useAuth } from "@/context/UserContext";
import { getPublicUrl } from "@/lib/supabase/storage";
import { useNotificationsContext } from "@/context/NotificationsContext";
import { ArrowRight, Bell } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { BrandLogo } from "./BrandLogo";

function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/[a-z]{2}(\/.*)?$/i);
  if (!match) return pathname;
  return match[1] ?? "/";
}

export function FreetimeNavbar() {
  const locale = useLocale();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { unreadCount } = useNotificationsContext();
  const t = useTranslations("navbar");
  const suffix = stripLocale(pathname);

  const links = [
    { href: `/${locale}/tutors`, label: t("tutors"), match: "/tutors" },
    { href: `/${locale}/courses`, label: t("courses"), match: "/courses" },
    { href: `/${locale}/about`, label: t("about"), match: "/about" },
  ];

  const avatarUrl = user?.profile_picture
    ? user.profile_picture.startsWith("http")
      ? user.profile_picture
      : getPublicUrl("avatars", user.profile_picture)
    : null;

  const profileHref = user
    ? `/${locale}/${user.is_tutor ? "teacher-profile" : "student-profile"}`
    : `/${locale}/login`;

  return (
    <nav
      className="hidden border-b border-ft-line-soft bg-ft-paper md:block"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-9 py-[18px]">
        {/* Left: brand + nav */}
        <div className="flex items-center gap-8">
          <Link
            href={`/${locale}/`}
            className="flex items-center gap-2 text-ft-ink"
            aria-label="FreeTime"
          >
            <BrandLogo size={28} priority />
            <span className="text-[15px] font-semibold tracking-tight">
              FreeTime
            </span>
          </Link>

          <div className="flex gap-6 text-[13px]">
            {links.map((link) => {
              const isActive = suffix === link.match || suffix.startsWith(link.match + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    isActive
                      ? "font-medium text-ft-ink"
                      : "text-ft-ink-2 transition-colors hover:text-ft-ink"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: language + auth area */}
        <div className="flex items-center gap-3.5">
          <LanguageSwitcher />
          {user && (
            <Link
              href={`/${locale}/notifications`}
              aria-label={t("notifications")}
              className="relative grid h-9 w-9 place-items-center rounded-full border border-ft-line bg-ft-paper text-ft-ink transition-colors hover:bg-ft-surface-1"
            >
              <Bell width={16} height={16} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ft-accent px-1 text-[10px] font-bold text-ft-ink">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <Link
              href={profileHref}
              className="flex items-center gap-2.5 rounded-full border border-ft-line bg-ft-paper py-1 pl-1 pr-3 transition-colors hover:bg-ft-surface-1"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={user.username}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-ft-surface-2 text-[11px] font-semibold uppercase text-ft-ink-2">
                  {user.username?.[0] ?? "?"}
                </span>
              )}
              <span className="text-[13px] font-medium text-ft-ink">
                {user.username}
              </span>
            </Link>
          ) : isLoading ? (
            // Session still resolving: no login/register flash for signed-in users (G-sess-3).
            <span aria-hidden className="h-9 w-32 animate-pulse rounded-full bg-ft-surface-1" />
          ) : (
            <>
              <Link
                href={`/${locale}/login`}
                className="text-[13px] text-ft-ink-2 transition-colors hover:text-ft-ink"
              >
                {t("login")}
              </Link>
              <Link
                href={`/${locale}/register`}
                className="inline-flex items-center gap-2 rounded-full bg-ft-ink px-4 py-2.5 text-[13px] font-semibold text-ft-paper transition-colors hover:bg-[#2a241b]"
              >
                {t("register")}
                <ArrowRight width={13} height={13} />
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
