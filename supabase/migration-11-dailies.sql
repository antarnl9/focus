-- ==========================================================================
--  Migración 11 — Dos tipos de Daily (CEO / personal) + historial
--  Ejecútala en Supabase → SQL Editor → New query.
-- ==========================================================================
alter table public.dailies add column if not exists tipo text not null default 'ceo'
  check (tipo in ('ceo', 'personal'));

-- Un daily por (usuario, fecha, tipo). Reemplaza el índice viejo por fecha.
drop index if exists dailies_user_fecha_idx;
create unique index if not exists dailies_user_fecha_tipo_idx on public.dailies (user_id, fecha, tipo);
