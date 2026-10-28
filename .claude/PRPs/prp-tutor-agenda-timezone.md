# PRP-002: Agenda del tutor en su zona horaria

> **Estado**: COMPLETADO (2026-10-28)
> **Fecha**: 2026-10-28
> **Proyecto**: Free Time Classes
> **Origen**: FRE0007, decision 11 (2026-10-28): «agenda del tutor en SU zona horaria ya (`tutor_profiles.timezone`, con migracion)». Continua PRP-001 (`.claude/PRPs/prp-course-booking-unit.md`) y las decisiones F047/F051 (2026-10-20).

---

## Objetivo

El tutor define su agenda (franjas semanales y excepciones) y la ve en el calendario **en su propia zona horaria**,
guardada en `tutor_profiles.timezone`. Las horas libres que ve el estudiante y las clases que se crean al reservar
siguen saliendo en wall-clock de Madrid (`lessons.scheduled_date_time` no cambia).

## Por Que

| Problema | Solucion |
|----------|----------|
| Un tutor fuera de Espana (p. ej. en Cuba) tiene que traducir su horario a hora de Madrid al crear franjas; el aviso ambar lo pide pero es facil equivocarse | Introduce «lunes 10:00-12:00» en su hora y el sistema hace la conversion |
| Una franja fija en Madrid se desplaza para el tutor cuando su pais y Espana cambian de horario de verano en fechas distintas (o uno no cambia) | La franja se guarda en la hora del tutor y se convierte a Madrid **fecha a fecha**, asi que siempre cae a su misma hora local |
| El calendario del tutor mezcla zonas: pinta las franjas con la hora del navegador y lee las clases (Madrid) como si fueran hora local | Todo el calendario se pinta en la zona del tutor, con etiqueta de zona |

**Valor de negocio**: quita la principal fuente de errores de agenda para tutores fuera de Espana (piloto con usuarios en
Cuba) antes del lanzamiento; evita clases ofrecidas a horas en las que el tutor no esta.

## Que

### Criterios de Exito
- [ ] Un tutor con zona `America/Havana` y franja lunes 10:00-12:00 ofrece, para un curso de 60 min, horas que en Madrid son 16:00/16:30/17:00 (o 15:00/... segun el DST de esa semana) y el estudiante las ve en su propia zona; la reserva crea la clase en wall-clock Madrid correcto
- [ ] El motor de horas libres pasa un script de casos: tutor en Madrid (resultado identico al actual), tutor en La Habana y en Ciudad de Mexico (sin DST) en las semanas de cambio de hora de marzo/octubre/noviembre, franja que cruza medianoche en Madrid, bloqueo de dia completo en hora del tutor, extra puntual, clase reservada en medio; servidor en UTC
- [ ] Los tutores existentes conservan exactamente sus horas libres actuales (su zona queda en `Europe/Madrid`)
- [ ] Un tutor sin zona elegida la confirma (precargada con la de su navegador) antes de crear su primera franja; desde «Mi agenda» puede cambiarla, con aviso de lo que implica
- [ ] El calendario de «Mi agenda» muestra franjas, bloqueos y clases reservadas en la zona del tutor, con etiqueta de zona y el indicador de «ahora» correcto
- [ ] Un valor de zona invalido no puede guardarse (validacion en API y en BD) y nunca rompe `/api/availability/open-times`
- [ ] `npx tsc --noEmit`, `npm run lint` y `npm run check:i18n-scopes` pasan; flujo verificado en navegador con cuentas de prueba (prefijo `QA-`, limpieza final) y `browser.newContext({ timezoneId })`

### Comportamiento Esperado

**Tutor**
1. Abre «Mi agenda». Si su zona ya esta fijada, ve arriba «Horas en tu zona: La Habana (GMT-4) · Cambiar». El aviso ambar de «hora de Madrid» desaparece.
2. Si no tiene zona (tutor nuevo), antes de su primera franja se le pide confirmar la zona, precargada con la del navegador. Lo mismo en el paso 2 de «Publicar curso» (alta de agenda).
3. Crea franjas semanales, bloqueos y franjas extra **en su hora**. Las fechas de bloqueos/extras son fechas de su calendario local.
4. El calendario pinta franjas (verde), bloqueos (rojo) y clases reservadas en su zona. Si la zona del navegador difiere de la guardada, un aviso discreto lo indica («Tu navegador esta en hora de Madrid; tu agenda usa La Habana»).
5. Si cambia de zona: dialogo de confirmacion explicando que sus franjas mantienen la hora local (10:00 sigue siendo 10:00 en la nueva zona) y que las clases ya reservadas no se mueven.

**Estudiante**
- Sin cambios visibles: el selector sigue recibiendo horas en wall-clock Madrid y las muestra en la zona de su navegador. Solo cambia que esas horas ahora respetan la zona del tutor.

---

## Contexto

### Estado actual (investigado)
- **Columna**: `tutor_profiles.timezone text null` ya existe en la BD (sin default ni validacion); los 4 tutores la tienen a `null`. No hay ninguna UI que la escriba (solo `TeacherProfileClient` la usa como fallback de «ubicacion»). `src/types/tutor.ts` ya la tipa.
- **Datos en vivo (2026-10-28)**: 1 franja activa (1 tutor), 0 excepciones futuras, 0 clases futuras `scheduled`/`in_progress`. Migrar es barato.
- **Motor**: `computeOpenStartTimes` (`src/lib/availability/openStartTimes.ts`) es puro y trabaja en «minutos de calendario» asumiendo que franjas, excepciones, clases y `minStart` estan TODAS en wall-clock Madrid. `loadOpenStartTimes` (`src/lib/availability/loadOpenStartTimes.ts`) carga reglas/excepciones por fecha Madrid y lo usan `/api/availability/open-times` y `requestCourseBooking` (validacion de la hora pedida: dia Madrid `fromDate = toDate`).
- **Helpers de zona**: `lessonTime.ts` (instante → wall-clock Madrid) y `viewerTime.ts` (`zoneOffsetMs` privado, `lessonTimestampToDate` fijo a Madrid, `formatLessonTimestamp`, `timeZoneLabel`, `useViewerTimeZone`). Falta la conversion generica «wall-clock en zona X ↔ instante».
- **API de agenda**: `/api/availability/rules` y `rules/[id]` solo guardan horas (sin logica de zona). `/api/availability/exceptions` compara `exception_date + end_time` con `nowAsLessonTimestamp()` (Madrid) y cuenta `bookedConflicts` comparando horas de bloqueo con horas Madrid de las clases. Conserva ademas codigo del modelo de slots (retirar lecciones `available`, con `new Date(y, m, d)` en hora del servidor) que ya no tiene datos: es codigo muerto previo, se menciona, no se borra salvo OK.
- **UI**: `RecurringAvailabilityManager.tsx` (aviso `weeklyGenerationNote` con «hora de Madrid», `<input type="time">`), `AddAvailabilityModal.tsx` (fecha por defecto con `new Date()` del navegador), `AvailabilityCalendar.tsx` (FullCalendar sin `timeZone`; franjas con `new Date("YYYY-MM-DDTHH:mm")` = hora del navegador; clases con `new Date(scheduledDateTime)` = Madrid leido como local; rango enviado a `/api/bookings/tutor/calendar` en ISO UTC y comparado contra wall-clock Madrid), `TutorCoursesManager.tsx` (paso 2 de agenda al publicar curso).
- **No afectados**: `lessons.scheduled_date_time`, `BookingPicker`, custom requests, Google Calendar (envia Madrid + `BUSINESS_TIMEZONE`), caducidad de pendientes, cron diario. `releaseLesson` solo evalua lecciones legacy sin `course_id` (no quedan futuras).

### Decisiones tecnicas clave

**1. Que significa una franja guardada**

| Opcion | Pros | Contras |
|--------|------|---------|
| **A. Wall-clock en la zona del tutor (recomendada)** — `tutor_availability`/`availability_exceptions` no cambian de forma; sus horas y fechas se interpretan en `tutor_profiles.timezone` | Sin cambio de esquema en la agenda; respeta el DST de cada pais por fecha; los datos actuales siguen valiendo con zona `Europe/Madrid` | El motor convierte por fecha (algo mas de calculo) |
| B. Convertir a Madrid al guardar | Motor intacto | Una regla semanal no tiene un equivalente fijo en Madrid cuando los DST difieren; puede cambiar de dia de la semana |
| C. Guardar en UTC | Estandar | Mismo problema que B con el DST del tutor |

**2. Motor**: `computeOpenStartTimes` pasa a trabajar en **instantes** (epoch). Recorre las fechas locales del tutor que
cubren el rango Madrid pedido (±1 dia), genera candidatos en la rejilla de 30 min **en hora del tutor**, los convierte a
instante, filtra contra bloqueos (en hora del tutor), clases ocupadas y `minStart` (convertidos desde Madrid) y devuelve
wall-clock Madrid dentro de `[fromDate, toDate]` Madrid. Con zona `Europe/Madrid` el resultado debe ser identico al de hoy.
Horas inexistentes (salto de primavera) se omiten; horas ambiguas (otono) toman la primera ocurrencia.

**3. Calendario**: sin dependencia nueva. FullCalendar con `timeZone="UTC"` y eventos como strings sin offset que ya
representan la hora del tutor (y `now` = ahora en la zona del tutor). Alternativa: plugin `@fullcalendar/luxon3`
(anade dependencia; no se propone).

**4. Escritura de la zona**: por API (`PATCH /api/availability/timezone`, validacion manual con `Intl`) y validada tambien en
BD (trigger contra `pg_timezone_names`), porque un valor invalido romperia el motor. El motor ademas cae a Madrid si la
zona no es valida (defensa en profundidad, con log).

### Arquitectura Propuesta (estructura real del repo)
```
supabase/migrations/046_tutor_agenda_timezone.sql
src/lib/datetime/
  ├── zonedTime.ts            # NUEVO: wallClockToDate(ts, tz), dateToWallClock(date, tz), isValidTimeZone(tz)
  ├── lessonTime.ts           # sin cambios de API (puede reutilizar zonedTime)
  └── viewerTime.ts           # lessonTimestampToDate delega en zonedTime
src/lib/availability/
  ├── openStartTimes.ts       # motor por instantes con tutorTimeZone
  └── loadOpenStartTimes.ts   # carga la zona del tutor y amplia el rango de excepciones ±1 dia
src/app/api/availability/
  ├── timezone/route.ts       # NUEVO: PATCH { timezone }
  └── exceptions/route.ts     # "ventana pasada" y bookedConflicts en zona del tutor
src/app/api/bookings/tutor/calendar/route.ts   # rango recibido convertido a wall-clock Madrid
src/components/teacher/
  ├── AgendaTimeZoneField.tsx          # NUEVO: etiqueta + selector + dialogo de cambio
  ├── RecurringAvailabilityManager.tsx # sin aviso Madrid; usa el campo de zona
  ├── AvailabilityCalendar.tsx         # todo en zona del tutor
  ├── AddAvailabilityModal.tsx         # fecha por defecto = hoy en zona del tutor
  └── TutorCoursesManager.tsx          # paso 2 de agenda pide/confirma zona
messages/es.json, messages/en.json     # + src/i18n/clientMessages.ts si hay namespace nuevo
```

### Modelo de Datos (migracion 046, borrador)
```sql
-- Decision 1: todos los tutores actuales empiezan en Europe/Madrid (la cambian si hace falta).
update public.tutor_profiles set timezone = 'Europe/Madrid' where timezone is null;

-- Solo zonas IANA validas (un valor invalido romperia el calculo de horas libres).
create or replace function public.tutor_profiles_validate_timezone() returns trigger
language plpgsql as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger tutor_profiles_validate_timezone
  before insert or update of timezone on public.tutor_profiles
  for each row execute function public.tutor_profiles_validate_timezone();

-- Comentarios de columna: horas/fechas de tutor_availability y availability_exceptions
-- son wall-clock en tutor_profiles.timezone (null = Europe/Madrid).
```

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar en cada fase (bucle agentico).

### Progreso (2026-10-28)
- [x] Fase 1 — `200da8d` (046 aplicada en prod: 4 tutores en Madrid, trigger de validacion)
- [x] Fase 2 — `200da8d` (motor por instantes; 300 agendas aleatorias identicas al motor anterior en Madrid; casos La Habana/Mexico/DST/medianoche OK con TZ=UTC; 8 semanas densas en ~114 ms)
- [x] Fase 3 — `ec9fa5e` (PATCH zona, excepciones y calendario API en zona del tutor)
- [x] Fase 4 — `737cb7b` (UI; E2E con el tutor de prueba y navegador en America/Havana: cambio de zona por UI, zona invalida 400, extra pasado 400, extra 10-12 Havana → open-times 15:00/15:30/16:00 Madrid, indicador «ahora» correcto; datos QA borrados y zona restaurada a Madrid)
- [x] Fase 4b — WhatsApp al tutor (`booking_request`, `booking_custom_request`, `booking_cancelled`) con la hora en su zona y etiqueta «(hora de Havana)»; la cancelacion al tutor ahora lleva la hora. Las notificaciones in-app no muestran hora en su texto: nada que cambiar. Simulado sin enviar (Havana 09:00 = Madrid 15:00 el 3/11)
- [x] Fase 5 — build OK; E2E en build de produccion: tutor en La Habana con extra 08:00-10:00 del 31/10 → estudiante en Madrid ve 13:00 (CET) y en Mexico 06:00 (GMT-6), reserva desde Mexico guarda 13:00 Madrid y el calendario del tutor la pinta 8:00-9:00; datos QA borrados y zona restaurada. `TutorCoursesManager` no tiene paso de agenda propio: no necesita campo de zona.

### Fase 1: Base de datos (migracion 046)
**Objetivo**: zona fijada para los tutores con agenda, validacion de zonas en BD, semantica documentada en comentarios.
**Validacion**: prueba en seco (`begin … rollback`) con zona valida, invalida (falla) y `null`; OK del usuario antes de aplicar; `supabase db query` confirma trigger y valores.

### Fase 2: Conversion de zonas y motor
**Objetivo**: `zonedTime.ts` generico; `computeOpenStartTimes` por instantes con `tutorTimeZone`; `loadOpenStartTimes` carga la zona y el rango ampliado; `requestCourseBooking` sigue validando contra el mismo motor.
**Validacion**: script `tsx` de casos (ver criterios) con `TZ=UTC`, incluida la igualdad exacta con el motor actual para `Europe/Madrid`; `tsc` limpio.

### Fase 3: API de agenda
**Objetivo**: `PATCH /api/availability/timezone`; `exceptions` evalua «ventana pasada» y `bookedConflicts` en la zona del tutor; `/api/bookings/tutor/calendar` interpreta el rango correctamente.
**Validacion**: llamadas a la API con cuenta de prueba (zona valida/invalida, extra pasado en su zona, bloqueo sobre clase reservada); `tsc` + lint.

### Fase 4: UI del tutor
**Objetivo**: campo de zona (confirmar la primera vez, cambiar con dialogo) en «Mi agenda» y en el paso 2 de «Publicar curso»; calendario y modal de franja extra en la zona del tutor; aviso si el navegador esta en otra zona; textos `es`/`en`.
**Validacion**: navegador como tutor de prueba con `timezoneId` `America/Havana` y `Europe/Madrid`: crear franja, bloquear dia, extra; el calendario coincide con lo introducido.

### Fase 4b: Avisos al tutor en su zona
**Objetivo**: `buildWhatsAppMessage` y los textos de notificacion dirigidos al tutor formatean la hora en `tutor_profiles.timezone` (con etiqueta de zona); los del estudiante no cambian.
**Validacion**: script con un `booking_request` simulado para un tutor en `America/Havana` (sin enviar nada); `tsc` + lint.

### Fase 5: Validacion Final
**Objetivo**: sistema funcionando end-to-end y documentacion al dia.
**Validacion**:
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n-scopes`, `npm run build`
- [x] Playwright: tutor en La Habana crea agenda → estudiante en Madrid y otro en Mexico ven las horas correctas y reservan → la clase aparece en el calendario del tutor a su hora local
- [x] Datos `QA-` borrados
- [x] `BUSINESS_LOGIC.md` (linea «La agenda del tutor se introduce, de momento, en hora de Madrid»), `.claude/memory/project/business-timezone-madrid.md`, `reference/supabase-setup.md` (ultima migracion) y CLAUDE.md (siguiente migracion) actualizados; FRE0007 marcado con los commits

---

## Decisiones de producto (2026-10-28)

1. **Tutores actuales**: todos se fijan a `Europe/Madrid`; cada uno la cambia si hace falta. Un tutor nuevo sin zona la confirma (precargada con la del navegador) antes de su primera franja.
2. **Cambio de zona**: las franjas conservan su hora local (10:00 sigue siendo 10:00 en la nueva zona); las clases ya reservadas no se mueven.
3. **Rejilla**: las horas de inicio cada 30 min se alinean a la hora del tutor (en zonas :30/:45, Madrid veria p. ej. 10:15).
4. **Avisos al tutor**: las notificaciones in-app y los WhatsApp que recibe el tutor muestran la hora en SU zona (Fase 4b).

---

## Aprendizajes (Self-Annealing)

> Crece con cada error encontrado durante la implementacion.

### 2026-10-28: FullCalendar entra en bucle con `now` inline
- **Error**: «Maximum update depth exceeded» al abrir Disponibilidad: pasar `now={() => ...}` crea una funcion nueva en cada render, FullCalendar resetea la vista, dispara `datesSet`, cambia el estado y vuelve a renderizar.
- **Fix**: `const calendarNow = useCallback(() => new Date(`${epochToWallClock(Date.now(), tz)}Z`), [tz])`.
- **Aplicar en**: cualquier prop funcion/objeto de FullCalendar (memoizar).

### 2026-10-28: `tutor_profiles` no tiene `updated_at`
- **Error**: el PATCH de zona escribia `updated_at` (columna inexistente).
- **Fix**: solo `{ timezone }`; comprobar columnas con `information_schema` antes de escribir.

---

## Gotchas

- [ ] `lessons.scheduled_date_time` y todo lo que se compara con el sigue en Madrid: la conversion vive SOLO en el motor y en la UI de agenda. Nunca `new Date(scheduled_date_time)`.
- [ ] Una franja del tutor puede caer en dos dias Madrid (o en otro dia de la semana): iterar fechas del tutor que cubran el rango Madrid ±1 dia y filtrar la salida por fecha Madrid.
- [ ] `requestCourseBooking` valida con `fromDate = toDate = dia Madrid`: el motor tiene que encontrar franjas cuyo dia local del tutor sea el anterior o el siguiente.
- [ ] Excepciones: `exception_date` es fecha del tutor; ampliar la consulta ±1 dia respecto al rango Madrid.
- [ ] DST: horas inexistentes se saltan, ambiguas toman la primera ocurrencia; probar marzo/octubre (Europa) y marzo/noviembre (Cuba), y una zona sin DST (`America/Mexico_City`).
- [ ] `Intl` y `pg_timezone_names` pueden diferir en alias raros; el selector ofrece `Intl.supportedValuesOf('timeZone')` y la BD es la ultima palabra (mapear su error a 400).
- [ ] FullCalendar con `timeZone="UTC"`: alimentar strings sin offset en hora del tutor y fijar `now`; si no, el indicador de «ahora» y «hoy» salen en UTC.
- [ ] `useViewerTimeZone` sigue siendo la zona del navegador para el resto de vistas (solicitudes, dashboard): solo la agenda usa la zona guardada.
- [ ] `exceptions/route.ts` conserva codigo del modelo de slots (retirada de lecciones `available` con hora del servidor): codigo muerto previo, mencionarlo y no tocarlo sin OK.
- [ ] Pruebas solo con cuentas de prueba y prefijo `QA-`; nada explotable en archivos versionados.

## Anti-Patrones

- NO crear nuevos patrones si los existentes funcionan (route handler + service role, validacion manual, helpers de `src/lib/datetime/`)
- NO anadir dependencias (luxon, date-fns-tz, plugin de FullCalendar) sin preguntar: `Intl` basta
- NO ignorar errores de TypeScript ni usar `any`
- NO hardcodear strings de UI ni valores de negocio (rejilla, horizonte, zona por defecto en constantes)
- NO anadir Zod
- NO usar `rounded-md/lg/xl/2xl`
- NO comparar horas de clase con `new Date().toISOString()` ni con la hora local del servidor

---

*PRP aprobado el 2026-10-28; implementacion con bucle-agentico.*
