import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";

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
    path: "/contact",
    title: t("contact.title"),
    description: t("contact.description"),
  });
}


export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "contactPage" });
  const faqItems = t.raw("faq") as Array<{ category: string; question: string; answer: string }>;

  return (
    <main className="mx-auto w-full max-w-screen-xl px-5 pb-16 pt-10 md:px-9 md:pb-20 md:pt-14 lg:pt-20">
      <section className="mb-12 md:mb-16">
        <div className="max-w-4xl">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ft-surface-2 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ft-accent-deep">
            <Sparkles width={11} height={11} />
            {t("badge")}
          </p>
          <h1 className="m-0 text-balance text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] text-ft-ink md:text-[48px] lg:text-[60px]">
            {t.rich("title", {
              em: (chunks) => (
                <span className="font-instrument-serif italic text-ft-accent-deep">{chunks}</span>
              ),
            })}
          </h1>
          <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-ft-ink-2 md:text-[16px] lg:text-[17px]">
            {t("intro")}
          </p>
        </div>
      </section>

      <section className="mb-12 md:mb-16">
        <h2 className="m-0 mb-6 text-[24px] font-semibold tracking-[-0.025em] text-ft-ink md:mb-8 md:text-[32px]">
          {t("faqTitle")}
        </h2>

        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {faqItems.map((faq) => (
            <article
              key={faq.question}
              className="rounded-ft-lg border border-ft-line-soft bg-ft-paper p-5 md:p-6"
            >
              <p className="m-0 text-[10px] font-bold uppercase tracking-[0.1em] text-ft-accent-deep">
                {faq.category}
              </p>
              <h3 className="m-0 mt-2 text-[16px] font-semibold tracking-tight text-ft-ink md:text-[18px]">
                {faq.question}
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-ft-ink-2 md:text-[14px]">
                {faq.answer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-ft-2xl bg-gradient-to-br from-[#2A2520] to-[#1A1714] px-6 py-9 text-ft-paper md:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(201,168,106,0.30), transparent 70%)",
          }}
        />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="m-0 text-[24px] font-semibold tracking-[-0.025em] md:text-[34px]">
              <span className="font-instrument-serif italic">
                {t("stillNeedHelp")}
              </span>
            </h2>
            <p className="mt-3 max-w-2xl text-[13.5px] text-white/70 md:text-[15px]">
              {t("stillNeedHelpBody")}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
            <a
              href="mailto:info@freetimeclasses.com"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ft-accent px-6 py-3 text-[13px] font-semibold text-[#1a1410] transition-colors hover:brightness-95"
            >
              <MessageCircle className="h-4 w-4" />
              {t("emailCta")}
            </a>
            <Link
              href={`/${locale}/messages`}
              className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-[13px] font-semibold text-ft-paper transition-colors hover:bg-white/10"
            >
              {t("messagesCta")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 md:mt-10">
        <article className="rounded-ft-lg border border-ft-line bg-ft-surface-1 p-5 md:p-7">
          <h3 className="m-0 text-[16px] font-semibold tracking-tight text-ft-ink md:text-[18px]">
            {t("tutorTitle")}
          </h3>
          <p className="mt-2 text-[13.5px] text-ft-ink-2">
            {t("tutorBody")}
          </p>
          <Link
            href={`/${locale}/tutor/dashboard`}
            className="mt-5 inline-flex items-center gap-2 text-[13px] font-semibold text-ft-ink hover:text-ft-accent-deep"
          >
            {t("tutorCta")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </article>
      </section>
    </main>
  );
}
