# Free Time Classes — Titan Factory V4

> Marketplace de clases particulares online: conecta profesores con estudiantes, gestiona
> disponibilidad, reservas, mensajeria, notificaciones (in-app + WhatsApp) y videollamadas.
> Web app + app nativa (Android/iOS via Capacitor) con el 100% del codigo compartido.
>
> Este repo usa el toolbox de **Titan Factory** (`.claude/`) adaptado a un proyecto EXISTENTE:
> el stack y la arquitectura de abajo son la fuente de verdad. Si un skill de TF asume otra cosa
> (Next 16, Zustand, Zod, feature-first, Polar, PWA...), manda este archivo.

---

## Equipo y forma de trabajo

- El equipo es tecnico. Habla en espanol; el codigo, identificadores, comentarios y commits van en ingles.
- Commits estilo conventional (`feat:`, `fix:`, `refactor:`), en ingles.
- Las decisiones de PRODUCTO son del usuario; las tecnicas las propones tu, explicando el tradeoff.

---

## Los 4 Comportamientos (Anti-Fallos de Codigo)

**Tradeoff:** priorizan cautela sobre velocidad. Para tareas triviales, usa tu juicio.

1. **Pensar antes de codificar.** Declara supuestos. Si hay varias interpretaciones, presentalas. Si algo no esta claro, pregunta antes de implementar.
2. **Simplicidad primero.** El minimo codigo que resuelve el problema. Sin features, abstracciones ni configurabilidad que nadie pidio.
3. **Cambios quirurgicos.** Toca solo lo necesario. Sigue el estilo existente. Elimina solo los huerfanos que TU creaste; el codigo muerto previo se menciona, no se borra.
4. **Ejecucion orientada a objetivos.** Define criterios de exito verificables y valida (tsc, lint, browser) antes de dar algo por terminado.

---

## Stack real (no cambiar sin pedirlo)

| Capa | Tecnologia |
|------|------------|
| Framework | Next.js **15.2** (App Router) + React 19 + TypeScript |
| i18n | `next-intl` — locales `es` (default) y `en`, rutas `/{locale}/...` |
| Estilos | Tailwind CSS 3.4 + shadcn/ui (Radix) + design system propio FreeTime (`src/components/ds/`) |
| Backend | Supabase (Auth + Postgres + Storage + Realtime) via `@supabase/ssr` y `@supabase/supabase-js` |
| Movil | Capacitor 7 (Android/iOS) en modo **servidor remoto** (`server.url`), no export estatico |
| Calendario | FullCalendar 6 |
| Integraciones | Google Calendar/Meet (OAuth), WhatsApp via **OpenWA** (VPS propio) |
| Toasts / iconos | `sonner` / `lucide-react` |
| Estado | React Context (`src/context/UserContext`, `AppContext`) — **no** hay Zustand |
| Validacion | Manual en route handlers — **no** hay Zod instalado (no anadirlo sin preguntar) |
| Tests | No hay suite de tests todavia. Verificacion = `tsc` + lint + browser (Playwright) |
| Deploy | Vercel (server en UTC) |

---

## Arquitectura

```
src/
├── app/
│   ├── [locale]/          # Todas las paginas (i18n). Patron: page.tsx (server, fetch) + XxxClient.tsx (client, UI)
│   └── api/               # Route Handlers SIN prefijo de locale (/api/...). Toda logica con secretos va aqui
├── components/
│   ├── ds/                # Design system FreeTime (FreetimeShell, BottomNav, StudentSidebarNav, BookingPicker...)
│   ├── ui/                # shadcn/ui
│   └── student/ teacher/ messages/ courses/ common/
├── context/               # UserContext, AppContext
├── lib/
│   ├── supabase/          # client.ts (browser), server.ts (cookies), server-public.ts, queries/, server-queries/
│   ├── datetime/lessonTime.ts   # Helpers de hora Madrid (OBLIGATORIOS para comparar con lessons)
│   ├── notifications.ts   # insertNotification(): embudo UNICO de notificaciones (in-app + fan-out WhatsApp)
│   ├── whatsapp/          # Cliente OpenWA, mensajes, firma HMAC, parseo de respuestas, matching
│   ├── bookings/respond.ts      # respondToBooking(): logica compartida por API tutor y webhook WhatsApp
│   └── availability/ seo/ constants/ google-calendar.ts
├── types/                 # Tipos del dominio
└── i18n/
messages/es.json, messages/en.json   # TODOS los textos de UI
supabase/migrations/NNN_descripcion.sql   # Migraciones numeradas (siguiente: 045)
src/middleware.ts          # next-intl + sesion Supabase + proteccion por rol (is_student / is_tutor)
```

---

## Reglas criticas del proyecto

- **Hora de negocio = Europe/Madrid.** `lessons.scheduled_date_time` es wall-clock de Madrid sin offset. Nunca compares con `new Date().toISOString()` ni hora local del servidor: usa `src/lib/datetime/lessonTime.ts`. Para MOSTRAR horas al usuario usa `src/lib/datetime/viewerTime.ts` (zona del navegador); nunca `new Date(scheduled_date_time)`. Detalle: `.claude/memory/project/business-timezone-madrid.md`.
- **Radios FreeTime:** solo `rounded-ft-*`, `rounded-full` o `rounded-[Npx]`. NUNCA `rounded-md/lg/xl/2xl` (la config legacy los infla a 24–64px). Detalle: `.claude/memory/feedback/freetime-radius-scale.md`.
- **i18n:** ningun string de UI hardcodeado; anade la clave en `messages/es.json` Y `messages/en.json`. Al navegador solo viajan los namespaces de la shell y los de cada ruta (`src/i18n/clientMessages.ts`, F094): si un componente cliente usa un namespace nuevo, anadelo ahi y pasa `npm run check:i18n-scopes`.
- **Capacitor:** API en `src/app/api/` (nunca bajo `[locale]`), secretos solo en route handlers, cliente browser de Supabase en componentes `'use client'`, assets en `/public`. Nunca `output: 'standalone'` ni `output: 'export'`.
- **Supabase:** RLS siempre activo. `SUPABASE_SERVICE_ROLE_KEY` solo en route handlers. La clave publica es `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ANON solo como fallback).
- **`public.users` (migraciones 031/032):** los clientes solo pueden leer `id, username, profile_picture, country, is_student, is_tutor`. Nunca `select('*')` ni `users(*)` ni `email`/`phone` de otros usuarios; el perfil propio completo se lee con `rpc('get_my_profile')`. Las filas de `users` son visibles para el dueño, los tutores y, desde la 039, para el tutor de un estudiante con reserva; `student_profiles` es privado (sus embeds salen null para terceros): los nombres de estudiantes se leen con `fetchStudentNames()`. El cliente solo puede actualizar columnas de perfil/preferencias de su fila (roles y email via service role). `bookings` es de solo lectura para clientes: toda transicion va por `/api/bookings/*`. `rating`/`total_reviews` solo los cambian los triggers de `reviews`. Los cursos solo se escriben via `/api/courses` (042). Una reserva pendiente caduca (48 h o 2 h antes de la clase) via `expirePendingBookings()` (estado `expired`, 043). La disponibilidad se calcula (`src/lib/availability/openStartTimes.ts`): no se pregeneran huecos; una clase se crea al reservar un curso.
- **Notificaciones:** se crean SOLO via `insertNotification()`. El envio por WhatsApp va en try/catch y nunca rompe la notificacion in-app ni la respuesta de la API.
- **Codigo:** nunca `any` (usa `unknown`); `camelCase` vars/funciones, `PascalCase` componentes; nunca exponer secretos.

---

## Comandos

```bash
npm run dev            # next dev --turbo (puerto 3000)
npm run build          # build produccion
npm run lint           # next lint
npm run check:i18n-scopes  # namespaces de traduccion enviados a cada ruta
npx tsc --noEmit       # typecheck (no hay script npm)
npm run analyze        # bundle analyzer
npm run build:mobile   # build + assets nativos + cap sync
```

---

## Decision Tree: que hacer con cada request

```
├── Feature compleja (DB + API + UI, varias fases)  → skill PRP → aprobacion → BUCLE-AGENTICO
├── Base de datos / migracion / RLS / metricas       → skill SUPABASE (migracion nueva en supabase/migrations/)
├── Revisar que funcione / bug visual                → skill PLAYWRIGHT-CLI
├── Pagos                                            → skill ADD-PAYMENTS como referencia, PERO el doc
│                                                      maestro preve Stripe Connect (marketplace). Decidir con el usuario.
├── Emails transaccionales                           → skill ADD-EMAILS (Resend, ya previsto en el doc maestro)
├── Push / movil                                     → NO usar ADD-MOBILE (PWA): aqui es Capacitor + FCM
├── IA / chat / RAG                                  → skill AI
├── Automatizar con sistemas externos / n8n          → suite N8N (empezar por n8n-mcp-tools-expert)
├── Imagenes / logos                                 → skill IMAGE-GENERATION
├── Manual de usuario                                → skill ADD-MANUAL
├── "Recuerda..." / "en que quedamos?"               → skill MEMORY-MANAGER
├── Contexto al empezar sesion                       → skill PRIMER
├── Actualizar / quitar Titan Factory                → UPDATE-TF / EJECT-TF (este ultimo DESTRUCTIVO)
└── Resto                                            → leer el codebase, seguir sus patrones, ejecutar
```

No aplican a este proyecto: `new-app` (el proyecto ya existe), `add-login` (auth ya implementada),
`easypanel-deploy` (Docker + Prisma SQLite; aqui es Vercel + Supabase).

---

## Subagentes: delegacion SOLO con permiso

`.claude/agents/`: `backend-specialist`, `frontend-specialist`, `supabase-admin`, `codebase-analyst`,
`vercel-deployer`, `gestor-documentacion`, `validacion-calidad`.

1. Se invocan a peticion del usuario.
2. Si consideras util delegar, **pide permiso antes**: "Quieres que delegue esto a `X`? Haria [tarea]."
3. Nunca lances un subagente sin aprobacion explicita en esta conversacion. Cada delegacion pide permiso de nuevo.

---

## Memoria persistente: SIEMPRE ACTIVA

- Vive en `.claude/memory/` (versionada en git, compartida con el equipo). Auto-memory de Claude Code desactivada en `.claude/settings.json`.
- Al empezar una sesion de trabajo, lee `.claude/memory/MEMORY.md` antes de tocar codigo.
- Guardar / consultar segun el skill `memory-manager`.

## Documentacion del proyecto

`BUSINESS_LOGIC.md` (raiz, versionado): problema, roles, flujos, reglas de negocio y estado por modulo.
Los **[POR DEFINIR]** son decisiones de producto pendientes: preguntar, no inventar.

`docs/` (ignorado por git, vive en local): `proyecto-maestro.md` es la especificacion funcional;
`design/REDESIGN.md` el roadmap del rediseno FreeTime. Mapa completo y vigencia de cada doc:
`.claude/memory/reference/docs-map.md`.

---

## Auto-Blindaje

Error → se arregla → se documenta → no vuelve a ocurrir.

| Donde documentar | Cuando |
|------------------|--------|
| PRP actual (`.claude/PRPs/`) | Errores especificos de esa feature |
| `.claude/memory/` | Patrones/gotchas que aplican a varias features |
| Este archivo | Reglas criticas que aplican a TODO |

### Aprendizajes

- **2026-10-19 — Repo publico + BD real del piloto.** La auditoria FRE0002 encontro vulnerabilidades y las pruebas
  dejaron datos huerfanos en la BD real. Regla: nunca escribir detalles explotables ni credenciales en archivos
  versionados (informes de auditoria → `docs/audits/` local + Tasknic), y probar solo con las cuentas de prueba,
  prefijo `QA-` y limpieza final. Detalle: `.claude/memory/feedback/qa-testing-safety.md`.
