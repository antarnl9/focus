-- ==========================================================================
--  Migración 02 — Directorio de personas + ligado a grabaciones (muchos-a-muchos)
--  Ejecútala en Supabase → SQL Editor → New query (una sola vez).
-- ==========================================================================

-- Directorio de personas (mini-CRM del COO).
create table if not exists public.personas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  nombre        text not null,
  puesto        text,
  correo        text,
  slack_user_id text,
  descripcion   text,
  created_at    timestamptz not null default now()
);
create index if not exists personas_user_idx on public.personas (user_id, nombre);

-- Relación muchos-a-muchos: una grabación puede ser con varias personas.
create table if not exists public.grabacion_personas (
  grabacion_id uuid not null references public.grabaciones (id) on delete cascade,
  persona_id   uuid not null references public.personas (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (grabacion_id, persona_id)
);
create index if not exists grabacion_personas_persona_idx on public.grabacion_personas (persona_id);

-- RLS: cada quien solo ve/edita lo suyo.
alter table public.personas enable row level security;
alter table public.grabacion_personas enable row level security;

drop policy if exists personas_owner on public.personas;
create policy personas_owner on public.personas
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists grabacion_personas_owner on public.grabacion_personas;
create policy grabacion_personas_owner on public.grabacion_personas
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
