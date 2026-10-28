"use client";

import { BookOpen, Calendar, Compass, Home, MessageCircle, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "@/i18n/translations";
import { cn } from "@/lib/utils";

export type BottomNavTab = "home" | "explore" | "classes" | "courses" | "messages" | "profile";

interface BottomNavProps {
  active: BottomNavTab;
  onChange: (tab: BottomNavTab) => void;
  /** Tutors get their own courses tab instead of "explore". */
  isTutor?: boolean;
  className?: string;
}

const ITEMS: ReadonlyArray<{ id: BottomNavTab; icon: LucideIcon }> = [
  { id: "home", icon: Home },
  { id: "explore", icon: Compass },
  { id: "classes", icon: Calendar },
  { id: "messages", icon: MessageCircle },
  { id: "profile", icon: User },
];

const TUTOR_ITEMS: ReadonlyArray<{ id: BottomNavTab; icon: LucideIcon }> = [
  { id: "home", icon: Home },
  { id: "classes", icon: Calendar },
  { id: "courses", icon: BookOpen },
  { id: "messages", icon: MessageCircle },
  { id: "profile", icon: User },
];

export function BottomNav({ active, onChange, isTutor = false, className }: BottomNavProps) {
  const t = useTranslations("navbar.bottomNav");
  return (
    <nav
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 flex justify-between border-t border-ft-line-soft px-3 pb-7 pt-2.5",
        "bg-[rgba(252,250,246,0.96)] backdrop-blur-xl",
        "pb-[calc(env(safe-area-inset-bottom)+1.5rem)]",
        className
      )}
    >
      {(isTutor ? TUTOR_ITEMS : ITEMS).map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-[3px] border-none bg-transparent px-1 py-1.5 transition-colors",
              isActive ? "text-ft-ink" : "text-ft-ink-3 hover:text-ft-ink-2"
            )}
          >
            <Icon
              width={22}
              height={22}
              strokeWidth={isActive ? 2 : 1.6}
            />
            <span
              className={cn(
                "text-[10px] tracking-tight",
                isActive ? "font-semibold" : "font-medium"
              )}
            >
              {t(item.id)}
            </span>
            {isActive && (
              <span className="absolute -top-2.5 h-0.5 w-[18px] rounded-ft-xs bg-ft-accent" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
