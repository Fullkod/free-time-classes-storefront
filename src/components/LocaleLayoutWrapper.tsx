"use client";

import { NotificationsProvider } from "@/context/NotificationsContext";
import { UserProvider } from "@/context/UserContext";
import { useLocale } from "next-intl";
import { ReactNode, useEffect } from "react";
import { FreetimeShell } from "./ds/FreetimeShell";
import { ThemeProvider } from "./theme-provider";

interface LocaleLayoutWrapperProps {
  children: ReactNode;
}

export default function LocaleLayoutWrapper({
  children,
}: LocaleLayoutWrapperProps) {
  const locale = useLocale();

  // The root layout renders <html lang="es"> statically (reading the locale
  // there would make every page dynamic), so keep it in sync on the client.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <UserProvider>
      <NotificationsProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <FreetimeShell>{children}</FreetimeShell>
        </ThemeProvider>
      </NotificationsProvider>
    </UserProvider>
  );
}
