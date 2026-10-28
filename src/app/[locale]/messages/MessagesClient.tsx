"use client";

import InternalMessagingPanel from "@/components/messages/InternalMessagingPanel";
import { StudentSidebarNav } from "@/components/ds/StudentSidebarNav";
import { useAuth } from "@/context/UserContext";
import { useTranslations } from "@/i18n/translations";

export default function MessagesClient({
  initialConversationId,
}: {
  initialConversationId: number | null;
}) {
  const t = useTranslations("messagesPage");
  const { user } = useAuth();

  return (
    <div className="mx-auto w-full max-w-screen-md md:max-w-screen-lg lg:max-w-screen-xl lg:px-9 lg:py-8">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <StudentSidebarNav isTutor={user?.is_tutor ?? false} />

        <div className="min-w-0">
          <header className="px-5 pb-4 pt-[18px] md:px-9 md:pt-8 lg:px-0 lg:pt-0">
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em] text-ft-ink md:text-[32px]">
              {t("title")}
            </h1>
            <p className="mt-1 text-[13px] text-ft-ink-3">{t("subtitle")}</p>
          </header>

          <div className="px-5 pb-6 md:px-9 lg:px-0">
            <InternalMessagingPanel
              namespace="messagesPage"
              initialConversationId={initialConversationId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
