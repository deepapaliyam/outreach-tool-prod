-- =====================================================================
-- Gmail sending — schema addition (Stage 1b)
-- Run this in the Supabase SQL Editor AFTER schema.sql.
-- =====================================================================

create table if not exists public.gmail_connections (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  refresh_token  text not null,
  gmail_address  text,
  connected_at   timestamptz default now()
);

-- RLS: enabled, but with NO policies for regular users at all — this
-- table is intentionally readable/writable only by the service_role key,
-- which the Edge Functions use. A signed-in user's own browser session
-- (the anon key) can never read or write a refresh token, even their own.
alter table public.gmail_connections enable row level security;

-- Track which lead a "sent via Gmail" outcome came from, and when.
alter table public.outcomes
  add column if not exists sent_via_gmail boolean default false;
