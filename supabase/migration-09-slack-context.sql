-- ==========================================================================
--  Migración 09 — Contexto de Slack (resumen para la IA)
--  Guarda SOLO el resumen (no los mensajes crudos).
-- ==========================================================================
create table if not exists public.slack_context (
  user_id     uuid primary key references public.users (id) on delete cascade,
  resumen     text,
  mensajes    int not null default 0,
  actualizado timestamptz
);
alter table public.slack_context enable row level security;
drop policy if exists slack_context_owner on public.slack_context;
create policy slack_context_owner on public.slack_context
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
