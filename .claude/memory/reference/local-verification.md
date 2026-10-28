# Verificar cambios en local sin tocar el dev server ni exponer credenciales

**Middleware:** vive en `src/middleware.ts` (con la app en `src/`, Next ignora un `middleware.ts` en la raiz;
estuvo asi hasta FRE0009/F009 y no corria nada: ni rutas protegidas, ni deteccion de idioma). Turbopack no
recoge un middleware que cambia de sitio hasta reiniciar `npm run dev`.

**Servidor de verificacion paralelo** (cuando el usuario tiene su `next dev` en :3000 y no hay que reiniciarlo):
`git -c core.longpaths=true worktree add --detach <scratchpad>/wt HEAD`, copiar `.env.local` y los archivos
sin commitear, junction de `node_modules` (`New-Item -ItemType Junction`) y `next dev -p 3001` **sin --turbo**
(Turbopack no sigue el junction: "Next.js package not found"). Al acabar: borrar el junction con `rmdir` y
`git worktree remove --force`.

**Sesion de las cuentas de prueba sin navegador:** password grant contra `/auth/v1/token` con la publishable key
y construir la cookie de `@supabase/ssr` (`sb-<ref>-auth-token=base64-<json de la sesion>`, troceada a ~3180
chars en `.0`, `.1`...). Las credenciales se leen en el script desde la tarea de Tasknic y nunca se imprimen.

**Gotchas de scripting en esta maquina:** `$TEMP` de bash y `TEMP` de Python son carpetas distintas (llamar a
`q.sh` desde Python con su ruta de bash via `cygpath -m`); los `print` de Python en Windows anaden `
` (usar
`tr -d '
'`); las cookies troceadas de Supabase llevan espacios (no usar `read A B` para separarlas); dentro de
heredocs los `\` de regex se pierden: editar esas lineas con la herramienta Edit. Datos QA: prefijo `QA-<tarea>`
en `notes` y borrar reserva + notificaciones + wa_messages + leccion al acabar.

**E2E con navegador real:** `playwright-core` de la cache de npx (`~/AppData/Local/npm-cache/_npx/*/node_modules/playwright-core`)
con `executablePath` a un `chromium_headless_shell-*` ya instalado en `~/AppData/Local/ms-playwright`.
Para medir o probar en build de produccion: `npm run build` + `npx next start -p 3005` en background; pararlo con
PowerShell `Get-NetTCPConnection -LocalPort 3005 -State Listen | Stop-Process`. Zona horaria del navegador con
`browser.newContext({ timezoneId })`. Scripts `tsx` que importan codigo del proyecto deben estar en la raiz del repo
(temporal, borrarlo despues): desde el scratchpad no resuelven `@/` ni los paquetes.

**Dev server tras borrar una ruta:** Turbopack + Tailwind siguen buscando el archivo borrado (`ENOENT ... route.ts`
y 500 en todas las paginas): parar el proceso del puerto 3000 y relanzar `npm run dev`; borrar tambien
`.next/types/app/api/<ruta>` si `tsc` se queja de tipos de una ruta que ya no existe. Para scripts con regex o `\r\n`,
escribirlos con la herramienta Write, no con heredoc + Python (el escape se pierde y deja un CR literal).
Varios archivos del repo son CRLF: un script que busca un bloque multilinea debe normalizar `\r\n` a `\n`, editar
y volver a CRLF si el archivo lo era. Tras un `git rm`, commitear con `git commit -m ... -- <rutas>`: si no, el
borrado ya preparado se cuela en el siguiente commit.

**Puertos:** 3000 y 3001 pueden estar ocupados por otro dev server del usuario (no tocarlo): levantar el de
verificacion con `npx next dev --turbo -p 3002`. Para probar flujos con WhatsApp sin enviar nada, arrancarlo con
`OPENWA_BASE_URL=http://127.0.0.1:9` (una variable real gana a `.env.local`) y firmar los webhooks con HMAC.

**Lecturas de BD:** PostgREST con la service role solo para lecturas (`limit=0` para comprobar columnas). Para
SQL de catalogo y DDL: `env -u SUPABASE_ACCESS_TOKEN supabase db query --linked --project-ref nqetxsifeulhfkwjdsbp "<sql>"`
(o `-f archivo.sql`). Usa el `supabase login` del usuario (cuenta duena del proyecto); hay que quitar
`SUPABASE_ACCESS_TOKEN` porque el entorno de la maquina inyecta uno de OTRA cuenta que tiene prioridad y da 403.

**Pruebas contra produccion:** la URL publica es `https://free-time-classes.vercel.app` (las URL de cada deploy piden
SSO de Vercel; el proyecto no esta en la cuenta del MCP de Vercel). Para saber cuando un commit ya esta en vivo:
`gh api repos/{owner}/{repo}/deployments?sha=<sha>` y su `/statuses` (`state=success`). Vercel consume el `s-maxage`
en el CDN y al navegador le llega solo `public` (no es un fallo); la cache se ve en `x-vercel-cache: HIT`. Probar
tambien con `timezoneId: "America/Havana"`: los errores de hidratacion (React #418) solo salen fuera de la hora de
Madrid, porque el servidor corre en UTC.
