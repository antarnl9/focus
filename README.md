# Focus — T1 Focus

Centro de comando del COO de T1: **agenda del día en bloques**, **dudas del equipo por Slack con contexto obligatorio**, **grabación + transcripción de juntas** y **Daily de cierre generado con IA**. PWA móvil, extremadamente responsiva.

**Stack:** Next.js 15 (PWA + API) · Supabase (Postgres + Auth + Storage + Realtime) · Slack API · Google Calendar API · Anthropic API · Deepgram (transcripción) · pg-boss (jobs) · Railway (hosting).

---

## 📁 Estructura

```
focus/
├─ supabase/schema.sql        # Ejecutar en Supabase (tablas + RLS + storage + realtime)
├─ src/
│  ├─ app/                    # Páginas + API routes + componentes de la PWA
│  ├─ lib/                    # supabase, anthropic, slack, google, deepgram, queue, push…
│  └─ middleware.ts           # Sesión + allowlist estricta
├─ worker/index.ts            # Jobs pesados (transcripción/resumen) + cron (recordatorios/Daily)
├─ .env.example               # Copia a .env.local y complétalo
└─ railway.json
```

---

## ✅ Requisitos previos

- **Node.js 20+** y npm.
- Cuentas: **Supabase**, **Google Cloud**, **Slack** (workspace de T1), **Anthropic**, **Railway**. Opcional: **Deepgram** (Fase 3, grabaciones).

---

## 1) Clona y prepara el entorno

```bash
npm install
cp .env.example .env.local
```

Ve completando `.env.local` con los pasos siguientes. Genera de una vez estos dos secretos:

```bash
# Cifrado de tokens OAuth en reposo (spec §8)
openssl rand -hex 32          # → TOKEN_ENCRYPTION_KEY

# Secreto para el endpoint de cron
openssl rand -hex 24          # → CRON_SECRET
```

---

## 2) Supabase (Postgres + Auth + Storage)

1. Crea un proyecto en <https://supabase.com>.
2. **SQL Editor → New query** → pega **todo** `supabase/schema.sql` → **Run**. Esto crea tablas, RLS, el bucket privado `grabaciones` y publica `dudas` en Realtime.
3. **Project Settings → API**: copia a `.env.local`
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon public)
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role — **secreto**, solo servidor/worker)
4. **Project Settings → Database → Connection string → URI** (modo *Session*): cópiala a `DATABASE_URL` y añade `?sslmode=require` al final. La usa pg-boss/worker.
5. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (en prod, tu dominio de Railway).
   - **Redirect URLs**: agrega `http://localhost:3000/auth/callback` y `https://TU-DOMINIO.up.railway.app/auth/callback`.

> El login con Google se configura en el paso 3.

---

## 3) Google Cloud (login + Calendar en un solo consent)

1. <https://console.cloud.google.com> → crea/elige un proyecto.
2. **APIs & Services → Enabled APIs** → habilita **Google Calendar API**.
3. **OAuth consent screen**: tipo **Internal** (así solo cuentas @t1.com). Agrega los scopes:
   - `.../auth/calendar.events`
   - `.../auth/calendar.readonly`
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - **Authorized redirect URIs**: `https://TU-PROYECTO.supabase.co/auth/v1/callback`
     (lo encuentras en Supabase → Authentication → Providers → Google.)
   - Copia **Client ID** y **Client secret**.
5. En **Supabase → Authentication → Providers → Google**: pega el **Client ID** y **Client secret**, y **habilita** el provider.
6. En `.env.local` pon los mismos valores (los usa el backend para refrescar el token de Calendar):
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID=primary`
   - `GOOGLE_HOSTED_DOMAIN=t1.com` y `NEXT_PUBLIC_GOOGLE_HOSTED_DOMAIN=t1.com`

**Allowlist (spec §4):** en `.env.local`, `ALLOWED_EMAILS=antar@t1.com` (coma-separado si agregas directivos después; se valida server-side, sin redeploy de lógica).

---

## 4) Anthropic (IA)

- <https://console.anthropic.com> → crea una **API key** → `ANTHROPIC_API_KEY`.
- `ANTHROPIC_MODEL=claude-opus-4-8` (predeterminado, el más capaz). Puedes cambiarlo a `claude-sonnet-4-6` si prefieres optimizar costo — la IA aquí solo hace triage, validación, resúmenes y el Daily.

---

## 5) Slack (crítico)

1. <https://api.slack.com/apps> → **Create New App → From scratch** → instálalo en el workspace de T1.
2. **OAuth & Permissions → Scopes → Bot Token Scopes** (spec §5.1):
   `chat:write`, `channels:read`, `channels:history`, `groups:history`, `im:write`, `im:history`, `users:read`, `commands`, `reactions:write`, `files:read`.
3. **Install to Workspace** → copia el **Bot User OAuth Token** → `SLACK_BOT_TOKEN` (`xoxb-…`).
4. **Basic Information → Signing Secret** → `SLACK_SIGNING_SECRET`.
5. **Slash Commands → Create New Command**:
   - Command: `/duda`
   - Request URL: `https://TU-DOMINIO/api/slack/commands`
6. **Interactivity & Shortcuts** → ON → Request URL: `https://TU-DOMINIO/api/slack/interactions`
7. **Event Subscriptions** → ON → Request URL: `https://TU-DOMINIO/api/slack/events` (Slack verificará; el endpoint responde el challenge). Suscribe **Subscribe to bot events**: `message.im` (para redirigir DMs al canal). *(Opcional: `message.channels`, `app_mention`.)*
8. Crea los canales `#dudas-coo` y `#daily-coo`, **invita al bot** a ambos (`/invite @tu-app`).
9. Obtén los **IDs de canal** (en Slack: abre el canal → nombre → “Copy link”, el ID va al final, empieza con `C…`) y ponlos en `.env.local`:
   - `SLACK_DUDAS_CHANNEL_ID`, `SLACK_DAILY_CHANNEL_ID`.

**Vincula tu usuario de Slack al COO** (para DMs de recordatorios y urgencias). Tras tu primer login (paso 8 de despliegue), corre en Supabase SQL Editor:

```sql
-- Tu Slack ID: en Slack, tu perfil → ⋮ → "Copy member ID" (empieza con U…)
update public.users set slack_user_id = 'U0XXXXXXX' where email = 'antar@t1.com';
```

---

## 6) Web Push (notificaciones PWA)

```bash
npx web-push generate-vapid-keys
```

Pon la **pública** en `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y la **privada** en `VAPID_PRIVATE_KEY`. `VAPID_SUBJECT=mailto:antar@t1.com`.

> Notas de plataforma: el push web funciona en Android/desktop y en **iOS 16.4+** *solo si la PWA está instalada* en la pantalla de inicio. El **DM de Slack** es el respaldo (spec §5.5), así que siempre te llegan las urgencias.

---

## 7) Deepgram — transcripción (Fase 3, opcional)

- <https://deepgram.com> → API key → `DEEPGRAM_API_KEY`.
- Sin esta clave, la app **funciona igual**: puedes grabar y subir audios, pero no se transcriben ni resumen automáticamente hasta que la configures.

---

## ▶️ Correr en local

Dos procesos (en dos terminales):

```bash
npm run dev        # PWA + API en http://localhost:3000
npm run worker     # Jobs (transcripción/resumen) + cron (recordatorios/Daily)
```

Para probar los webhooks de Slack en local, expón el puerto con un túnel (p. ej. `ngrok http 3000`) y usa esa URL pública en las Request URLs de Slack.

---

## 🚂 Despliegue en Railway (web + worker + cron)

Sube el repo a GitHub y en Railway crea **un proyecto con estos servicios** (todos con las **mismas variables de entorno** del paso 1–7):

### Servicio 1 — `web`
- Start command: `npm run start`
- Genera dominio (**Settings → Networking → Generate Domain**).
- Pon ese dominio en `NEXT_PUBLIC_APP_URL` (sin slash final) y actualiza:
  - Supabase → Redirect URLs (agrega `https://…/auth/callback`).
  - Slack → las 3 Request URLs (commands/interactions/events).

### Servicio 2 — `worker`
- **New Service → GitHub repo (el mismo)** → **Settings → Deploy → Start Command:** `npm run worker`
- Sin dominio. Procesa transcripciones y ejecuta el **cron interno** (node-cron, hora CDMX): 15:00 y 18:45 (recordatorio pre-ventana) y 20:45 (Daily). `TZ=America/Mexico_City`.

### Servicio 3 — `cron` (opcional, alternativa al cron del worker)
Si prefieres no depender del cron interno del worker, usa **Railway Cron Jobs** apuntando al endpoint protegido `/api/cron` (deja el worker solo para transcripción). Crea 3 cron services con:

| Horario (CDMX) | Cron expr | Command |
|---|---|---|
| 15:00 L-V | `0 15 * * 1-5` | `curl -fsS "https://TU-DOMINIO/api/cron?task=ventana1&secret=$CRON_SECRET"` |
| 18:45 L-V | `45 18 * * 1-5` | `curl -fsS "https://TU-DOMINIO/api/cron?task=ventana2&secret=$CRON_SECRET"` |
| 20:45 L-V | `45 20 * * 1-5` | `curl -fsS "https://TU-DOMINIO/api/cron?task=daily&secret=$CRON_SECRET"` |

> Configura la zona horaria de los cron de Railway a `America/Mexico_City`, o ajusta a UTC (CDMX = UTC−6). **Elige una sola vía** (worker node-cron *o* Railway Cron) para no duplicar recordatorios.

---

## 🚀 Primer uso (checklist)

1. Abre `https://TU-DOMINIO` → **Entrar con Google** (cuenta `antar@t1.com`). Cualquier otra cuenta ve “acceso restringido”.
2. Al entrar se **siembran** la plantilla del día (10:30–21:00) y las prioridades semilla.
3. Corre el SQL para vincular tu `slack_user_id` (paso 5).
4. En el tab **Hoy → Ajustes rápidos**: **Activar notificaciones** y **Sincronizar plantilla a Calendar** (crea los bloques como eventos “ocupado” recurrentes; nadie podrá agendar sobre *Definición*).
5. Instala la PWA en tu celular: Safari/Chrome → Compartir → **Añadir a pantalla de inicio**.
6. Prueba el flujo de dudas: desde Slack, `/duda` → llena los 5 campos → aparece en el tab **Dudas** (urgentes arriba) y, si es urgente, te llega push + DM.

---

## 🧩 Cómo cumple los criterios de aceptación (spec §10)

| Criterio | Dónde |
|---|---|
| Solo `antar@t1.com` inicia sesión | `middleware.ts` + `ALLOWED_EMAILS` (2 capas: `hd=t1.com` + validación server-side) |
| Deploy Railway con Supabase (web+worker+cron) | esta guía |
| `/duda` en <60 s | modal Block Kit con 5 campos obligatorios |
| Duda sin los 5 campos no llega a la cola | triage IA marca `incompleta` y pide completar por DM; la cola solo muestra `pendiente` |
| Dudas agrupadas (urgentes primero) | tab **Dudas** + Realtime |
| Resolver publica en hilo en <5 s | `/api/dudas/[id]/resolve` |
| Toda resolución queda en bitácora | inserción automática en `bitacora` |
| Daily en <15 s, editable, 1 clic a `#daily-coo` | tab **Daily** + `/api/daily/generate` y `/send` |
| Eventos de Calendar junto a bloques | `listTodayEvents` + `DayTimeline` |
| Nadie agenda sobre Definición | plantilla escrita como `busy` (opaque) en Calendar |

---

## 🔐 Seguridad (spec §8)

- Acceso solo `antar@t1.com` vía Google OAuth (allowlist server-side).
- **RLS** en todas las tablas; el frontend usa la anon key, nunca la service role.
- Tokens de Google **cifrados** en reposo (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`).
- **Firma de Slack** verificada en todos los webhooks (`X-Slack-Signature`, anti-replay 5 min).
- Audios/transcripciones en **bucket privado**; acceso por dueño (carpeta = `user_id`).
- Aviso de grabación en la pantalla de juntas.

---

## 🛠️ Notas y extras

- **Modelo IA:** cámbialo con `ANTHROPIC_MODEL` sin tocar código.
- **Iconos PWA:** se usa `public/icons/icon.svg` (funciona para instalar en navegadores modernos). Si quieres iconos PNG nítidos en todos los dispositivos, exporta `icon-192.png`, `icon-512.png` y `maskable-512.png` desde el SVG y vuelve a listarlos en `public/manifest.webmanifest`.
- **Fase 4 (spec §9) — incluida:**
  - **Métricas semanales** (dudas creadas/resueltas, tiempo promedio a resolución, % resueltas en ventana vs interrupciones, cumplimiento de bloques protegidos vía solapamiento con Calendar, redirigidas por owner).
  - **Vista semanal + revisión de viernes** en `/semana` (botón **Semana** en el header): juntas candidatas a matar, prioridades al 90% y una revisión de viernes generada con IA.
  - **Multi-usuario:** la base ya es multi-tenant (`user_id` + RLS en todas las tablas; el bootstrap crea datos por usuario). Para habilitar a otro directivo, agrégalo a `ALLOWED_EMAILS` (coma-separado) y entrará con su propio centro de comando y datos aislados. *Nota:* el enrutamiento de dudas de Slack apunta al COO primario (`rol='coo'`); para dar a cada directivo su propio canal de dudas se necesitaría mapear `slack_user_id`/canal → usuario (extensión futura acotada).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | PWA + API en desarrollo |
| `npm run build` / `npm run start` | Build y arranque de producción (servicio web) |
| `npm run worker` | Worker de jobs + cron |
| `npm run typecheck` | Verifica tipos |
