"use client";

import { useAuth } from "@/context/UserContext";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav, type BottomNavTab } from "./BottomNav";

function detectActiveTab(suffix: string): BottomNavTab {
  if (suffix.startsWith("/courses/create")) {
    return "courses";
  }
  if (suffix.startsWith("/tutor/dashboard")) {
    return "home";
  }
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

  const isTutor = !!user?.is_tutor;
  const suffix = stripLocale(pathname);
  const active = detectActiveTab(suffix);

  const targetForTab = (tab: BottomNavTab): string => {
    const base = `/${locale}`;
    switch (tab) {
      case "home":
        if (!user) return `${base}/`;
        return isTutor ? `${base}/tutor/dashboard` : `${base}/dashboard`;
      case "explore":
        return `${base}/courses`;
      case "classes":
        return `${base}/bookings`;
      case "courses":
        return `${base}/courses/create`;
      case "messages":
        return `${base}/messages`;
      case "profile":
        if (!user) return `${base}/login`;
        return `${base}/${isTutor ? "teacher-profile" : "student-profile"}`;
    }
  };

  return (
    <BottomNav
      active={active}
      onChange={(tab) => router.push(targetForTab(tab))}
      isTutor={isTutor}
      className="fixed md:hidden"
    />
  );
}
