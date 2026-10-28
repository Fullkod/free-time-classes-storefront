# Zona horaria de negocio: Europe/Madrid

`lessons.scheduled_date_time` (y `bookings.requested_scheduled_date_time`) son `timestamp without time zone`
y guardan la hora de pared de Madrid sin offset (ej. `2026-04-22 09:00:00`). Postgres esta en UTC.

**Por que importa:** Vercel corre en UTC y los slots se introducen en hora de Madrid. Comparar con
`new Date().toISOString()` o la hora local del servidor produce un desfase que mete slots pasados en
"clases disponibles" (o esconde futuros).

**Como aplicar:** para cualquier comparacion con "ahora" usar los helpers de `src/lib/datetime/lessonTime.ts`
(`BUSINESS_TIMEZONE`, `nowAsLessonTimestamp()`, `nowPlusMinutesAsLessonTimestamp()`,
`startOfMonthAsLessonTimestamp`, `isLessonInPast`), que formatean con `Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' })`.
Aplica a: `/api/availability/open-times`, dashboards, "Mis clases", filtro "hoy" del tutor, expiracion de custom requests,
mensajes de WhatsApp (formatear horas en Madrid) y cualquier filtro nuevo por hora de clase.

**Mostrar horas (decision 2026-10-20, F047/F051):** la BD sigue en Madrid, pero la UI muestra cada hora de clase
en la zona del navegador del usuario. Usar `src/lib/datetime/viewerTime.ts`: `lessonTimestampToDate/Epoch`
(Madrid wall-clock -> instante real, para formatear y para cuentas atras / "unirse"), `formatLessonTimestamp`,
`dayKeyInZone` y el hook `useViewerTimeZone()` (devuelve Madrid en SSR/hidratacion y la zona del navegador despues,
asi el HTML del servidor coincide). Nunca `new Date(scheduled_date_time)` a pelo: el navegador lo lee como hora local.
Entradas: `datetime-local` del estudiante (otra hora) se convierte a Madrid con `dateAsLessonTimestamp(new Date(valor))`.
**Agenda del tutor en SU zona (PRP-002, 2026-10-28):** `tutor_availability` y `availability_exceptions` son hora de
pared en `tutor_profiles.timezone` (null = Madrid; migracion 046 la valida con trigger). La conversion vive en
`src/lib/datetime/zonedTime.ts` (`wallClockToEpoch`/`epochToWallClock`/`resolveTimeZone`, solo `Intl`; hora inexistente
= null, ambigua = primera ocurrencia) y en el motor `computeOpenStartTimes`, que expande por fecha del tutor (±1 dia) y
devuelve Madrid. `lessons` sigue en Madrid. El FullCalendar de «Mi agenda» va con `timeZone="UTC"` alimentado con hora
del tutor (los Date que devuelve llevan la hora del tutor en sus campos UTC) y `now` memoizado. Las demas vistas siguen
con `useViewerTimeZone` (navegador). WhatsApp: `buildWhatsAppMessage` pone la hora en Madrid sin etiqueta para el estudiante y en la
zona del tutor con «(hora de X)» para los tipos dirigidos al tutor (`TUTOR_RECIPIENT_TYPES` en `notifications.ts`).
