import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { createClient, getSessionUser } from "@/lib/supabase/server";

import MessagesClient from "./MessagesClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return buildPageMetadata({
    locale,
    path: "/messages",
    title: t("messages.title"),
    description: t("messages.description"),
    robots: { index: false, follow: false },
  });
}

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { locale } = await params;
  const conversationId = Number((await searchParams).c);
  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <MessagesClient
      initialConversationId={Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null}
    />
  );
}
