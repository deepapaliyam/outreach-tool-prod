-- =====================================================================
-- Send test mode — schema addition
-- Run this in the Supabase SQL Editor after sender_profile_schema.sql.
--
-- Defaults to true (safe by default) — a fresh account/profile starts
-- with test mode ON, so a first-time "just trying the Send button"
-- click can never reach a real business by accident.
-- =====================================================================

alter table public.sender_profiles
  add column if not exists test_mode boolean default true,
  add column if not exists test_email text;
