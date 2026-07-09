-- ==========================================================================
--  Migración 04 — Negocios / unidades de T1 (contexto + objetivo anual)
--  Ejecútala en Supabase → SQL Editor → New query (una sola vez).
-- ==========================================================================
create table if not exists public.negocios (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  nombre         text not null,
  contexto       text,             -- todo el contexto del negocio
  objetivo_anual text,             -- qué se quiere lograr este año
  orden          int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists negocios_user_idx on public.negocios (user_id, orden);

alter table public.negocios enable row level security;
drop policy if exists negocios_owner on public.negocios;
create policy negocios_owner on public.negocios
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
