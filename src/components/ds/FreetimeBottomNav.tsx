"use client";

import { useAuth } from "@/context/UserContext";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav, type BottomNavTab } from "./BottomNav";

function detectActiveTab(suffix: string): BottomNavTab {
  if (suffix.startsWith("/explore") || suffix.startsWith("/tutors") || suffix.startsWith("/courses")) {
    return "explore";
  }
  if (suffix.startsWith("/bookings") || suffix.startsWith("/classes")) {
    return "classes";
  }
  if (suffix.startsWith("/messages")) {
    return "messages";
  }
  if (
    suffix.startsWith("/student-profile") ||
    suffix.startsWith("/teacher-profile") ||
    suffix.startsWith("/student/profile") ||
    suffix.startsWith("/settings")
  ) {
    return "profile";
  }
  return "home";
}

function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/[a-z]{2}(\/.*)?$/i);
  if (!match) return pathname;
  return match[1] ?? "/";
}

export function FreetimeBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { user } = useAuth();

  const suffix = stripLocale(pathname);
  const active = detectActiveTab(suffix);

  const targetForTab = (tab: BottomNavTab): string => {
    const base = `/${locale}`;
    switch (tab) {
      case "home":
        return user ? `${base}/dashboard` : `${base}/`;
      case "explore":
        return `${base}/courses`;
      case "classes":
        return `${base}/bookings`;
      case "messages":
        return `${base}/messages`;
      case "profile":
        if (!user) return `${base}/login`;
        return `${base}/${user.is_tutor ? "teacher-profile" : "student-profile"}`;
    }
  };

  return (
    <BottomNav
      active={active}
      onChange={(tab) => router.push(targetForTab(tab))}
      className="fixed md:hidden"
    />
  );
}
