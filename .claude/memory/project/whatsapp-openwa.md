# Notificaciones por WhatsApp (OpenWA)

Plan: `docs/OPENWA_IMPLEMENTATION_PLAN.md`. Guia generica + gotchas: `docs/OPENWA_INTEGRATION_GUIDE.md`
(resumen en `reference/openwa-gotchas.md`). Implementado en commits del 2026-05-28/29.

**Decisiones cerradas:** OpenWA autoalojado en VPS con Docker y numero de WhatsApp dedicado; respuesta del tutor
por texto simple ("SI"/"1" confirma, "NO"/"2" rechaza).

**Como funciona:**
- Outbound: `insertNotification()` (`src/lib/notifications.ts`) es el embudo unico. Tras el insert in-app, si el
  usuario tiene `phone` + `receive_whatsapp_notifications` (opt-in desde la 044: false por defecto, se activa en
  Ajustes y un trigger guarda `whatsapp_consent_at`; los existentes se pusieron a false), envia via `src/lib/whatsapp/openwa.ts` y guarda el
  `messageId` en `wa_messages`. Todo en try/catch: WhatsApp nunca rompe la notificacion in-app ni la API.
  Si faltan envs (`isOpenWaConfigured()`), se omite en silencio.
- Inbound: `POST /api/wa-webhook` (runtime nodejs, fuera del matcher del middleware) → HMAC sobre body crudo →
  filtra no-chat/fromMe/grupos → idempotencia en `wa_inbound_events` → `matchBooking` (por `@lid` contra
  `wa_messages.message_id`, fallback por sufijo de `chat_id`) → `parseReply` → `respondToBooking()`
  (`src/lib/bookings/respond.ts`, compartido con la API del tutor) → responde por el mismo chat.
- Dev: `GET /api/dev/wa-register-webhook?url=...` registra el webhook; `api/dev/wa-test` para pruebas.
- Envs: `OPENWA_BASE_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID` (UUID, no el name), `OPENWA_WEBHOOK_SECRET`.

**Hallazgo auditoria 2026-10-19 (FRE0015):** los envios fallaban sin dejar rastro en `wa_messages` y el fetch a
OpenWA no tiene timeout (bloquea ~3 s las APIs de reservas). Diagnosticar el envio antes del piloto.

**Pendiente (checklist de produccion):** reverse proxy HTTPS en el VPS, alerta ante `session.disconnected`,
backend publicamente alcanzable para el webhook (en dev: ngrok/Cloudflare Tunnel).
