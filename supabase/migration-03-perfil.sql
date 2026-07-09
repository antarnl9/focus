-- ==========================================================================
--  Migración 03 — Tipo de persona + perfil del COO
--  Ejecútala en Supabase → SQL Editor → New query (una sola vez).
-- ==========================================================================

-- Tipo de persona: interno (empleado T1), cliente, proveedor u otro.
alter table public.personas add column if not exists tipo text not null default 'interno'
  check (tipo in ('interno', 'cliente', 'proveedor', 'otro'));

-- Perfil del COO (alimenta al Daily y al coach de alineación).
alter table public.users add column if not exists titulo text;      -- p.ej. "COO"
alter table public.users add column if not exists objetivo text;    -- tu objetivo en la empresa
alter table public.users add column if not exists bio text;         -- quién eres / contexto
