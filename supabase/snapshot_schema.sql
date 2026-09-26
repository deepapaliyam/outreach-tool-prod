-- =====================================================================
-- Send-time snapshot — schema addition (Stage 1c)
-- Run this in the Supabase SQL Editor AFTER schema.sql and gmail_schema.sql.
--
-- These columns are written ONCE, at the moment a draft is actually sent
-- (Gmail send or manual "mark as sent") — never touched by later
-- regenerations. This is what makes wording-level insights ("which
-- openers get replies") possible later without draft-regeneration noise
-- polluting the data.
-- =====================================================================

alter table public.outcomes
  add column if not exists sent_subject text,
  add column if not exists sent_body text,
  add column if not exists sent_sources jsonb;
