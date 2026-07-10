# T1 Focus — Documento de continuidad (handoff)

> Guía para quien va a dar mantenimiento/continuidad a la app. Explica qué es, cómo está construida, cómo se despliega y qué está pendiente. Última actualización: 2026‑07‑09.

---

## 1. Qué es Focus

**Centro de comando del COO de T1.** PWA móvil (se usa sobre todo desde el celular) que junta en un solo lugar el día del COO:

- **Agenda del día en bloques** + eventos reales de Google Calendar, mezclados.
- **Dudas del equipo** que entran por Slack (`/duda`) con contexto obligatorio, más "duda en persona" desde la app; con **triage por IA** (urgencia, completitud).
- **Grabación de juntas** (desde el home o el tab Juntas) → transcripción (Deepgram) → **resumen + acuerdos con IA** → bitácora.
- **Prioridades** del día y **bitácora** (log de lo que pasó).
- **Daily** de cierre generado con IA en **dos versiones**: **CEO Brief** (formato estricto para el CEO) y **daily personal** (para el COO), ambos con historial.
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
| Transcripción | **Deepgram** (`@deepgram/sdk`), es‑MX |
| Jobs | **pg-boss** (sobre el mismo Postgres, sin Redis) + **node-cron** (worker) |
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
   │  WEB SERVICE (Next.js)  │     │   Navegador     │   │  WORKER (tsx)        │
   │  páginas + /api/*        │◀───▶│  PWA (celular)  │   │  pg-boss + node-cron │
   │  encola jobs             │     └─────────────────┘   │  transcribe + cron   │
   └───┬─────────┬──────┬─────┘                           └──────────────────────┘
       │         │      │
   Anthropic   Google  Slack   (+ Deepgram desde el worker, + web-push)
```

- **Web service** (`npm start` → `next start`): sirve la PWA y todas las `/api/*`. Encola jobs en pg-boss.
- **Worker** (`npm run worker` → `tsx worker/index.ts`): procesa la cola de **transcripción** y corre los **cron** de recordatorios/Daily. **Es un servicio Railway aparte** (mismo repo, distinto start command). Si no está corriendo: no hay transcripción automática ni recordatorios (ver §11 y §12).
- **Supabase Realtime**: el navegador se suscribe a cambios de `dudas` y `eventos` para actualizarse en vivo.

---

## 4. Estructura del repo

```
src/
  app/
    page.tsx                 # HOME (tab "Hoy"): agenda + prioridades; lee eventos del espejo
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
- `Recorder.tsx` — tab Juntas (grabación clásica con selección manual) + tarjetas de grabaciones.
- `DailyPanel.tsx` (CEO Brief) · `DailyPersonal.tsx` (daily personal en Métricas).
- `MetricsView.tsx` · `SlackContextView.tsx` · `NegociosView.tsx` · `PerfilCoo.tsx` · `PersonasDirectory.tsx` · `PersonaProfile.tsx`.
- `BlockSheet.tsx` / `EventSheet.tsx` — editar bloque / invitar‑mover‑cancelar evento.
- `BottomNav.tsx` · `HeaderNow.tsx` · `ThemeToggle.tsx` · `InstallPrompt.tsx` · `RegisterSW.tsx`.

**Lib** (`src/lib/`):
- `google.ts` — cliente OAuth de Calendar, listar/crear/editar/cancelar eventos, plantilla, cleanup.
- `calendar.ts` — **espejo `eventos`**: `syncCalendar` (incremental), `getTodayEventsFromDb`, `ensureCalendarWatch` (push), helpers.
- `slack.ts` / `slackcontext.ts` — API de Slack / sync y resumen del contexto.
- `anthropic.ts` — todas las llamadas a la IA (ver §9).
- `coo.ts` — arma el contexto para la IA (perfil COO + negocios + Slack).
- `daily.ts` — genera y guarda los dos dailies. `reminders.ts` — tareas de cron. `metrics.ts` — métricas + coach.
- `transcription.ts` — pipeline de junta (worker). `deepgram.ts` — transcribe. `queue.ts` — pg-boss.
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
| `DATABASE_URL` | ✅ | conexión Postgres (para pg-boss). SSL requerido |
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
| `DEEPGRAM_API_KEY` | – | transcripción. Sin ella, la grabación se guarda pero no se transcribe |
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
| `POST /api/calendar/create` / `event` / `template` / `cleanup` | crear evento / invitar‑mover‑cancelar / escribir plantilla / borrar eventos `[Focus]` |
| `POST /api/recordings/finalize` | marca grabación subida y **encola transcripción** (si hay Deepgram) |
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
3. **Disparo**: `Dashboard.tsx` hace `POST /api/calendar/sync` al montar, al volver la app (`visibilitychange`) y cada 60s; luego relee de `eventos`.
4. **Realtime**: suscrito a `eventos` → la UI se actualiza sola cuando el espejo cambia.
5. **Push (watch)**: `ensureCalendarWatch` registra un canal que apunta a `/api/calendar/notifications`. El canal caduca ~7 días → lo renueva el cron `?task=calendar`. **Requiere dominio verificado en Google Cloud** (ver §11). Mientras no lo haya, el poll/focus cubre (near‑realtime).

### Grabación de juntas (pipeline)
`RecordingProvider`/`Recorder` → `getUserMedia` + `MediaRecorder` → sube blob a Storage `grabaciones` → `POST /api/recordings/finalize` → si hay Deepgram, encola en pg-boss (`transcribe`) → **worker** `processTranscription`: descarga audio → Deepgram (es‑MX) → `summarizeMeeting` (IA: resumen + acuerdos) → actualiza `grabaciones` y escribe en `bitacora`. Estados: `grabando → subida → transcribiendo → procesando → lista` (o `lista` directa sin Deepgram).
**Grabar desde el home:** botón "● Grabar" en el ítem "ahora"; `RecordingProvider` mantiene **Wake Lock** (pantalla encendida), barra flotante entre tabs y auto‑liga la junta con las personas (casa correos de invitados con `personas`).

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

El **contexto** que reciben (perfil del COO + negocios T1 + resumen de Slack) lo arma `coo.ts → fullCooContext`.

---

## 10. Cron, worker y jobs

Dos formas de correr las tareas programadas (recordatorios y Daily):

- **A) Worker (recomendado si está desplegado):** `worker/index.ts` corre `node-cron` (hora CDMX, lun‑vie): **15:00** y **18:45** pre‑ventana de dudas, **20:45** genera el Daily. También procesa la cola de **transcripción** (pg-boss). Necesita ser un **servicio Railway aparte** con start `npm run worker`.
- **B) Endpoint `/api/cron`:** alternativa sin worker, para un cron externo (cron-job.org) que pegue a `…/api/cron?task=…&secret=CRON_SECRET`. Tareas: `ventana1`, `ventana2`, `daily`, `calendar` (renueva watch + sync de respaldo).

> El `?task=calendar` **no** está en el cron del worker; solo en el endpoint. La transcripción **solo** corre en el worker.

---

## 11. Estado actual y pendientes conocidos

- ✅ **Funciona hoy:** login, agenda, dudas, prioridades, bitácora, personas, perfil/negocios, dailies (CEO+personal), métricas+coach, contexto de Slack, sync de calendario (espejo+poll+realtime), grabar desde el home con Wake Lock.
- ⚠️ **Migración 12 pendiente de correr** en Supabase para que el espejo `eventos` exista (si no, el home no verá eventos). Igual conviene correr `data-negocios-contexto.sql`.
- ⚠️ **Webhook push de Calendar no activable** hasta tener **dominio propio** verificado en Google Cloud (el `*.up.railway.app` no se puede verificar). El poll/focus cubre mientras tanto. Código ya listo.
- ⚠️ **Crons externos no configurados** (si el worker no está desplegado): el Daily y los recordatorios no se disparan solos. Pendiente: crear 4 jobs en cron-job.org (`daily` 20:45, `ventana1` 15:00, `ventana2` 18:45 CDMX→UTC, `calendar` c/12h).
- ⚠️ **Transcripción automática** requiere `DEEPGRAM_API_KEY` + worker corriendo. Sin eso, el audio se guarda y es reproducible, pero sin transcript.
- ℹ️ `Recorder.tsx` (tab Juntas) y `RecordingProvider` (home) son grabadores independientes; no grabar desde ambos a la vez.

**Bugs históricos ya resueltos** (para contexto): anon key mal nombrada (`PUBLISHABLE` vs `ANON`), `NEXT_PUBLIC_APP_URL` sin `https://` o con espacio, Site/Redirect URLs de Supabase apuntando a localhost, `redirect_uri` de Slack con espacio, sync de Slack cortando DMs (se cambió a `users.conversations`), delimitador `$$` chocando en el SQL de negocios (se usó `$body$`).

---

## 12. Deploy y correr local

### Railway (producción)
1. **Servicio web** (auto‑deploy de `main`): build `next build`, start `next start`. Todas las variables de §6.
2. **Servicio worker** (opcional pero recomendado): mismo repo, start command `npm run worker`. Mismas variables (necesita `DATABASE_URL`, `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, Slack, push).
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
| Cambiar la agenda/plantilla del día | `day_blocks` (migraciones 06/08), `/agenda`, `BlockEditor`/`BlockSheet` |
| Ajustar el sync de calendario | `src/lib/calendar.ts`, `Dashboard.tsx` (efectos de sync/realtime) |
| Cambiar el formato del CEO Brief | `anthropic.ts → composeCeoDaily` |
| Cambiar cómo se arma el contexto de IA | `src/lib/coo.ts` |
| Tocar la grabación desde el home | `RecordingProvider.tsx`, `DayTimeline.tsx` |
| Pipeline de transcripción | `transcription.ts`, `deepgram.ts`, `worker/index.ts` |
| Horarios de recordatorios | `worker/index.ts` (node-cron) y/o `/api/cron` |
| Personas / import | `personas` (02/03/05), `PersonasDirectory`, `/api/personas/import` |
| Contexto de negocio T1 | `negocios` (04) + `data-negocios-contexto.sql`, `NegociosView` |

---

*Cualquier duda de arquitectura, el `README.md` y los comentarios en `src/lib/*` tienen contexto adicional. Los `.sql` en `supabase/` están comentados y son la fuente de verdad del modelo de datos.*
