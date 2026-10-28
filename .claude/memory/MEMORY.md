# Memoria del Proyecto — Indice

> Archivos organizados por carpeta (tipo). Max 200 lineas.
> Gestionado por skill memory-manager. Auto-memory de Claude Code DESACTIVADO.
> Contexto de negocio en `BUSINESS_LOGIC.md`; stack y reglas en `CLAUDE.md` (no se duplican aqui).

## user/ — Sobre el usuario/equipo
- [Equipo y preferencias](user/team.md) — equipo tecnico, espanol en chat / ingles en codigo, conventional commits, Windows

## project/ — Proyectos y decisiones activas
- [Zona horaria Madrid](project/business-timezone-madrid.md) — BD en wall-clock Madrid (lessonTime.ts); la UI muestra la zona del navegador (viewerTime.ts)
- [Rediseno FreeTime](project/redesign-freetime.md) — fases 0–8 hechas, chrome legacy eliminada; deuda: Plus Jakarta, tokens morados, data-theme
- [WhatsApp con OpenWA](project/whatsapp-openwa.md) — outbound via insertNotification + webhook SI/NO; checklist de produccion pendiente
- [Capacitor modo servidor remoto](project/capacitor-mobile.md) — server.url, nada de export estatico; push sera Capacitor + FCM
- [Auditoria pre-piloto FRE0002](project/audit-fre0002-plan.md) — 135 hallazgos, plan en FRE0007 + WPs FRE0008–FRE0017; problemas estructurales ya resueltos; detalle en docs/audits (local)

## feedback/ — Correcciones y preferencias
- [Radios rounded-ft-*](feedback/freetime-radius-scale.md) — nunca rounded-md/lg/xl/2xl (legacy los infla a 24–64px)
- [Pruebas en BD real y repo publico](feedback/qa-testing-safety.md) — solo cuentas de prueba, prefijo QA-, limpiar; nada explotable en archivos versionados

## reference/ — Donde encontrar cosas
- [Mapa de docs/](reference/docs-map.md) — que doc esta vigente y cual es historico; docs/ no esta en git
- [Supabase setup](reference/supabase-setup.md) — claves, clientes, migraciones (ultima 045), keepalive (en el cron diario de Vercel), MCP token
- [Gotchas de OpenWA](reference/openwa-gotchas.md) — 10 errores tipicos (@lid, UUID de sesion, idempotencia...)
- [Verificacion local](reference/local-verification.md) — middleware en src/, server paralelo :3001, sesion de prueba sin navegador, SQL via `supabase db query` sin el token del entorno
- [Cache y rendimiento](reference/caching-performance.md) — ISR (generateStaticParams vacio), getClaims, i18n por ruta, SIGNED_IN duplicado, limpieza de Storage
- [Correo de Fullkod](reference/correo-fullkod-resend.md) — @fullkod.com va por Resend (contact@, support@), sin reenvío; cada proyecto decide cómo avisar de sus formularios
