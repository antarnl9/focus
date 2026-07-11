# T1 Focus — Documento de continuidad (handoff)

> Guía para quien va a dar mantenimiento/continuidad a la app. Explica qué es, cómo está construida, cómo se despliega y qué está pendiente. Última actualización: 2026‑07‑10.
>
> **Novedades recientes (jul 2026):** copiloto/asistente por chat+voz con acciones reales (§8); transcripción de juntas **inline** en el servicio web (ya NO requiere worker, §10); el Daily ahora toma también el resumen de las juntas grabadas (§9); recurrencia de calendario respeta los días específicos del bloque; los cambios de calendario se reflejan al instante; `loading.tsx` al abrir.

---

## 1. Qué es Focus

**Centro de comando del COO de T1.** PWA móvil (se usa sobre todo desde el celular) que junta en un solo lugar el día del COO:

- **Agenda del día en bloques** + eventos reales de Google Calendar, mezclados.
- **Dudas del equipo** que entran por Slack (`/duda`) con contexto obligatorio, más "duda en persona" desde la app; con **triage por IA** (urgencia, completitud).
- **Grabación de juntas** (desde el home o el tab Juntas, con Wake Lock) → transcripción (Deepgram) → **resumen + acuerdos con IA** → bitácora. Los invitados del evento se guardan/casan como personas (incl. externos).
- **Copiloto** (asistente ✨, botón flotante): chat por **voz o texto** que ejecuta acciones reales — mover/crear/invitar/cancelar juntas, consultar agenda/dudas/personas, tomar notas — con **confirmación antes** de cualquier acción que mande correo.
- **Prioridades** del día y **bitácora** (log de lo que pasó).
- **Daily** de cierre generado con IA en **dos versiones**: **CEO Brief** (formato estricto para el CEO) y **daily personal** (para el COO), ambos con historial. Toma bitácora, dudas, prioridades, acuerdos y **el resumen de las juntas grabadas** del día.
- **Métricas** por rango de fechas + **coach de alineación** (¿lo que hiciste va con tus prioridades?).
- **Contexto de Slack**: resumen de DMs/canales + "lo importante a atacar", que alimenta a la IA.
- **Directorio de personas** (49 de T1 precargadas) que conecta juntas/dudas con gente.
- **Perfil del COO** y **contexto de negocio de T1** (T1 Global + productos) que alimentan a la IA.

Público: **un solo usuario** (el COO). Hay allowlist de correos.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 15** (App Router, React 19, TypeScript) — front + API routes |
| UI | Tailwind CSS, mobile‑first, PWA (service worker, offline, install prompt), tema claro/oscuro |
| Base de datos / auth / storage / realtime | **Supabase** (Postgres + RLS, Auth Google OAuth, Storage, Realtime), `@supabase/ssr` |
| IA | **Anthropic** SDK (`@anthropic-ai/sdk`), modelo `claude-opus-4-8` |
| Calendario | **Google Calendar API** (`googleapis`) lectura/escritura + push (watch) |
| Chat | **Slack** Web API (`@slack/web-api`) — comandos, eventos, OAuth |
| Transcripción | **Deepgram** (`@deepgram/sdk`), es‑MX — corre **inline** en el web service con `after()` |
| Jobs | `node-cron`/`pg-boss` en un **worker opcional** (solo para recordatorios/Daily programados; la transcripción ya NO lo usa) |
| Push | **web-push** (VAPID) |
| Hosting | **Railway** (auto‑deploy desde GitHub) |

Repo: `github.com/antarnl9/focus` (rama `main`, auto‑deploy).

---

## 3. Arquitectura

Dos procesos + Supabase + servicios externos:

```
                 ┌──────────────────────── SUPABASE ────────────────────────┐
                 │  Postgres (RLS) · Auth (Google) · Storage · Realtime       │
                 └───────▲───────────────▲──────────────────▲────────────────┘
                         │               │ realtime          │ pg-boss (schema pgboss)
        lee/escribe      │               │ (dudas, eventos)  │
   ┌─────────────────────┴───┐     ┌─────┴───────────┐   ┌───┴──────────────────┐
   │  WEB SERVICE (Next.js)  │     │   Navegador     │   │  WORKER (tsx) OPCIONAL│
   │  páginas + /api/*        │◀───▶│  PWA (celular)  │   │  node-cron            │
   │  transcribe + copiloto   │     └─────────────────┘   │  (recordatorios/Daily)│
   └───┬────┬─────┬─────┬─────┘                           └──────────────────────┘
       │    │     │     │
  Anthropic Google Slack Deepgram        (+ web-push)
```

- **Web service** (`npm start` → `next start`): sirve la PWA y todas las `/api/*`. **La transcripción de juntas y el copiloto corren aquí** (transcripción vía `after()` tras subir el audio). Es el único proceso imprescindible.
- **Worker** (`npm run worker` → `tsx worker/index.ts`): **opcional**. Corre los **cron** de recordatorios/Daily (node-cron) y una cola pg-boss (ya sin uso para transcripción). Si no está desplegado, la app funciona; solo no se disparan los recordatorios programados (ver §10).
- **Supabase Realtime**: el navegador se suscribe a cambios de `dudas` y `eventos` para actualizarse en vivo.

---

## 4. Estructura del repo

```
src/
  app/
    page.tsx                 # HOME (tab "Hoy"): agenda + prioridades; lee eventos del espejo
    loading.tsx              # esqueleto que se muestra al abrir (evita pantalla en blanco)
    login/ acceso-restringido/ offline/
    agenda/ calendario/      # editar plantilla del día / vista mensual
    metricas/ negocios/ contexto/ perfil/ personas/ personas/[id]/ personas/import/
    ajustes/                 # hub de configuración (perfil, negocios, personas, sync, limpiar cal, notifs)
    components/              # ~30 componentes cliente (ver abajo)
    api/                     # route handlers (ver §8)
  lib/                       # lógica de servidor y helpers (ver abajo)
    supabase/                # server.ts, client.ts, admin.ts, middleware.ts
worker/                      # index.ts (pg-boss + cron), loadenv.ts
supabase/                    # schema.sql + migration-*.sql + all-migrations.sql + data-*.sql
public/                      # PWA: manifest, sw.js, íconos
```

**Componentes clave** (`src/app/components/`):
- `Dashboard.tsx` — orquesta el home, tabs, estado de dudas/eventos, Realtime, sync del calendario, envuelve todo en `RecordingProvider`.
- `DayTimeline.tsx` — "Agenda de hoy": mezcla bloques + eventos; botón **● Grabar** en lo que está "ahora".
- `RecordingProvider.tsx` — grabación global (barra flotante + Wake Lock + auto‑ligado a junta/personas).
- `Recorder.tsx` — tab Juntas: por default la junta que está pasando **ahora** (evento real con invitados) + selector de juntas de hoy + botón "Transcribir y resumir" por grabación.
- `AssistantFab.tsx` — **copiloto**: botón flotante ✨ + chat (voz con dictado en vivo + texto) + tarjetas de confirmación de acciones.
- `DailyPanel.tsx` (CEO Brief) · `DailyPersonal.tsx` (daily personal en Métricas).
- `MetricsView.tsx` · `SlackContextView.tsx` · `NegociosView.tsx` · `PerfilCoo.tsx` · `PersonasDirectory.tsx` · `PersonaProfile.tsx`.
- `BlockSheet.tsx` / `EventSheet.tsx` — editar bloque (actualiza el evento recurrente en Google) / invitar‑mover‑cancelar evento.
- `persona-util.ts` — helpers de personas (incl. `ensurePersonasFromAttendees`, crea/casa invitados como personas).
- `BottomNav.tsx` · `HeaderNow.tsx` · `ThemeToggle.tsx` · `InstallPrompt.tsx` · `RegisterSW.tsx` · `VoiceButton.tsx`.

**Lib** (`src/lib/`):
- `google.ts` — cliente OAuth de Calendar; listar/crear/editar/cancelar eventos; plantilla (recurrencia por `dias` del bloque); `updateBlockEvent`; cleanup.
- `calendar.ts` — **espejo `eventos`**: `syncCalendar` (incremental), `getTodayEventsFromDb`, `ensureCalendarWatch` (push), helpers.
- `assistant.ts` — **copiloto**: definición de herramientas (tool use), `runAssistant` (loop) y `executeAction` (ejecuta las acciones confirmadas).
- `slack.ts` / `slackcontext.ts` — API de Slack / sync y resumen del contexto.
- `anthropic.ts` — todas las llamadas a la IA (ver §9).
- `coo.ts` — arma el contexto para la IA (perfil COO + negocios + Slack).
- `daily.ts` — reúne insumos (incl. resumen de juntas) y guarda los dos dailies. `reminders.ts` — tareas de cron. `metrics.ts` — métricas + coach.
- `transcription.ts` — pipeline de junta (`processTranscription`, se invoca inline con `after()`). `deepgram.ts` — transcribe. `queue.ts` — pg-boss (solo si se usa el worker).
- `auth.ts` (`requireUser`), `bootstrap.ts` (idempotente al entrar), `crypto.ts` (AES‑256‑GCM), `env.ts`, `time.ts`, `push.ts`, `defaults.ts`, `types.ts`.

---

## 5. Modelo de datos (Postgres/Supabase)

Todas las tablas tienen **RLS**: cada fila es de un `user_id` y solo su dueño la lee/escribe (`auth.uid() = user_id`). El backend usa la **service role** (bypassa RLS) para escribir lo que llega de Slack/Google/worker.

| Tabla | Para qué | Columnas clave | Migración |
|---|---|---|---|
| `users` | perfil del COO | `nombre, titulo, objetivo, bio` (+ ids de integración) | schema, `03` |
| `day_blocks` | plantilla del día | `hora_ini, hora_fin, label, tipo, orden, dias int[], gcal_event_id` | schema, `06/07/08` |
| `dudas` | dudas del equipo | contexto/decision/opciones/recomendacion/impacto, `urgente, estado`, autor, slack_ts | schema |
| `prioridades` | prioridades del día | `tier(0/1/2), texto, done, orden` | schema |
| `bitacora` | log del día | `fecha, hora, tipo, texto, ref_duda_id, ref_grabacion_id` | schema |
| `grabaciones` | juntas grabadas | `label, block_ref, persona, audio_path, transcript, resumen, acuerdos jsonb, estado, duracion_seg` | schema, `01` |
| `personas` | directorio | `nombre, puesto, correo, slack_user_id, descripcion, tipo, rango` | `02/03/05` |
| `grabacion_personas` | junta ↔ personas (N:N) | `grabacion_id, persona_id, user_id` | `02` |
| `negocios` | unidades T1 (contexto IA) | `nombre, contexto, objetivo_anual, orden` | `04` |
| `dailies` | dailies guardados | `fecha, contenido, enviado_slack, slack_ts, tipo('ceo'/'personal')` — único `(user_id,fecha,tipo)` | schema, `11` |
| `slack_context` | resumen de Slack (IA) | `resumen, recomendaciones, mensajes, actualizado` (NO guarda mensajes crudos) | `09/10` |
| `eventos` | **espejo de Google Calendar** | `gcal_id, summary, inicio, fin, all_day, html_link, status, attendees jsonb, es_focus` — PK `(user_id,gcal_id)` | `12` |
| `integraciones` | tokens OAuth (cifrados) | `proveedor, access_token, refresh_token, expira, scopes` + `cal_sync_token, cal_channel_id, cal_resource_id, cal_channel_expira` | schema, `12` |
| `push_subscriptions` | Web Push (PWA) | `endpoint, keys jsonb` | schema |

**Storage:** bucket privado `grabaciones`; audios en `{{user_id}}/{{grabacion_id}}.{{ext}}`. Políticas por carpeta = `user_id`.

### Orden de migraciones
`schema.sql` (base) → `01`…`12`. Hay un **`all-migrations.sql`** idempotente y **seguro de re‑correr** (no pisa el calendario si ya tiene bloques) que aplica de la 01 a la 12 de un jalón. Aparte hay **datos**: `data-negocios-contexto.sql` (contexto de negocio T1). Se corren manualmente en **Supabase → SQL Editor**.

> Nota: `migration-04-05-combo.sql` = 04+05 juntas (redundante con los archivos individuales; usa uno u otro, no ambos).

---

## 6. Variables de entorno

En **Railway → Variables**. Regla importante: **sin comillas** en los valores.

| Variable | Req. | Qué es |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon/publishable key (nombre EXACTO, ver §11 bugs) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service role (backend, bypassa RLS) |
| `DATABASE_URL` | –(worker) | conexión Postgres para pg-boss (solo si corres el worker). SSL requerido |
| `NEXT_PUBLIC_APP_URL` | ✅ | dominio público con `https://`, **sin** slash ni espacios finales |
| `ALLOWED_EMAILS` | ✅ | correos permitidos (coma‑sep). Default `antar@t1.com` |
| `GOOGLE_HOSTED_DOMAIN` | – | dominio permitido en el login (default `t1.com`) |
| `ANTHROPIC_API_KEY` | ✅ | IA. Sin ella no hay dailies/coach/triage |
| `ANTHROPIC_MODEL` | – | default `claude-opus-4-8` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅(cal) | OAuth de Google (login + Calendar) |
| `GOOGLE_CALENDAR_ID` | – | default `primary` |
| `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` | ✅(slack) | bot + verificación de firma |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | –(slack) | OAuth para leer conversaciones (contexto) |
| `SLACK_DUDAS_CHANNEL_ID` / `SLACK_DAILY_CHANNEL_ID` | – | canales de dudas / del CEO Brief |
| `DEEPGRAM_API_KEY` | – | transcripción de juntas (en el **web service**). Sin ella, la grabación se guarda pero no se transcribe |
| `TOKEN_ENCRYPTION_KEY` | ✅ | clave AES‑256‑GCM para cifrar tokens en `integraciones` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | – | Web Push (PWA) |
| `CRON_SECRET` | – | protege `/api/cron` (y token del webhook de calendar) |
| `TZ` | – | zona horaria; default `America/Mexico_City` |

---

## 7. Autenticación y seguridad

- **Login:** Google OAuth vía Supabase Auth. Solo pasan los correos de `ALLOWED_EMAILS` (y dominio `GOOGLE_HOSTED_DOMAIN`); si no, `→ /acceso-restringido`. El middleware (`src/lib/supabase/middleware.ts`) refresca sesión y protege rutas.
- **RLS** en todas las tablas (dueño por `user_id`). Escrituras de sistema (Slack, Google, worker) usan la **service role**.
- **Tokens cifrados en reposo:** los OAuth de Google/Slack se guardan cifrados con **AES‑256‑GCM** (`crypto.ts`, clave `TOKEN_ENCRYPTION_KEY`).
- **Slack:** verificación de **firma** (`SLACK_SIGNING_SECRET`) en cada webhook; respuestas <3s usando `after()`. El contexto de Slack guarda **solo resúmenes**, nunca los mensajes crudos.
- **Webhook de Calendar:** valida `X-Goog-Channel-Token` contra `CRON_SECRET` y el `channel-id` guardado.
- **Cron endpoint:** `/api/cron` exige `CRON_SECRET`.

---

## 8. Funcionalidades y dónde viven (API routes)

| Ruta API | Qué hace |
|---|---|
| `POST /api/calendar/sync` | dispara `syncCalendar` (lo llama el home al abrir/enfocar/cada 60s) |
| `POST /api/calendar/notifications` | **webhook** push de Google → corre el sync |
| `GET /api/calendar/range` | eventos de un rango (vista mensual `/calendario`) — llama a Google en vivo |
| `POST /api/calendar/create` / `event` / `template` / `cleanup` / `block` | crear evento / invitar‑mover‑cancelar / escribir plantilla / borrar `[Focus]` / actualizar el evento recurrente de un bloque. `create` y `event` **re‑sincronizan el espejo** para reflejar el cambio al instante |
| `POST /api/recordings/finalize` | marca grabación subida y **transcribe inline** con `after()` (si hay Deepgram) |
| `POST /api/recordings/transcribe` | re‑transcribe una grabación existente (botón "Transcribir y resumir") |
| `POST /api/assistant` | **copiloto**: corre el loop de tool‑use → `{ reply, pendingActions }` |
| `POST /api/assistant/execute` | ejecuta una acción del copiloto ya confirmada por el usuario |
| `GET/POST /api/daily` · `/generate` · `/send` | daily guardado + historial / generar ambos / enviar CEO Brief a Slack |
| `GET /api/metrics` · `/coach` | métricas por rango + coach de alineación |
| `POST /api/slack/commands` · `/events` · `/interactions` | `/duda`, eventos, botones de Slack |
| `GET /api/slack/oauth/start` · `/callback` | OAuth de usuario para leer conversaciones |
| `POST /api/slack/context/sync` · `GET /api/slack/context` | sincroniza/lee el resumen de Slack |
| `POST /api/personas/import` | importa personas desde Calendar/Slack |
| `POST /api/push/subscribe` | guarda suscripción Web Push |
| `GET/POST /api/cron?task=…&secret=…` | tareas programadas externas: `ventana1｜ventana2｜daily｜calendar` |
| `POST /api/dudas/[id]/resolve` · `/redirect` | resolver / redirigir una duda |

### Sync de Google Calendar (el subsistema más nuevo — detalle)
1. **Espejo local `eventos`**: el home NO llama a Google al render; lee de la tabla (`getTodayEventsFromDb`). Instantáneo y aguanta mala señal.
2. **`syncCalendar` (incremental)**: usa `cal_sync_token` (Google solo manda lo que cambió). Upsert de eventos; borra cancelados y los `[Focus]`. Si el token caduca (410) hace full‑sync de una ventana (‑7d…+60d). Guarda el nuevo `nextSyncToken`.
3. **Disparo**: `Dashboard.tsx` hace `POST /api/calendar/sync` al montar, al volver la app (`visibilitychange`) y cada **5 min**, con debounce (no re‑sincroniza si pasó <2 min); luego relee de `eventos`. Además, los endpoints que **escriben** en el calendario (`create`, `event`, y el copiloto) sincronizan el espejo enseguida → el cambio se ve al instante.
4. **Realtime**: suscrito a `eventos` (con debounce) → la UI se actualiza sola cuando el espejo cambia.
5. **Push (watch)**: `ensureCalendarWatch` registra un canal que apunta a `/api/calendar/notifications`. El canal caduca ~7 días → lo renueva el cron `?task=calendar`. **Requiere dominio verificado en Google Cloud** (ver §11). Mientras no lo haya, el poll/focus cubre (near‑realtime).
6. **Recurrencia por días**: al escribir la plantilla o editar un bloque, la regla `RRULE` se arma según los `dias` del bloque (día específico = solo ese día; vacío = lun‑vie). Editar un bloque ya sincronizado actualiza su evento vía `updateBlockEvent`.

### Grabación de juntas (pipeline)
`RecordingProvider`/`Recorder` → `getUserMedia` + `MediaRecorder` → sube blob a Storage `grabaciones` → `POST /api/recordings/finalize` → si hay Deepgram, corre **inline con `after()`** `processTranscription`: descarga audio → Deepgram (es‑MX) → `summarizeMeeting` (IA: resumen + acuerdos) → actualiza `grabaciones` y escribe en `bitacora`. Estados: `grabando → subida → transcribiendo → procesando → lista` (o `lista` directa sin Deepgram). Botón **"Transcribir y resumir"** en cada grabación para reprocesar (`/api/recordings/transcribe`). **Ya NO requiere el worker.**
**Grabar desde el home:** botón "● Grabar" en el ítem "ahora"; `RecordingProvider` mantiene **Wake Lock** (pantalla encendida), barra flotante entre tabs y auto‑liga la junta con las personas (crea/casa invitados con `ensurePersonasFromAttendees`, incl. externos).

### Copiloto (asistente con tool use)
`AssistantFab` (botón flotante ✨) → chat por voz (dictado en vivo al campo) o texto → `POST /api/assistant` con el historial. En el server, `runAssistant` corre un loop de **tool use** de Claude:
- **Lectura/directas** (se ejecutan en el loop): `agenda_hoy`, `agenda_rango`, `buscar_persona`, `listar_dudas`, `tomar_nota`, `crear_persona`.
- **Que mandan correo** (`mover_junta`, `crear_junta`, `invitar_a_junta`, `cancelar_junta`): NO se ejecutan; regresan como **propuesta** (`pendingActions`). El usuario confirma con un tap → `POST /api/assistant/execute` → `executeAction` llama a `google.ts` y re‑sincroniza el espejo.
Todo reusa `google.ts` + Supabase; no hay infra nueva.

---

## 9. IA (Anthropic) — `src/lib/anthropic.ts`

Modelo `claude-opus-4-8`, salidas JSON estructuradas. Funciones:

| Función | Uso |
|---|---|
| `triageDuda` | clasifica una duda entrante (urgencia, completitud, motivo) |
| `summarizeMeeting` | de un transcript → `resumen` + `acuerdos[]` |
| `composeCeoDaily` | **CEO Brief** con formato estricto (HOY/MAÑANA/AYUDA/KILL/MÉTRICA, outcomes, máx 12‑14 líneas) |
| `composeDaily` | daily personal (✅ Resuelto / 🔄 En curso / 🎯 Mañana / ⚠️ Riesgos) |
| `alignmentCoach` | ¿lo hecho va con tus prioridades? recomendaciones |
| `summarizeSlack` | de DMs/canales → `resumen` + `recomendaciones` |
| `preWindowSummary` | resumen 15 min antes de una ventana de dudas |
| `fridayReview` | (existe, no cableado en UI) |

`composeDaily` y `composeCeoDaily` reciben, además, el **resumen de las juntas grabadas** del día (`DailyInput.juntas`, armado en `daily.ts`).

El **copiloto** (`src/lib/assistant.ts`) usa **tool use** de Claude (no JSON estructurado): `runAssistant` corre el loop con herramientas de calendario/dudas/personas (ver §8).

El **contexto** que reciben (perfil del COO + negocios T1 + resumen de Slack) lo arma `coo.ts → fullCooContext`.

---

## 10. Cron, worker y jobs

> La **transcripción ya NO usa el worker** — corre inline en el web service (§8). El worker quedó **solo para los recordatorios/Daily programados**, y es **opcional**.

Dos formas de disparar los recordatorios (pre‑ventana de dudas y Daily):

- **A) Worker:** `worker/index.ts` corre `node-cron` (hora CDMX, lun‑vie): **15:00** y **18:45** pre‑ventana, **20:45** genera el Daily. Servicio Railway aparte con start `npm run worker`.
- **B) Endpoint `/api/cron` + cron externo (recomendado si NO hay worker):** un servicio como cron-job.org pega a `…/api/cron?task=…&secret=CRON_SECRET`. Tareas: `ventana1`, `ventana2`, `daily`, `calendar` (renueva watch + sync de respaldo).

> El `?task=calendar` **no** está en el cron del worker; solo en el endpoint.

---

## 11. Estado actual y pendientes conocidos

- ✅ **Funciona hoy:** login, agenda, dudas, prioridades, bitácora, personas, perfil/negocios, dailies (CEO+personal, con resumen de juntas), métricas+coach, contexto de Slack, sync de calendario (espejo+poll+realtime, cambios al instante), grabar desde el home con Wake Lock, **copiloto** con acciones confirmadas.
- ⚠️ **Migraciones pendientes de correr** en Supabase: hasta la **12** (espejo `eventos`) + `data-negocios-contexto.sql`. Sin la 12 el home no ve eventos.
- ⚠️ **Transcripción**: requiere `DEEPGRAM_API_KEY` en el web service. **Ya NO requiere worker** (corre inline con `after()`). Sin la key, el audio se guarda pero sin transcript; hay botón "Transcribir y resumir" para reprocesar.
- ⚠️ **Webhook push de Calendar no activable** hasta tener **dominio propio** verificado en Google Cloud (el `*.up.railway.app` no se puede verificar). El poll/focus cubre mientras tanto. Código ya listo.
- ⚠️ **Recordatorios/Daily programados**: no se disparan solos salvo que corras el worker o configures un cron externo (cron-job.org: `daily` 20:45, `ventana1` 15:00, `ventana2` 18:45 CDMX→UTC, `calendar` c/12h). La generación manual del Daily sí funciona desde la app.
- ℹ️ **Cancelar evento**: Google solo deja cancelar/borrar juntas que **tú organizaste**; para invitadas por otros regresa error (limitación de Google).
- ℹ️ `Recorder.tsx` (tab Juntas) y `RecordingProvider` (home) comparten grabación vía el provider; el tab Juntas delega start/stop en él.

**Bugs históricos ya resueltos** (para contexto): anon key mal nombrada (`PUBLISHABLE` vs `ANON`), `NEXT_PUBLIC_APP_URL` sin `https://` o con espacio, Site/Redirect URLs de Supabase apuntando a localhost, `redirect_uri` de Slack con espacio, sync de Slack cortando DMs (se cambió a `users.conversations`), delimitador `$$` chocando en el SQL de negocios (se usó `$body$`).

---

## 12. Deploy y correr local

### Railway (producción)
1. **Servicio web** (auto‑deploy de `main`): build `next build`, start `next start`. Todas las variables de §6, incluida `DEEPGRAM_API_KEY` (la transcripción corre aquí).
2. **Servicio worker** (opcional, solo para recordatorios/Daily programados): mismo repo, start `npm run worker`. Necesita `DATABASE_URL`, `ANTHROPIC_API_KEY`, Slack, push. Alternativa sin worker: cron externo a `/api/cron` (§10).
3. **Supabase**: correr `schema.sql` + `all-migrations.sql` (o migraciones 01‑12) + `data-negocios-contexto.sql`. Configurar **Auth → Google**, **Site URL** y **Redirect URLs** (`…/auth/callback`) al dominio de Railway. Prender **Realtime** para `dudas` y `eventos`.
4. **Google Cloud**: OAuth consent + credenciales; scopes de Calendar; (a futuro) verificar dominio propio para el webhook.
5. **Slack app**: comandos/eventos/interactivity apuntando a `…/api/slack/*`, scopes, signing secret; OAuth de usuario para el contexto.

### Local
```bash
npm install
cp .env.example .env.local   # llenar variables de §6 (si existe el ejemplo; si no, créalo)
npm run dev                  # web en http://localhost:3000
npm run worker:dev           # worker (transcripción + cron), opcional
npm run typecheck            # tsc --noEmit
npm run build                # verificar build de producción
```
> Los webhooks de Slack/Google no llegan a `localhost`; se prueban ya desplegado (o con un túnel tipo ngrok + registrar esa URL).

---

## 13. Convenciones

- **Una migración por feature** en `supabase/` (numeradas), idempotentes (`if not exists` / `add column if not exists`). El usuario las corre a mano en el SQL Editor.
- **RLS por tabla** siempre; el backend usa service role solo cuando debe.
- Español en UI, comentarios y nombres de dominio (dudas, bitácora, negocios…).
- Mobile‑first; componentes cliente con `'use client'`; server components para el fetch inicial.
- Textos hacia el CEO/COO: sin hype, outcomes no actividades (ver formato del CEO Brief).

---

## 14. "Quiero tocar X, ¿dónde?"

| Quiero… | Archivo(s) |
|---|---|
| Cambiar la agenda/plantilla del día | `day_blocks` (migraciones 06/08), `/agenda`, `BlockEditor`/`BlockSheet`; recurrencia en `google.ts → rruleFor/updateBlockEvent` |
| Ajustar el sync de calendario | `src/lib/calendar.ts`, `Dashboard.tsx` (efectos de sync/realtime) |
| Cambiar el formato del CEO Brief / insumos del Daily | `anthropic.ts → composeCeoDaily/composeDaily`, `daily.ts → gatherDailyData` |
| Cambiar cómo se arma el contexto de IA | `src/lib/coo.ts` |
| Tocar el **copiloto** (herramientas, acciones, prompt) | `src/lib/assistant.ts`, `AssistantFab.tsx`, `/api/assistant(/execute)` |
| Tocar la grabación desde el home | `RecordingProvider.tsx`, `DayTimeline.tsx`, `Recorder.tsx` |
| Pipeline de transcripción (inline) | `transcription.ts`, `deepgram.ts`, `/api/recordings/finalize` y `/transcribe` |
| Horarios de recordatorios | `worker/index.ts` (node-cron) y/o `/api/cron` |
| Pantalla de carga | `src/app/loading.tsx` |
| Personas / import | `personas` (02/03/05), `PersonasDirectory`, `persona-util.ts`, `/api/personas/import` |
| Contexto de negocio T1 | `negocios` (04) + `data-negocios-contexto.sql`, `NegociosView` |

---

*Cualquier duda de arquitectura, el `README.md` y los comentarios en `src/lib/*` tienen contexto adicional. Los `.sql` en `supabase/` están comentados y son la fuente de verdad del modelo de datos.*
