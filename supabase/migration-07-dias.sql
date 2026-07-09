-- ==========================================================================
--  Migración 07 — Bloques por día de la semana
--  Ejecútala en Supabase → SQL Editor → New query (una sola vez).
--  dias: arreglo de días (0=domingo .. 6=sábado). NULL o vacío = todos los días.
--  Ej.: solo miércoles → {3};  lunes/miércoles/viernes → {1,3,5}.
-- ==========================================================================
alter table public.day_blocks add column if not exists dias int[];
