# BUSINESS_LOGIC.md - Free Time Classes

> Generado por Titan Factory | Fecha: 2026-10-19
> Reconstruido a partir de `docs/proyecto-maestro.md`, `docs/design/REDESIGN.md`, `docs/OPENWA_IMPLEMENTATION_PLAN.md`
> y del codigo actual (no de una entrevista `new-app`). Lo marcado **[POR DEFINIR]** no esta documentado:
> completarlo con el equipo en vez de inventarlo.

## 1. Problema de Negocio

**Dolor:** quien quiere aprender (sobre todo idiomas) tiene poco tiempo libre y le cuesta encontrar un profesor
con huecos compatibles, reservar sin ida y vuelta de mensajes y pagar en el momento. Al profesor particular le
cuesta darse a conocer, gestionar su agenda y cobrar.

**Costo actual:** [POR DEFINIR — horas perdidas coordinando por WhatsApp/email, clases no cobradas, huecos vacios]

## 2. Solucion

**Propuesta de valor:** marketplace de clases particulares online, "aprender en los huecos de la vida":
el estudiante descubre profesores por materia, nivel, precio e idioma, ve su disponibilidad real y reserva en
segundos; el profesor publica perfil, tarifa y horario y gestiona solicitudes desde la web, la app o respondiendo
por WhatsApp. Las clases son online (enlace de videollamada / Google Meet).

**Flujo principal (Happy Path):**
1. El profesor se registra, completa su perfil (bio, idiomas, materias, CV), publica cursos (materia, precio > 0,
   duracion 30/45/60/90/120) y define su agenda: franjas semanales + excepciones (bloqueos y franjas extra).
2. Las horas libres de cada curso se calculan al pedirlas (PRP-001): franjas − bloqueos − clases ya comprometidas,
   cada 30 min, donde quepa la duracion del curso, desde 30 min a 8 semanas vista.
3. El estudiante explora cursos, elige una hora libre y envia la solicitud: se crea la clase con el precio y la
   duracion del curso (`course_id` en clase y reserva) y el booking `pending`.
4. El profesor recibe notificacion (in-app + WhatsApp) y acepta o rechaza (web o respondiendo "SI"/"NO" por WhatsApp). Al aceptar puede anadir el enlace de videollamada.
5. El estudiante recibe la confirmacion con el enlace y entra a la clase desde "Mis clases" / dashboard.
6. Tras la clase, el estudiante deja una resena (1-5 + comentario); el rating del profesor se recalcula solo.

**Flujo alternativo — clase fuera de disponibilidad (custom request):** el estudiante elige uno de los cursos del
profesor y pide un dia/hora fuera de su agenda. Precio y duracion salen del curso. Si al confirmar faltan
menos de 15 min para el inicio, la solicitud se rechaza automaticamente por expirada.

## 3. Usuario Objetivo

**Roles:**
- **Estudiante** — adulto con poco tiempo, mobile-first, aprende sobre todo idiomas (niveles CEFR beginner → proficient).
- **Profesor (tutor)** — profesor particular independiente que quiere captar alumnos y llenar su agenda.
- Un mismo usuario puede ser estudiante y profesor a la vez (`is_student` + `is_tutor`).

**Contexto:** negocio en Espana (hora de negocio Europe/Madrid, idioma por defecto espanol, tambien ingles).
Uso principal en movil (BottomNav, app nativa via Capacitor) y desktop para profesores.

## 4. Arquitectura de Datos

**Input:**
- Perfiles de usuario, estudiante y profesor (bio, tarifa, idiomas, materias, CV, telefono + opt-in WhatsApp)
- Horario recurrente y excepciones del profesor
- Cursos (materia, nivel, precio/sesion, duracion, max alumnos)
- Solicitudes de reserva, respuestas del profesor, cancelaciones, resenas, mensajes
- Respuestas por WhatsApp (webhook OpenWA)

**Output:**
- Catalogo de profesores y cursos con filtros (materia, nivel, precio, rating, duracion)
- Disponibilidad real por dia/slot
- Reservas y "Mis clases" (proximas / pasadas / canceladas), dashboards de estudiante y profesor
- Notificaciones in-app + WhatsApp, eventos de Google Calendar con Meet

**Storage (tablas Supabase principales):**
- `users`, `student_profiles`, `tutor_profiles`: identidad y perfiles por rol
- `subjects`, `tutor_subjects`, `courses`: catalogo
- `tutor_availability`, `availability_exceptions`: agenda (solo horas); `lessons`: clases reservadas (`course_id`)
- `bookings`: solicitudes (por curso u otra hora) y su estado
- `reviews`: resenas con respuesta del profesor
- `conversations`, `conversation_participants`, `messages`: mensajeria interna
- `notifications`: notificaciones in-app
- `wa_messages`, `wa_inbound_events`: trazabilidad e idempotencia de WhatsApp
- `student_favorite_tutors`, tokens de Google Calendar, ajustes de privacidad

## 5. Reglas de Negocio

- **Estados de booking:** `pending` → `confirmed` | `rejected` | `cancelled` → `completed`.
- **Cancelacion del estudiante:** puede cancelar `pending` siempre y `confirmed` hasta N horas antes (`STUDENT_CANCEL_HOURS` en `src/lib/bookings/cancellationPolicy.ts`).
  Regla oficial (decision 2026-10-20): **24 h** antes del inicio, contadas en hora de Madrid.
- **Custom request:** expira si el inicio esta a menos de 15 min (`CUSTOM_REQUEST_EXPIRY_MINUTES`).
- **Horas:** todo se guarda e interpreta en hora de Madrid (wall-clock), independientemente de donde corra el servidor. Decision 2026-10-20: al usuario se le muestran en la zona horaria de su navegador (con etiqueta de zona); el estudiante que pide otra hora la escribe en su hora local. La agenda del tutor se introduce, de momento, en hora de Madrid.
  De cara al usuario (decision 2026-10-20) las horas se **convierten a la zona horaria del usuario** y se indica la zona.
- **Moneda:** EUR para todo (decision 2026-10-20).
- **Curso como unidad de reserva** (decision 2026-10-20, modelo tipo italki): la disponibilidad es una agenda general
  del profesor; el curso fija precio y duracion, y la clase reservada queda ligada al curso.
- **Notificaciones** (`booking_request`, `booking_custom_request`, `booking_confirmed`, `booking_rejected`,
  `booking_cancelled`, `booking_expired`, `message_received`): siempre in-app; por WhatsApp si el usuario tiene
  telefono y consentimiento explicito (opt-in en Ajustes, desactivado por defecto, con fecha de consentimiento).
- **Caducidad de pendientes:** una solicitud sin respuesta caduca a las 48 h o 2 h antes de la clase (lo que llegue
  antes); se libera la hora y se avisa al estudiante.
- **Resenas:** una por clase completada; el rating y el total de resenas del profesor se recalculan por trigger.
- **Privacidad:** el usuario puede exportar sus datos y borrar su cuenta (GDPR).

## 6. Modelo de Ingresos

Previsto en el doc maestro: **comision de la plataforma** (ej. 15-20%) sobre cada clase, con pago en el momento de
reservar y liquidacion al profesor al completarse la clase (Stripe Connect). Reembolso automatico si el profesor rechaza.
**Estado: no implementado.** [POR DEFINIR] proveedor final (Stripe Connect vs. otro), % de comision, politica de
penalizacion al profesor por cancelacion tardia.

## 7. KPI de Exito

**Metrica principal:** [POR DEFINIR]. Candidatas: clases completadas/mes, % de solicitudes aceptadas,
tiempo medio de respuesta del profesor, profesores activos con slots publicados, retencion de estudiantes (racha).

## 8. Especificacion Tecnica (Para el Agente)

### Modulos y estado
| Modulo | Estado |
|--------|--------|
| Auth + registro por rol + verificacion email | Hecho |
| Perfiles estudiante / profesor (avatar, CV, materias) | Hecho |
| Catalogo cursos/profesores + busqueda y filtros | Hecho |
| Disponibilidad recurrente + excepciones + slots | Hecho |
| Reservas, custom requests, cancelaciones | Hecho |
| Resenas y ratings | Hecho |
| Mensajeria interna | Hecho |
| Notificaciones in-app | Hecho |
| Notificaciones WhatsApp (OpenWA, outbound + respuesta SI/NO) | Hecho (checklist de produccion pendiente) |
| Videollamada: enlace manual + Google Calendar/Meet | Hecho |
| Rediseno FreeTime (fases 0-8) | Hecho, falta limpieza de tokens legacy |
| Pagos (Stripe Connect) | Pendiente |
| Emails transaccionales (Resend) | Pendiente |
| Push movil (Capacitor + FCM) | Pendiente |
| Pantalla "Lesson live" / modo audio manos libres | Pendiente (hoy decorativo) |
| Tests automatizados | Pendiente |

### Stack Confirmado
Ver `CLAUDE.md` (Next.js 15.2, next-intl, Supabase, Capacitor, Tailwind + DS FreeTime, OpenWA, Google Calendar).

### Proximos Pasos
1. [ ] Decidir modelo de cobro y proveedor → PRP de pagos
2. [ ] Emails transaccionales (Resend) para los mismos eventos que las notificaciones
3. [ ] Cerrar checklist de produccion de WhatsApp (VPS, numero dedicado, alertas de desconexion)
4. [ ] Limpieza de tokens legacy del rediseno (Plus Jakarta, `--primary` morado)
5. [ ] Push movil (Capacitor + FCM)
6. [ ] Suite de tests E2E de los flujos de reserva
7. [ ] Definir KPI principal y medirlo
