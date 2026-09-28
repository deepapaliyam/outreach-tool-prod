-- =====================================================================
-- Gmail send safety — schema
-- Run in the Supabase SQL Editor after the other schema files.
-- Safe to re-run. Supersedes the earlier gmail_send_log_schema.sql
-- (if you already ran that one, this simply upgrades it in place).
--
-- gmail_send_log records every REAL outreach send — i.e. a send whose
-- recipient is not one of the user's own addresses. Test-mode sends to
-- yourself and "Save as Gmail draft" calls are deliberately not logged:
-- they carry no cold-outreach reputation risk and shouldn't eat into
-- the daily allowance.
--
-- The window is a rolling 24 hours (checked via sent_at), not a calendar
-- day: 30 sends at 11:58pm plus 30 more at 12:02am is 60 in four
-- minutes, not "two safe days".
--
-- Only the send-email Edge Function (service role) can write to this
-- table. The browser can read its own rows to show the meter, but has no
-- insert/update/delete policy — so the limit can't be bypassed by
-- deleting log rows from the client.
-- =====================================================================

create table if not exists public.gmail_send_log (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table public.gmail_send_log
  add column if not exists lead_id uuid references public.leads (id) on delete set null,
  add column if not exists to_address text;

alter table public.gmail_send_log enable row level security;

-- Replace the old all-access policy (if present) with read-only.
drop policy if exists "own send log" on public.gmail_send_log;
drop policy if exists "read own send log" on public.gmail_send_log;
create policy "read own send log" on public.gmail_send_log
  for select using (auth.uid() = user_id);

create index if not exists gmail_send_log_user_time_idx on public.gmail_send_log (user_id, sent_at);
create index if not exists gmail_send_log_user_to_idx   on public.gmail_send_log (user_id, to_address);

-- Per-account daily limit for real sends (rolling 24h). The server clamps
-- this to 1-100 no matter what is stored.
alter table public.sender_profiles
  add column if not exists daily_send_cap integer default 30;
