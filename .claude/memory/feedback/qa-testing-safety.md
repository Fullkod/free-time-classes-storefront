# Pruebas contra la BD real y repo publico

**Regla:** la BD de Supabase es la real del piloto: hay estudiantes y profesores reales con WhatsApp activado.
Para probar flujos (E2E, Playwright, API) usar SOLO las cuentas de prueba indicadas en la tarea de Tasknic
(FRE0002 tiene un estudiante y un profesor de prueba) y nunca reservar, escribir, valorar ni marcar favorito a
otro usuario.

**Por que:** cada reserva/mensaje dispara `insertNotification()` y WhatsApp al destinatario; una prueba contra un
profesor real le llega al movil.

**Como aplicar:**
- Prefijar todo dato creado con `QA-<codigo tarea>` y apuntar cada id creado para limpiarlo al final.
- Mutaciones minimas. La limpieza que la API no permite se hace con la service role desde un script local
  (fuera del repo), filtrando por id + cuentas de prueba + fecha, y avisando al usuario antes.
- Revisar tras cada sesion de pruebas que no queden filas QA en `lessons`, `bookings`, `notifications`,
  `tutor_availability`/`availability_exceptions` ni cursos `QA-` (y sus imagenes en Storage). Desde PRP-001 una
  franja de agenda de prueba hace reservables horas reales del tutor QA: borrarla al acabar.
- El repo es publico (decision 2026-10-19, no se va a privatizar): nunca escribir credenciales, ni detalles
  explotables de vulnerabilidades, en archivos versionados (codigo, memoria, PRPs, commits). Los informes de
  auditoria van a `docs/audits/` (local) y a Tasknic.

**Pruebas con escritura en produccion (2026-10-28, con OK explicito del usuario):** para probar el flujo con Google
Meet hizo falta una cuenta de profesor con Google conectado. El usuario autorizo usar la de Claudia (miembro del
equipo). Se entro sin su contrasena: `auth.admin.generateLink({type:"magiclink"})` + `verifyOtp({token_hash})` en un
script local y la cookie de `@supabase/ssr` construida a mano (no cambia nada de la cuenta ni envia correo). Antes de
escribir, comprobar `users.receive_whatsapp_notifications` de las cuentas implicadas (si esta activo, la prueba le
llega al movil). Al confirmar, Google manda invitacion y cancelacion por correo a los asistentes (`sendUpdates=all`):
no se puede deshacer, avisar. Usar una cuenta real ajena SIEMPRE requiere un OK nuevo del usuario en esa sesion.
