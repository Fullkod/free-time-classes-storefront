import type { AbstractIntlMessages } from "next-intl";

/**
 * Translation namespaces sent to the browser (F094). Sending all of
 * messages/*.json in every HTML cost ~20 kB gzip per page.
 *
 * - SHELL_NAMESPACES: used by the locale layout (navbar, footer, sidebar,
 *   error page), sent on every page.
 * - PAGE_NAMESPACES: added by the route's layout.tsx (scopedMessagesLayout);
 *   nested routes add theirs on top of their parent's.
 *
 * Server code (getTranslations) always has every namespace. After using a new
 * namespace in client code, run `node scripts/check-i18n-scopes.mjs`.
 */
export const SHELL_NAMESPACES = ["errorPage", "home", "languageSwitcher", "navbar", "studentSidebar"];

export const PAGE_NAMESPACES: Record<string, readonly string[]> = {
  "/auth": ["authCallback", "passwordReset"],
  "/bookings": ["bookingsPage", "studentProfile"],
  "/courses": ["coursesCatalog", "studentProfile"],
  "/courses/[id]": ["courseDetail", "tutorPublicProfile"],
  "/courses/create": ["teacherProfile"],
  "/dashboard": ["dashboard"],
  "/login": ["auth", "login"],
  "/messages": ["messagesPage"],
  "/notifications": ["notificationsPage"],
  "/register": ["login", "register"],
  "/saved-tutors": ["savedTutors", "studentProfile"],
  "/settings": ["settingsPage"],
  "/student-profile": ["studentProfile"],
  "/teacher-profile": ["teacherProfile"],
  "/tutor": ["dashboard", "tutorDashboardPage"],
  "/tutors": ["tutorsPage"],
  "/tutors/[id]": ["requestCustomClass", "tutorPublicProfile"],
};

export function pickMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[]
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const ns of namespaces) {
    if (ns in messages) picked[ns] = messages[ns];
  }
  return picked;
}
