import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import BecomeTutorClient, {
  type BecomeTutorCopy,
} from "./BecomeTutorClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return buildPageMetadata({
    locale,
    path: "/become-tutor",
    title: t("becomeTutor.title"),
    description: t("becomeTutor.description"),
  });
}

export default async function BecomeTutorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "becomeTutor" });

  const copy: BecomeTutorCopy = {
    title: t("title"),
    subtitle: t("subtitle"),
    alreadyTutor: t("alreadyTutor"),
    goToProfile: t("goToProfile"),
    benefit3Title: t("benefit3Title"),
    benefit3Description: t("benefit3Description"),
    benefit1Title: t("benefit1Title"),
    benefit1Description: t("benefit1Description"),
    step1Title: t("step1Title"),
    step1Description: t("step1Description"),
    step2Title: t("step2Title"),
    step2Description: t("step2Description"),
    step3Title: t("step3Title"),
    step3Description: t("step3Description"),
    upgradeAccount: t("upgradeAccount"),
    registerNow: t("registerNow"),
    badge: t("badge"),
    termsAccept: t("termsAccept"),
    loginRequired: t("loginRequired"),
    activateTitle: t("activateTitle"),
    activateDescription: t("activateDescription"),
    activating: t("activating"),
    activateError: t("activateError"),
    footerHaveAccount: t("footerHaveAccount"),
    linkSignIn: t("linkSignIn"),
  };

  return <BecomeTutorClient locale={locale} copy={copy} />;
}
