-- =====================================================================
-- Sender voice/tone profile — schema addition
-- Run this in the Supabase SQL Editor after the other schema files.
--
-- Ordinary user data (not a credential like gmail_connections), so
-- normal per-user RLS applies — the user can read/write their own row
-- directly from the browser.
-- =====================================================================

create table if not exists public.sender_profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  name             text,
  offer            text,
  tone             text,               -- e.g. "Warm and casual", "Formal and direct"
  voice_sample     text,               -- an example email in the sender's own words, for style matching
  reference_urls   text[],             -- raw URLs the user entered (portfolio, case studies, etc.)
  reference_notes  jsonb,              -- cached [{url, text}] extracted server-side, refreshed on demand
  updated_at       timestamptz default now()
);

alter table public.sender_profiles enable row level security;

drop policy if exists "own sender profile" on public.sender_profiles;
create policy "own sender profile" on public.sender_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
