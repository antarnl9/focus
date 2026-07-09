# Focus — Especificación de plataforma (T1 Focus)

**Versión:** 1.1 · **Fecha:** Julio 2026 · **Owner:** COO T1 (antar@t1.com)
**Stack decidido:** Railway (app + workers) · Supabase (Postgres, Auth, Storage) · Slack API · Google Calendar API · Anthropic API
**Objetivo:** plataforma web (y PWA móvil) que organiza el día del COO, canaliza las dudas del equipo vía Slack con contexto obligatorio, graba y transcribe juntas, y genera automáticamente el Daily de cierre.

---

## 1. Problema y visión

El COO recibe interrupciones constantes (dudas, requerimientos, decisiones) que fragmentan su día e impiden trabajar definiciones estratégicas. Las decisiones se toman sin contexto escrito, el seguimiento se pierde, y el reporte diario al CEO depende de la memoria.

**Visión:** un solo lugar donde el COO ve su día en bloques, recibe las dudas pre-filtradas y con contexto, graba cada junta sin fricción, y cierra el día con un Daily generado automáticamente a partir de lo que realmente pasó.

**Principios de diseño:**
1. Cero fricción: nada debe tomar más de 1 clic durante el día.
2. El contexto viaja por escrito antes que la persona.
3. Todo lo resuelto deja rastro (bitácora automática).
4. La app empuja (recordatorios), el COO no tiene que acordarse.

---

## 2. Usuarios y roles

| Rol | Acceso | Uso principal |
|---|---|---|
| COO (admin) | Total | Dashboard, ventanas de dudas, Daily, grabaciones |
| Equipo (~15 personas) | Solo vía Slack | Enviar dudas con formato, recibir resoluciones |
| CEO (lector) | Canal Slack #daily-coo | Recibe el Daily cada noche |

No se requiere que el equipo entre a la plataforma: toda su interacción es por Slack. Esto es clave para la adopción.

---

## 3. Módulos funcionales

### 3.1 Agenda del día (bloques)
- Plantilla de día configurable por el COO (bloques con hora inicio/fin, tipo: `fija`, `protegido`, `dudas`, `flex`, `neutral`).
- Plantilla base inicial (horario 10:30–21:00):
  - 10:30–10:45 Revisar plan del día
  - 10:45–11:45 Reportes — owners juntos
  - 11:45–12:15 Cotizador T1 Envíos
  - 12:15–12:45 T1 Merch
  - 12:45–13:00 Landing t1.com
  - 13:00–13:30 T1 Global
  - 13:30–14:30 Flexible
  - 14:30–15:15 Comida
  - 15:15–16:00 **Ventana de dudas 1**
  - 16:00–18:00 **Definición (protegido)**
  - 18:00–19:00 Flexible
  - 19:00–19:45 **Ventana de dudas 2**
  - 19:45–20:45 Flexible 2
  - 20:45–21:00 **Daily**
- Sincronización bidireccional con Google Calendar:
  - *Lectura:* eventos externos del día se muestran mezclados con los bloques.
  - *Escritura:* al configurar la plantilla, la app crea los eventos recurrentes en Calendar marcados como "ocupado", para que nadie pueda agendar encima de bloques protegidos.
- Indicador "ahora": bloque activo resaltado, bloques pasados atenuados.
- Contador visible: minutos para la próxima ventana de dudas.

### 3.2 Dudas (workflow Slack)
- Canal dedicado `#dudas-coo`. Regla: dudas por DM se redirigen al canal (mensaje automático del bot).
- **Slack Workflow / modal del bot** con formato obligatorio:
  - Contexto
  - Decisión que necesitan
  - Opciones que ven
  - Recomendación del owner
  - Impacto si no se decide hoy
  - Checkbox: "¿Es urgencia real?" (cliente grande en riesgo / producción caída / dinero o reputación / bloqueo de lanzamiento P0)
- **Triage automático (IA):** cada duda nueva se clasifica:
  - `urgente` → notificación push/DM inmediata al COO.
  - `ventana` → se acumula para la próxima ventana de dudas.
  - Además la IA valida el formato: si falta contexto u opciones, el bot responde en el hilo pidiendo completarlo *antes* de que le llegue al COO.
- En la plataforma: lista de dudas pendientes agrupadas (urgentes arriba), con autor, tema, decisión pedida y recomendación del owner.
- Acciones del COO por duda:
  - **Resolver en hilo:** escribe (o dicta) la decisión; el bot la publica en el hilo de Slack y marca resuelta.
  - **Resolver en persona:** marca resuelta con nota; se registra en bitácora.
  - **Redirigir a owner:** selecciona a la persona (Charbel, Felipe, Greg, Abraham…); el bot notifica en el hilo "esto lo resuelve X" y lo saca de la cola del COO.
- 15 minutos antes de cada ventana: resumen automático al COO por DM ("Tienes 4 dudas: 1 urgente de Felipe sobre…").

### 3.3 Prioridades (foco)
- Lista P0 / P1 / P2 editable, persistente, siempre visible.
- Semilla inicial: Landing t1.com, T1 Global MX, Dashboards aprobados, Benchmark Tiendanube (P0); Cotizador→Abraham, Planes México/Enterprise (P1); T1 Merch (P2).
- Al completar una prioridad se registra en bitácora con timestamp.
- Regla visual: si una duda entrante no empuja un P0, la UI la etiqueta "puede esperar a ventana".

### 3.4 Grabación y transcripción de juntas
- Botón de grabar **por bloque** y **por evento de Calendar**; la grabación hereda el nombre de la junta.
- Al iniciar un bloque tipo `fija` o `dudas`, prompt automático: "¿Grabar esta junta?" (un tap).
- Cambio de junta con grabación activa → cierra y guarda la anterior automáticamente.
- Audio se sube a storage (no queda solo en el navegador).
- **Transcripción automática** al terminar (Whisper/Deepgram, es-MX).
- **Post-procesado IA por junta:** resumen, acuerdos, responsables, pendientes con fecha. Los pendientes se ofrecen para agregar a prioridades o bitácora.
- Consentimiento: aviso configurable al inicio de junta ("esta junta se graba"); banner legal en settings.

### 3.5 Bitácora del día
- Se llena automáticamente con: dudas resueltas, prioridades completadas, grabaciones guardadas, acuerdos extraídos de transcripciones.
- Entrada manual rápida (input de una línea + atajo).
- Vista cronológica del día; historial navegable por fecha.

### 3.6 Daily automático
- A las 20:45, notificación: "Genera tu Daily".
- La IA compone el Daily a partir de: bitácora + dudas resueltas/pendientes + prioridades + acuerdos de juntas del día. Formato:
  - ✅ Resuelto hoy
  - 🔄 En curso
  - 🎯 Mañana (top 3)
  - ⚠️ Riesgos / bloqueos
- Editable antes de enviar. Envío con un clic a `#daily-coo` (visible para el CEO).
- El "🎯 Mañana" precarga el bloque "Revisar plan del día" de la mañana siguiente.

---

## 4. Autenticación y acceso

- **Login exclusivamente con Google OAuth** (Supabase Auth, provider Google). Sin email/password, sin magic links.
- **Allowlist estricta:** solo `antar@t1.com` puede iniciar sesión. Implementación en dos capas:
  1. Google OAuth configurado con `hd=t1.com` (hosted domain) para limitar al dominio.
  2. Validación server-side post-login: si `email !== 'antar@t1.com'` → sesión rechazada. La allowlist vive en variable de entorno (`ALLOWED_EMAILS`) para poder agregar directivos en el futuro sin redeploy de lógica.
- **OAuth incremental:** el mismo consent de Google solicita también los scopes de Calendar (`calendar.events`), de modo que login y conexión del calendario de antar@t1.com ocurren en un solo flujo. Supabase guarda `provider_token` y `provider_refresh_token`; el backend los cifra y usa para el sync.
- Row Level Security (RLS) activado en todas las tablas de Supabase: cada fila pertenece a un `user_id` y solo su dueño la lee/escribe.
- El equipo NO tiene login: interactúa solo por Slack (el bot valida `slack_user_id` contra la tabla `users`).
- Sesiones: JWT de Supabase, refresh automático; expiración de sesión 30 días (es una herramienta personal de uso diario).

---

## 5. Integraciones

### 5.1 Slack (crítica)
- **App de Slack propia** (no webhook simple), instalada en el workspace de T1.
- OAuth 2.0, bot token. **Scopes:** `chat:write`, `channels:read`, `channels:history`, `groups:history`, `im:write`, `im:history`, `users:read`, `commands`, `reactions:write`, `files:read`.
- **Events API (webhooks):** `message.channels` (nuevas dudas en #dudas-coo), `app_mention`, `message.im` (redirigir DMs al canal).
- **Slash command / shortcut:** `/duda` abre el modal con el formato obligatorio desde cualquier canal.
- **Block Kit** para: modal de duda, resumen pre-ventana, publicación de resoluciones en hilo, Daily.
- Canales a crear en onboarding: `#dudas-coo`, `#daily-coo`.

### 5.2 Google Calendar (crítica)
- **Usa el mismo OAuth del login** (cuenta antar@t1.com) — no hay segunda conexión. Scopes agregados al consent: `calendar.events` (lectura/escritura) y `calendar.readonly` para calendarios secundarios.
- Lectura: eventos del día (polling cada 5 min o push notifications con `watch`).
- Escritura: creación de la plantilla como eventos recurrentes; bloques `protegido` y `comida` como *busy*, ventanas de dudas como eventos públicos con descripción del formato.
- Zona horaria: America/Mexico_City.

### 5.3 Anthropic API (IA)
- Modelo: `claude-sonnet-4-6` para triage, validación de formato, resúmenes de junta y Daily.
- Usos: (a) clasificar duda urgente/ventana, (b) validar formato completo, (c) resumen + acuerdos por transcripción, (d) composición del Daily, (e) resumen pre-ventana.
- Todas las salidas estructuradas se piden como JSON estricto y se validan server-side.

### 5.4 Transcripción de audio
- Opción A: OpenAI Whisper API. Opción B: Deepgram (mejor streaming/es-MX, diarización de hablantes recomendada para juntas).
- Pipeline: audio → storage → job de transcripción → texto → post-procesado IA → acuerdos.

### 5.5 Notificaciones
- Push web (PWA) + DM de Slack como canal de respaldo (el COO vive en Slack).

---

## 6. Arquitectura

```
[PWA React/Next.js] ── HTTPS ── [Backend Node (Next API / NestJS)]
     (Railway)                        (Railway)
                                          │
        ┌──────────────┬─────────────────┼────────────────┬──────────────┐
   [Supabase]     [Supabase Storage]  [Slack API]   [Google Calendar]  [Anthropic API]
   Postgres+Auth   (audios,           (events +      (mismo OAuth       (triage/daily/
   +RLS            transcripciones)    bot)           del login)         resúmenes)
                                          │
                                   [Worker (Railway)]
                              (transcripción, resúmenes,
                               recordatorios programados)
```

**Servicios en Railway (3):**
1. **web** — Next.js: PWA + API routes (webhooks de Slack, endpoints de la app).
2. **worker** — proceso Node para jobs pesados: transcripción, resúmenes IA, sync de Calendar. Cola con pg-boss (usa el mismo Postgres de Supabase, sin Redis extra).
3. **cron** — Railway cron jobs (o pg-boss schedules): recordatorio pre-ventana (15:00 y 18:45), prompt de Daily (20:45), sync de Calendar cada 5 min.

**Supabase provee:** Postgres (con RLS), Auth (Google OAuth), Storage (audios y transcripciones con signed URLs), Realtime (para que el dashboard se actualice al llegar una duda sin refrescar).

**Variables de entorno clave (Railway):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAILS=antar@t1.com`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY` (fase 3), `TZ=America/Mexico_City`.

**Nota webhooks Slack:** deben responder en <3 s → el endpoint solo valida firma, encola en pg-boss y responde 200; el worker procesa.

---

## 7. Modelo de datos (mínimo)

```sql
users(id, nombre, slack_user_id, rol)            -- coo | equipo | ceo
day_blocks(id, user_id, dia_semana, hora_ini, hora_fin, label, tipo, gcal_event_id)
dudas(id, slack_ts, slack_channel, autor_id, contexto, decision, opciones,
      recomendacion, impacto, urgente bool, estado, -- pendiente|resuelta|redirigida
      resolucion, resuelto_por, redirigida_a, created_at, resolved_at)
prioridades(id, user_id, tier, texto, done bool, done_at)
bitacora(id, user_id, fecha, hora, tipo, texto, ref_duda_id, ref_grabacion_id)
grabaciones(id, user_id, label, block_ref, fecha, duracion_seg, audio_url,
            transcript_url, resumen, acuerdos jsonb, estado)
dailies(id, user_id, fecha, contenido, enviado_slack bool, slack_ts)
integraciones(id, user_id, proveedor, access_token, refresh_token, scopes, expira)
```

---

## 8. Seguridad y cumplimiento

- **Acceso a la plataforma: solo antar@t1.com vía Google OAuth** (ver sección 4). Cualquier otro correo — incluso @t1.com — es rechazado server-side.
- RLS de Supabase en todas las tablas; el frontend nunca usa la service role key.
- Tokens OAuth de Google cifrados en reposo; nunca en el cliente.
- Verificación de firma de Slack (`X-Slack-Signature`) en todos los webhooks.
- Audios y transcripciones: buckets privados de Supabase Storage, acceso solo vía signed URLs de corta duración; retención configurable (default 90 días).
- Aviso de grabación a participantes (mensaje automático del bot al iniciar junta grabada, opcional).
- Logs de auditoría sobre resoluciones de dudas (quién decidió qué y cuándo).

---

## 9. Roadmap de construcción

### Fase 1 — MVP (2–3 semanas) ✅ valor inmediato
1. Dashboard web: bloques del día + "ahora" + prioridades persistentes + bitácora manual.
2. Slack app básica: `/duda` con modal de formato → guarda en BD → lista en dashboard → resolver publica en hilo.
3. Lectura de Google Calendar (solo lectura).
4. Daily generado con IA a partir de bitácora + dudas, envío manual a `#daily-coo`.

### Fase 2 — Automatización (2 semanas)
5. Triage IA de urgencia + validación de formato en el hilo.
6. Resumen pre-ventana por DM (15 min antes).
7. Escritura en Calendar (plantilla → eventos recurrentes busy).
8. Redirigir duda a owner con notificación.

### Fase 3 — Grabación (2–3 semanas)
9. Grabación por junta desde la PWA (MediaRecorder) con subida a storage.
10. Transcripción automática + resumen y acuerdos por IA.
11. Acuerdos → sugerencias de bitácora/prioridades.

### Fase 4 — Refinamiento
12. Métricas: dudas por semana, tiempo a resolución, % resueltas en ventana vs interrupciones, cumplimiento de bloques protegidos.
13. Vista semanal y revisión de viernes (qué juntas matar, qué quedó al 90%).
14. Multi-usuario (otros directivos de T1 con su propio centro de comando).

---

## 10. Criterios de aceptación del MVP

- [ ] Solo antar@t1.com puede iniciar sesión (con Google); cualquier otra cuenta ve "acceso restringido".
- [ ] Deploy funcionando en Railway con Supabase conectado (web + worker + cron).
- [ ] El equipo puede enviar una duda con `/duda` desde Slack en <60 segundos.
- [ ] Una duda sin los 5 campos no llega a la cola del COO.
- [ ] El COO ve todas las dudas pendientes agrupadas (urgentes primero) al abrir la app.
- [ ] Resolver una duda desde la app publica la decisión en el hilo de Slack en <5 s.
- [ ] Toda resolución queda en la bitácora con timestamp sin acción extra.
- [ ] El Daily se genera en <15 s, es editable, y llega a `#daily-coo` con un clic.
- [ ] Los eventos de Google Calendar del día aparecen junto a los bloques.
- [ ] Nadie puede agendar sobre el bloque de definición (aparece como ocupado).

---

## 11. Riesgos y decisiones abiertas

| Riesgo / decisión | Recomendación |
|---|---|
| Adopción del equipo (que sigan interrumpiendo) | El COO redirige TODO al canal las primeras 2 semanas, sin excepciones; el bot facilita con `/duda` |
| Grabación en navegador móvil (permisos/backgrounding) | Probar PWA en iOS temprano; plan B: subir audios grabados con el teléfono |
| Costo transcripción | ~$0.006/min (Whisper); estimar 3 h/día ≈ $1.1/día — despreciable |
| Privacidad de juntas grabadas | Política interna escrita + aviso del bot antes de construir Fase 3 |
| ¿Ventana 1 a las 15:15 o 16:00? | Confirmar con horario real de comida antes de crear eventos en Calendar |
