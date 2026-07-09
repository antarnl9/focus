-- ==========================================================================
--  Migración 01 — grabaciones: columna "persona"
--  Ejecútala en Supabase → SQL Editor → New query (una sola vez).
--  Permite ligar cada grabación a una persona / con quién fue la junta.
--  (block_ref ya existe en el esquema base y liga la grabación a un bloque.)
-- ==========================================================================
alter table public.grabaciones add column if not exists persona text;
