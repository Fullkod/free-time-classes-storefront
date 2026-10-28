# Supabase: claves, clientes, migraciones e infra

**Proyecto:** ref `nqetxsifeulhfkwjdsbp` (plan free). MCP configurado en `.mcp.json`; requiere la variable de
entorno `SUPABASE_ACCESS_TOKEN` en la maquina de cada dev (personal access token, nunca en el repo).
Ojo: en la maquina de Roberto ese `SUPABASE_ACCESS_TOKEN` es de otra cuenta y da 403 en este proyecto (el MCP
tampoco sirve); usar el CLI con `env -u SUPABASE_ACCESS_TOKEN supabase db query ...`. Ver `local-verification.md`.

**Claves:** el codigo usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (formato nuevo 2025) con fallback a
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (JWT legacy). `SUPABASE_SERVICE_ROLE_KEY` solo en route handlers (cliente admin).

**Clientes** (`src/lib/supabase/`): `client.ts` (browser, componentes `'use client'`), `server.ts` (cookies via
`next/headers`, solo route handlers/server), `server-public.ts` (lecturas publicas en server), `queries/` (cliente)
y `server-queries/` (server).

**Migraciones:** `supabase/migrations/NNN_descripcion.sql`, numeracion secuencial; la ultima es `052_read_stale_request_notifications.sql` (todas aplicadas en prod). Patron: probar en seco con `begin; ...; rollback;`, simular RLS con `set local role authenticated` + `request.jwt.claims`, y si una migracion restringe algo que el codigo desplegado aun usa, aplicarla DESPUES del deploy.
Hay dos `019_*` (prefijo duplicado historico, no renombrar). El esquema real difiere del SQL de
`docs/proyecto-maestro.md` §4 (ej. ids, `scheduled_date_time`, conversaciones): fiarse de las migraciones / MCP.

**Keepalive:** el plan free (decision 2026-10-28: sigue gratis) pausa el proyecto tras ~7 dias sin actividad. Lo evita
el cron diario de Vercel (`/api/cron/daily`, 03:00 UTC, `vercel.json`), que llama al RPC `public.ping()` (migracion `025`)
antes de completar clases y purgar datos (G-prod-1, FRE0017). Antes lo hacia un workflow de GitHub Actions, eliminado
porque GitHub desactiva los workflows programados tras 60 dias sin actividad en el repo (paso de julio a octubre de 2026).
Comprobar que el cron corre: `bookings` confirmadas ya pasadas deben quedar `completed` con `updated_at` ~03:00 UTC.

**Acceso a datos reales:** la BD es la del piloto (usuarios reales). Ver `feedback/qa-testing-safety.md` antes de
probar flujos que escriban datos.

**Otras envs del proyecto:** `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` (Calendar/Meet), `OPENWA_*` (WhatsApp),
`CAPACITOR_SERVER_URL`, `CAPACITOR_ANDROID_CLEARTEXT`, `ENABLE_DEV_ROUTES` (solo local: `true` habilita `/api/dev/*` en `next dev`).

**Vercel:** el MCP de Vercel de esta maquina esta autenticado en OTRO equipo (no el de este proyecto): no usarlo aqui. Logs y crons se revisan desde el dashboard del usuario; `CRON_SECRET` no esta en `.env.local`, asi que el cron no se puede lanzar en local.
