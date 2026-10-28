# Auditoria pre-piloto FRE0002 y plan de correccion

Auditoria general del 2026-10-19 (tarea Tasknic FRE0002): 14 auditores (9 de codigo + 5 E2E en navegador con las
cuentas de prueba de FRE0002), 5 auditorias de huecos y verificacion adversarial de cada hallazgo. Resultado:
135 hallazgos (7 criticos, 28 altos, 58 medios, 42 bajos). Veredicto: **no listo para el piloto** hasta cerrar la Fase 0.

**Donde esta el detalle:** `docs/audits/2026-10-19-FRE0002-auditoria.md` (plan completo: metricas, estrategia de
cache, flujo de cursos propuesto, fases) y `docs/audits/2026-10-19-FRE0002-findings.json` (hallazgos en bruto con
evidencias y votos). Ambos son locales (docs/ no va a git) porque el repo es publico: los detalles de seguridad
NO se copian aqui ni a ningun archivo versionado.

**Seguimiento (estado siempre en vivo en Tasknic, nunca copiado aqui):**
- FRE0007: tarea padre del plan (contexto, orden de ataque, decisiones de producto pendientes)
- FRE0008 WP1 Seguridad BD/RLS · FRE0009 WP2 Auth y sesion · FRE0010 WP3 Google Calendar/Meet
- FRE0011 WP4 Disponibilidad y slots · FRE0012 WP5 Ciclo de reservas · FRE0013 WP6 Flujo de cursos
- FRE0014 WP7 Cache y rendimiento · FRE0015 WP8 Mensajeria, notificaciones y WhatsApp
- FRE0016 WP9 i18n, DS y UX · FRE0017 WP10 Operacion y produccion
Cada WP lleva un checklist por fase con ids de hallazgo (F0xx / G-xxx), evidencia `archivo:linea` y fix propuesto.
Al cerrar un item: marcarlo en la descripcion de su WP y citar el commit.

**Orden de ataque acordado:** Fase 0 transversal primero, empezando por una migracion `028` (WP1); luego cron de
slots + completado (WP4/WP5), Cancelar/Rechazar via API (WP5), crash del catalogo e invalidacion de cache
(WP6/WP7), i18n bajo /es (WP9), sesion (WP2), OAuth Google (WP3) y timeout de OpenWA (WP8). Despues Fases 1-3.

**Problemas estructurales que encontro la auditoria y como quedaron resueltos:**
- Slots pregenerados que nadie renovaba -> ya no hay huecos pregenerados: las horas libres se calculan al pedirlas
  (`src/lib/availability/openStartTimes.ts`) y la clase se crea al reservar (PRP-001, `.claude/PRPs/prp-course-booking-unit.md`).
  El cron diario solo completa clases y purga datos.
- Curso y clase sin vincular -> `course_id` en clases y reservas (migracion 041); el curso fija precio y duracion.
- Caches del catalogo sin invalidar -> `revalidateCatalog()` tras cada mutacion; detalles ISR. Ver `reference/caching-performance.md`.
- UI escribiendo directo en Supabase -> cursos solo via `/api/courses` (042), reservas solo via `/api/bookings/*`.
  Regla que sigue vigente: al arreglar algo, pasar siempre por la API existente.

**Como se ataca (desde 2026-10-20):** un commit por hallazgo, marcado en el checklist de su WP con el hash; las
migraciones del plan van de la 028 a la 042 (una por hallazgo, probadas en seco y con roles simulados antes de aplicar, con OK
del usuario). F021/F022 se hicieron con el PRP-001 (migraciones 041-042); F036 sigue bloqueado por la decision de resenas. Hallazgo nuevo anadido: G-new-1
en FRE0012. El estado vivo esta en el borrador/comentarios de FRE0007, no aqui.

**Decisiones tomadas (2026-10-19):** el repo se queda publico (cuentas gratuitas para publicar); datos QA de la
auditoria borrados; keepalive de Supabase reactivado (moverlo a Vercel Cron va en FRE0017).
**Decisiones tomadas (2026-10-20):** curso = unidad de reserva al estilo italki (agenda general del tutor, el curso fija
precio y duracion, `course_id` en clase y reserva); cancelacion 24 h; horas convertidas a la zona del usuario (BD sigue
en Madrid); EUR para todo. Recogidas tambien en BUSINESS_LOGIC.md §5.
**Decisiones del PRP-001 (2026-10-20):** inicio cada 30 min, sin margen, 8 semanas; duraciones 30/45/60/90/120;
sin cursos gratuitos; la solicitud de otra hora va ligada a un curso; curso con historial se archiva; las horas libres
son publicas. La agenda del tutor sigue en hora de Madrid (mostrarla en su zona es decision pendiente).
**Decisiones tomadas (2026-10-28), cierran las 11 pendientes de FRE0007:** pendiente caduca a las 48 h o 2 h antes
de la clase (F014); resenas solo de clases completed, una por clase, 30 dias (F036); «Solo con reserva» se implementa
(F081); WhatsApp opt-in con fecha de consentimiento (F097); estudiante -> tutor libre e inmediato (F043); materias:
tutores crean, quitar solo desvincula, borrado global solo admin (F056); onboarding tutor = tarjeta checklist de 3
pasos (G-signup-6); «Explorar» -> /courses (F096); Supabase sigue gratis + keepalive en Vercel Cron (G-prod-1);
funciones Vercel a pdx1 (G-prod-4); agenda del tutor en SU zona horaria ya (`tutor_profiles.timezone`, con migracion).
Matices posteriores (28/10): F097 desactivo WhatsApp a TODOS los existentes (044, cada uno lo reactiva en Ajustes);
F081 aplica solo a estudiantes y ya lo cumplia la RLS (039), asi que se quito el selector; reseñas: RLS en la 045.
Agenda en la zona del tutor: PRP-002 (`.claude/PRPs/prp-tutor-agenda-timezone.md`), su estado de fases vive en el PRP.
Decisiones nuevas que surjan: preguntar, no inventar.

**Cierre (2026-10-28):** con el OK del usuario se cerraron FRE0007 y todos los WP. F103 (baseline del esquema con
`supabase db dump`, necesita la contrasena de la BD) se separo a FRE0018. Antes del cierre se probo en produccion
(lectura y escritura con limpieza; ver `reference/local-verification.md`), lo que destapo un error de hidratacion fuera
de la hora de Madrid (`b23d962`). Despliegue registrado en Tasknic con las migraciones 028–052. Siguen pendientes de
hacer a mano: avisar a los tutores del piloto de que reactiven WhatsApp y rehacer los eventos de Meet de las clases 33,
35, 36 y 37.
