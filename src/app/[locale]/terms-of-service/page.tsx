import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { ShieldCheck } from "lucide-react";

import { buildPageMetadata } from "@/lib/seo/page-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return buildPageMetadata({
    locale,
    path: "/terms-of-service",
    title: t("termsOfService.title"),
    description: t("termsOfService.description"),
  });
}


type LegalSection = { title: string; paragraphs: string[] };

export default async function TermsOfServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "termsOfServicePage" });
  const sections = t.raw("sections") as LegalSection[];

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16 pt-10 md:px-9 md:pb-20 md:pt-14 lg:pt-20">
      <header className="mb-10 md:mb-14">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ft-surface-2 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ft-accent-deep">
          <ShieldCheck width={11} height={11} />
          {t("badge")}
        </p>
        <h1 className="m-0 text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] text-ft-ink md:text-[44px] lg:text-[52px]">
          {t("title")}
        </h1>
        <p className="mt-4 text-[13px] text-ft-ink-3 md:text-[14px]">
          {t("lastUpdated")}
        </p>
      </header>

      <section className="space-y-5 md:space-y-6">
        {sections.map((section) => (
          <article
            key={section.title}
            className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5 md:p-7"
          >
            <h2 className="m-0 text-[18px] font-semibold tracking-tight text-ft-ink md:text-[20px]">
              {section.title}
            </h2>
            <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-ft-ink-2 md:text-[15px]">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="m-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
