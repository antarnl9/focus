-- ==========================================================================
--  Migración 10 — Recomendaciones del contexto de Slack ("lo importante a atacar")
-- ==========================================================================
alter table public.slack_context add column if not exists recomendaciones text;
