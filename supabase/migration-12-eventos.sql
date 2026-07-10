-- ==========================================================================
--  Migración 12 — Espejo de Google Calendar (sync incremental + push)
--  Ejecútala en Supabase → SQL Editor → New query.
-- ==========================================================================

-- Espejo local de los eventos de Google (el home lee de aquí: instantáneo).
create table if not exists public.eventos (
  user_id     uuid not null references public.users (id) on delete cascade,
  gcal_id     text not null,                 -- id del evento en Google
  summary     text,
  inicio      timestamptz,
  fin         timestamptz,
  all_day     boolean not null default false,
  html_link   text,
  status      text,                          -- confirmed | tentative
  attendees   jsonb not null default '[]',   -- [{email, nombre, respuesta}]
  es_focus    boolean not null default false,
  actualizado timestamptz not null default now(),
  primary key (user_id, gcal_id)
);
create index if not exists eventos_user_inicio_idx on public.eventos (user_id, inicio);

alter table public.eventos enable row level security;
drop policy if exists eventos_owner on public.eventos;
create policy eventos_owner on public.eventos
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Estado del sync + canal de push (watch) por usuario, en la integración Google.
alter table public.integraciones add column if not exists cal_sync_token      text;
alter table public.integraciones add column if not exists cal_channel_id      text;
alter table public.integraciones add column if not exists cal_resource_id     text;
alter table public.integraciones add column if not exists cal_channel_expira  timestamptz;

-- Realtime: que el home reciba los cambios del espejo en vivo (como las dudas).
do $$
begin
  alter publication supabase_realtime add table public.eventos;
exception
  when duplicate_object then null;   -- ya estaba en la publicación
  when undefined_object then null;   -- la publicación aún no existe (Realtime off)
end $$;
