-- ==========================================================================
--  FOCUS (T1 Focus) — Esquema Postgres para Supabase
--  Ejecuta este archivo completo en: Supabase → SQL Editor → New query.
--  Incluye tablas, Row Level Security (RLS), storage y triggers.
-- ==========================================================================

-- Extensiones ---------------------------------------------------------------
create extension if not exists "pgcrypto";

-- Esquema dedicado para la cola de jobs (pg-boss). El worker lo crea solo,
-- pero lo dejamos listo aquí por claridad.
create schema if not exists pgboss;

-- ==========================================================================
--  TABLAS
-- ==========================================================================

-- Perfil de usuario. id == auth.users.id (Supabase Auth).
create table if not exists public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text unique not null,
  nombre       text,
  slack_user_id text,
  rol          text not null default 'coo' check (rol in ('coo', 'equipo', 'ceo')),
  created_at   timestamptz not null default now()
);

-- Bloques de la agenda del día (plantilla configurable).
-- dia_semana: NULL = aplica todos los días; 0=domingo .. 6=sábado (JS getDay()).
create table if not exists public.day_blocks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  dia_semana    smallint,
  hora_ini      text not null,             -- 'HH:MM' 24h, hora local America/Mexico_City
  hora_fin      text not null,
  label         text not null,
  tipo          text not null default 'flex'
                check (tipo in ('fija', 'protegido', 'dudas', 'flex', 'neutral', 'comida')),
  orden         int not null default 0,
  gcal_event_id text,
  created_at    timestamptz not null default now()
);
create index if not exists day_blocks_user_idx on public.day_blocks (user_id, orden);

-- Dudas del equipo (llegan por Slack).
create table if not exists public.dudas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade, -- el COO dueño de la cola
  slack_ts      text,               -- ts del mensaje raíz en el canal
  slack_channel text,
  autor_id      text,               -- slack_user_id del autor
  autor_nombre  text,
  contexto      text,
  decision      text,
  opciones      text,
  recomendacion text,
  impacto       text,
  urgente       boolean not null default false,
  triage_motivo text,               -- explicación IA de la clasificación
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'incompleta', 'resuelta', 'redirigida')),
  resolucion    text,
  resuelto_por  text,
  redirigida_a  text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists dudas_user_estado_idx on public.dudas (user_id, estado, urgente desc, created_at);
create unique index if not exists dudas_slack_ts_idx on public.dudas (slack_channel, slack_ts) where slack_ts is not null;

-- Prioridades (foco). tier: 0=P0, 1=P1, 2=P2.
create table if not exists public.prioridades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  tier       smallint not null default 0 check (tier in (0, 1, 2)),
  texto      text not null,
  done       boolean not null default false,
  orden      int not null default 0,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists prioridades_user_idx on public.prioridades (user_id, tier, orden);

-- Bitácora del día (se llena automáticamente + entradas manuales).
create table if not exists public.bitacora (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  fecha            date not null default (now() at time zone 'America/Mexico_City')::date,
  hora             text not null default to_char(now() at time zone 'America/Mexico_City', 'HH24:MI'),
  tipo             text not null default 'nota'
                   check (tipo in ('nota', 'duda_resuelta', 'prioridad', 'grabacion', 'acuerdo', 'daily')),
  texto            text not null,
  ref_duda_id      uuid references public.dudas (id) on delete set null,
  ref_grabacion_id uuid,
  created_at       timestamptz not null default now()
);
create index if not exists bitacora_user_fecha_idx on public.bitacora (user_id, fecha, created_at);

-- Grabaciones de juntas.
create table if not exists public.grabaciones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  label         text not null,
  block_ref     text,
  fecha         date not null default (now() at time zone 'America/Mexico_City')::date,
  duracion_seg  int not null default 0,
  audio_path    text,              -- path en el bucket 'grabaciones'
  transcript    text,
  resumen       text,
  acuerdos      jsonb not null default '[]'::jsonb,
  estado        text not null default 'grabando'
                check (estado in ('grabando', 'subida', 'transcribiendo', 'procesando', 'lista', 'error')),
  created_at    timestamptz not null default now()
);
create index if not exists grabaciones_user_fecha_idx on public.grabaciones (user_id, fecha desc);

-- Daily de cierre.
create table if not exists public.dailies (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  fecha         date not null default (now() at time zone 'America/Mexico_City')::date,
  contenido     text not null default '',
  enviado_slack boolean not null default false,
  slack_ts      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists dailies_user_fecha_idx on public.dailies (user_id, fecha);

-- Integraciones OAuth (tokens cifrados en reposo).
create table if not exists public.integraciones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  proveedor     text not null,      -- 'google'
  access_token  text,               -- cifrado (AES-256-GCM)
  refresh_token text,               -- cifrado
  scopes        text,
  expira        timestamptz,
  updated_at    timestamptz not null default now(),
  unique (user_id, proveedor)
);

-- Suscripciones Web Push (PWA).
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,
  created_at timestamptz not null default now()
);

-- ==========================================================================
--  updated_at trigger
-- ==========================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists dailies_touch on public.dailies;
create trigger dailies_touch before update on public.dailies
  for each row execute function public.touch_updated_at();

-- ==========================================================================
--  ROW LEVEL SECURITY
--  Cada fila pertenece a un user_id; solo su dueño la lee/escribe.
--  El backend (service role) omite RLS para escribir dudas que llegan de Slack.
-- ==========================================================================
alter table public.users             enable row level security;
alter table public.day_blocks        enable row level security;
alter table public.dudas             enable row level security;
alter table public.prioridades       enable row level security;
alter table public.bitacora          enable row level security;
alter table public.grabaciones       enable row level security;
alter table public.dailies           enable row level security;
alter table public.integraciones     enable row level security;
alter table public.push_subscriptions enable row level security;

-- users: el dueño es la propia fila (id == auth.uid())
drop policy if exists users_self on public.users;
create policy users_self on public.users
  using (auth.uid() = id) with check (auth.uid() = id);

-- Macro de políticas "dueño por user_id" para las demás tablas.
do $$
declare t text;
begin
  foreach t in array array[
    'day_blocks','dudas','prioridades','bitacora',
    'grabaciones','dailies','integraciones','push_subscriptions'
  ] loop
    execute format('drop policy if exists %I_owner on public.%I;', t, t);
    execute format(
      'create policy %I_owner on public.%I using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t, t
    );
  end loop;
end $$;

-- ==========================================================================
--  STORAGE — bucket privado para audios/transcripciones
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('grabaciones', 'grabaciones', false)
on conflict (id) do nothing;

-- Solo el dueño (carpeta = su user_id) accede a sus objetos.
drop policy if exists grabaciones_owner_read on storage.objects;
create policy grabaciones_owner_read on storage.objects for select
  using (bucket_id = 'grabaciones' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists grabaciones_owner_write on storage.objects;
create policy grabaciones_owner_write on storage.objects for insert
  with check (bucket_id = 'grabaciones' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists grabaciones_owner_delete on storage.objects;
create policy grabaciones_owner_delete on storage.objects for delete
  using (bucket_id = 'grabaciones' and (storage.foldername(name))[1] = auth.uid()::text);

-- ==========================================================================
--  Realtime — publica cambios de dudas para actualizar el dashboard en vivo.
-- ==========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dudas'
  ) then
    alter publication supabase_realtime add table public.dudas;
  end if;
end $$;
