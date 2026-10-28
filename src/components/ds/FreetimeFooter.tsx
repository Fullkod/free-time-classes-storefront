"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { BrandLogo } from "./BrandLogo";

export function FreetimeFooter() {
  const t = useTranslations("home");
  const locale = useLocale();
  const year = new Date().getFullYear();

  const sections = [
    {
      title: t("quickLinks"),
      links: [
        { href: `/${locale}/tutors`, label: t("findTutors") },
        { href: `/${locale}/courses`, label: t("availableCourses") },
        { href: `/${locale}/become-tutor`, label: t("becomeTutor") },
      ],
    },
    {
      title: t("contact"),
      links: [
        { href: `/${locale}/about`, label: t("aboutUs") },
        { href: `/${locale}/contact`, label: t("contact") },
        { href: `/${locale}/privacy-policy`, label: t("footerPrivacy") },
        { href: `/${locale}/terms-of-service`, label: t("footerTerms") },
      ],
    },
  ];

  return (
    <footer className="hidden border-t border-ft-line-soft bg-ft-paper-deep md:block">
      <div className="mx-auto max-w-screen-2xl px-9 py-12">
        <div className="grid grid-cols-12 gap-10">
          {/* Brand */}
          <div className="col-span-5">
            <div className="flex items-center gap-2">
              <BrandLogo size={28} />
              <span className="text-[15px] font-semibold tracking-tight text-ft-ink">
                FreeTime
              </span>
            </div>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-ft-ink-2">
              {t("companyDescription")}
            </p>
          </div>

          {/* Link columns */}
          {sections.map((section) => (
            <div key={section.title} className="col-span-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ft-accent-deep">
                {section.title}
              </div>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-ft-ink-2 transition-colors hover:text-ft-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Tagline column */}
          <div className="col-span-1" />
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-ft-line-soft pt-6">
          <p className="text-[12px] text-ft-ink-3">
            © {year} Free Time Classes. {t("allRightsReserved")}
          </p>
          <p className="font-instrument-serif text-[14px] italic text-ft-ink-3">
            {t("footerTagline")}
          </p>
        </div>
      </div>
    </footer>
  );
}
