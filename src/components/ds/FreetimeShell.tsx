"use client";

import { useAuth } from "@/context/UserContext";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FreetimeBottomNav } from "./FreetimeBottomNav";
import { FreetimeFooter } from "./FreetimeFooter";
import { FreetimeNavbar } from "./FreetimeNavbar";
import { FullkodCredit } from "./FullkodCredit";

interface FreetimeShellProps {
  children: ReactNode;
}

/**
 * Chrome wrapper for the whole locale subtree.
 * Activates the warm paper theme + Geist typography and renders the desktop
 * navbar, bottom nav (mobile, only when logged in), and paper footer.
 *
 * Mounted from LocaleLayoutWrapper — never import this directly into a page.
 */
export function FreetimeShell({ children }: FreetimeShellProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isAuthRoute =
    pathname.includes("/login") ||
    pathname.includes("/register") ||
    pathname.includes("/auth/");
  const showBottomNav = !isAuthRoute && Boolean(user);

  return (
    <div
      data-theme="freetime"
      className="flex min-h-screen flex-col bg-ft-paper font-geist text-ft-ink antialiased"
    >
      {!isAuthRoute && <FreetimeNavbar />}

      <main
        className={cn(
          "relative flex flex-1 flex-col",
          showBottomNav && "pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0"
        )}
      >
        {children}
        {isAuthRoute ? (
          // Full-screen auth pages: pinned to the bottom, no extra height
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-6">
            <FullkodCredit className="pointer-events-auto" />
          </div>
        ) : (
          // Mobile: the desktop footer is hidden, the credit closes the content
          <div className="flex justify-center px-6 pb-6 pt-8 md:hidden">
            <FullkodCredit />
          </div>
        )}
      </main>

      {!isAuthRoute && <FreetimeFooter />}
      {showBottomNav && <FreetimeBottomNav />}
    </div>
  );
}
