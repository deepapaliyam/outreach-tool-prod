-- =====================================================================
-- Outreach Tool - EVERYTHING in one go (setup files 1 to 9, in order).
--
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is the same as running these files one after another:
--   schema, gmail_schema, snapshot_schema, sender_profile_schema,
--   test_mode_schema, send_safety_schema, web_findings_schema,
--   v7_schema, v8_schema
-- Safe to run more than once, and safe on a project that already has some
-- of them: it only adds what is missing and never deletes your leads,
-- outcomes or settings. (Supabase may ask you to confirm because the file
-- contains "drop policy" lines - that only refreshes access rules; confirm.)
--
-- AFTER it finishes, make yourself the administrator - see the last lines
-- of this file.
-- =====================================================================


-- ####################################################################
-- ## PART 1 of 9: schema.sql
-- ####################################################################

-- =====================================================================
-- Outreach Tool — Supabase schema (Stage 1)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It creates two tables that mirror exactly what the app reads/writes,
-- plus indexes and Row Level Security so each user sees only their data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- LEADS: one row per business (already deduped from director rows on
-- ingest). entity_id is the natural key from the MCA/NRC file; we scope
-- uniqueness per user so two users can hold the same public entity.
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,

  -- identity / source fields (from the uploaded file)
  entity_id                text not null,
  name                     text not null,
  entity_type              text,
  state                    text,
  district                 text,
  nic_label                text,
  paid_up_capital          numeric,
  num_directors            integer default 1,

  -- contact
  company_email            text,
  stakeholder_name         text,
  stakeholder_email        text,
  stakeholder_domain_match boolean default false,

  -- enrichment (written by n8n later; defaults to unknown)
  website_status           text default 'Unknown',
  business_listings        text,
  search_notes             text,

  -- scoring (computed on ingest; stored so the list is fast to read)
  need_score               integer,
  reach_score              integer,
  region_bonus             integer default 0,
  priority_score           integer,
  score_breakdown          jsonb,          -- array of {group, points, why}

  -- draft (generated on demand, server-side)
  draft                    jsonb,          -- {subject, body, evaluation[], generatedAt, sendTo}

  upload_date              date default current_date,
  created_at               timestamptz default now(),

  unique (user_id, entity_id)
);

create index if not exists leads_user_priority_idx
  on public.leads (user_id, priority_score desc);
create index if not exists leads_user_state_idx
  on public.leads (user_id, state);
create index if not exists leads_user_industry_idx
  on public.leads (user_id, nic_label);

-- ---------------------------------------------------------------------
-- OUTCOMES: one row per lead you actually contacted. Kept separate from
-- leads so the funnel/insights queries stay clean and a lead can exist
-- with no outcome yet.
-- ---------------------------------------------------------------------
create table if not exists public.outcomes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  lead_id               uuid not null references public.leads (id) on delete cascade,

  contacted             boolean default true,
  contacted_date        date,
  replied               boolean default false,
  response_type         text,             -- Positive | Neutral | Negative | No response
  proposal_sent         boolean default false,
  quoted_price          numeric,
  materialized          boolean default false,   -- became a real website build
  not_proceeded_reason  text,             -- Price too high | No response | ...
  payment_received      boolean default false,
  final_amount          numeric,
  notes                 text,

  updated_at            timestamptz default now(),

  unique (user_id, lead_id)
);

create index if not exists outcomes_user_idx on public.outcomes (user_id);

-- ---------------------------------------------------------------------
-- Row Level Security: a user can only see and change their own rows.
-- ---------------------------------------------------------------------
alter table public.leads    enable row level security;
alter table public.outcomes enable row level security;

drop policy if exists "own leads" on public.leads;
create policy "own leads" on public.leads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own outcomes" on public.outcomes;
create policy "own outcomes" on public.outcomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Convenience view the Insights tab can read directly (lead + outcome
-- joined, only contacted rows).
-- ---------------------------------------------------------------------
create or replace view public.contacted_leads as
  select
    l.id, l.user_id, l.name, l.nic_label, l.state, l.district,
    l.priority_score,
    o.replied, o.response_type, o.proposal_sent, o.quoted_price,
    o.materialized, o.not_proceeded_reason, o.payment_received, o.final_amount,
    o.contacted_date
  from public.leads l
  join public.outcomes o on o.lead_id = l.id
  where o.contacted = true;


-- ####################################################################
-- ## PART 2 of 9: gmail_schema.sql
-- ####################################################################

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


-- ####################################################################
-- ## PART 3 of 9: snapshot_schema.sql
-- ####################################################################

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


-- ####################################################################
-- ## PART 4 of 9: sender_profile_schema.sql
-- ####################################################################

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


-- ####################################################################
-- ## PART 5 of 9: test_mode_schema.sql
-- ####################################################################

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


-- ####################################################################
-- ## PART 6 of 9: send_safety_schema.sql
-- ####################################################################

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


-- ####################################################################
-- ## PART 7 of 9: web_findings_schema.sql
-- ####################################################################

-- =====================================================================
-- Web-check evidence — schema
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- web_findings   the structured evidence from the web check: the website
--                found and why, matching listings, Google Business
--                results, other results, and which registration-directory
--                sites were ignored — everything the UI shows so a person
--                can validate it, and everything drafts are grounded in.
-- web_checked_at when that check ran.
-- =====================================================================

alter table public.leads
  add column if not exists web_findings jsonb,
  add column if not exists web_checked_at timestamptz;

-- The previous version of the web check wrote a machine-generated summary
-- into search_notes (which is meant for YOUR notes), including candidate
-- URLs that must not be fed to email drafts as facts. Those exact
-- sentences are only ever produced by that function, so clear them.
-- Anything you typed yourself is left alone. The evidence now lives in
-- web_findings instead — re-run the check on those leads to get it.
update public.leads
   set search_notes = null
 where search_notes like 'Company email domain (%'
    or search_notes like 'Search surfaced a possible site:%'
    or search_notes like 'No independent website found in search results.%';


-- ####################################################################
-- ## PART 8 of 9: v7_schema.sql
-- ####################################################################

-- =====================================================================
-- v7 schema: profile & signature fields, hidden admin, event log,
-- Gmail response log, logo storage.
-- Run in the Supabase SQL Editor after the earlier schema files.
-- Safe to re-run.
-- =====================================================================

-- v7 builds on the earlier setup files. If they were never run, stop here with a plain
-- message (nothing below is applied) instead of failing halfway with "relation does not exist".
do $$
begin
  if to_regclass('public.leads') is null or to_regclass('public.outcomes') is null
     or to_regclass('public.sender_profiles') is null or to_regclass('public.gmail_send_log') is null then
    raise exception 'Some earlier setup files have not been run yet. Run supabase/00_run_everything.sql instead - it runs every setup file in the right order - then come back.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Profile & signature (Profile & Settings tab)
--    Ordinary per-user data; the existing "own sender profile" policy
--    already lets a user read/write only their own row.
-- ---------------------------------------------------------------------
alter table public.sender_profiles
  add column if not exists title                text,
  add column if not exists phone                text,
  add column if not exists contact_email        text,
  add column if not exists company_name         text,
  add column if not exists business_info        text,
  add column if not exists website              text,
  add column if not exists social_links         jsonb default '[]'::jsonb,   -- [{label, url}]
  add column if not exists portfolio_links      jsonb default '[]'::jsonb,   -- [{label, url}]
  add column if not exists signature_html       text,
  add column if not exists signature_updated_at timestamptz;

-- A signature is a few lines and a logo, not a web page.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sender_profiles_signature_size') then
    alter table public.sender_profiles
      add constraint sender_profiles_signature_size
      check (signature_html is null or length(signature_html) <= 20000);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Admins (hidden Admin tab)
--    A user can only ever see their OWN row here, so the app can ask
--    "am I an admin?". There is deliberately no insert/update/delete
--    policy: nobody can make themselves an admin from the app. Add
--    admins from this SQL editor only (see the bottom of this file).
-- ---------------------------------------------------------------------
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz default now()
);

alter table public.app_admins enable row level security;

drop policy if exists "read own admin row" on public.app_admins;
create policy "read own admin row" on public.app_admins
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3. Event log (errors, AI usage, health checks)
--    Written by the Edge Functions (service role). RLS is on with NO
--    policies, so no browser session can read or write it. The admin
--    function reads it after checking the caller is in app_admins.
-- ---------------------------------------------------------------------
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid references auth.users (id) on delete set null,
  source     text not null,                 -- which function: draft, send-email, ...
  kind       text not null,                 -- error | usage | health
  code       text,                          -- e.g. anthropic_key_invalid
  message    text,
  data       jsonb not null default '{}'::jsonb
);

alter table public.app_events enable row level security;

create index if not exists app_events_time_idx      on public.app_events (created_at desc);
create index if not exists app_events_kind_time_idx on public.app_events (kind, created_at desc);
create index if not exists app_events_user_time_idx on public.app_events (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. Gmail responses
--    What Gmail answered for every send, test send and Gmail draft:
--    message id, thread id, labels, or the exact error. Written only by
--    the send-email function; users can read their own rows.
--    (A Gmail "accepted" answer means Gmail took the message. It is not
--    proof of inbox delivery - bounces arrive later as separate mail.)
-- ---------------------------------------------------------------------
create table if not exists public.gmail_responses (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  lead_id          uuid references public.leads (id) on delete set null,
  kind             text not null check (kind in ('send', 'test', 'draft')),
  to_address       text,
  subject          text,
  ok               boolean not null,
  http_status      integer,
  gmail_message_id text,
  gmail_thread_id  text,
  label_ids        text[],
  error_message    text,
  response         jsonb
);

alter table public.gmail_responses enable row level security;

drop policy if exists "read own gmail responses" on public.gmail_responses;
create policy "read own gmail responses" on public.gmail_responses
  for select using (auth.uid() = user_id);

create index if not exists gmail_responses_user_time_idx on public.gmail_responses (user_id, created_at desc);
create index if not exists gmail_responses_lead_idx      on public.gmail_responses (lead_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. Signature logo storage
--    Public bucket (an email's logo must be viewable by the recipient),
--    images only, 512 KB max, and a user can only write inside their
--    own folder (<user id>/...).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signature-assets', 'signature-assets', true, 524288,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 524288,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

drop policy if exists "signature assets: own folder insert" on storage.objects;
create policy "signature assets: own folder insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signature-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "signature assets: own folder update" on storage.objects;
create policy "signature assets: own folder update" on storage.objects
  for update to authenticated
  using (bucket_id = 'signature-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "signature assets: own folder delete" on storage.objects;
create policy "signature assets: own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'signature-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "signature assets: own folder read" on storage.objects;
create policy "signature assets: own folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 'signature-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 6. Admin reports
--    Read across ALL users, so they run as the table owner and can only be
--    called with the service-role key (the admin Edge Function, after it has
--    checked the caller is in app_admins). Nothing in a browser session can
--    execute them.
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language sql stable security definer set search_path = public, auth
as $$
  select jsonb_build_object(
    'users',            (select count(*) from auth.users),
    'leads',            (select count(*) from public.leads),
    'drafts',           (select count(*) from public.leads where draft is not null),
    'contacted',        (select count(*) from public.outcomes where contacted),
    'sends_24h',        (select count(*) from public.gmail_send_log where sent_at > now() - interval '24 hours'),
    'sends_7d',         (select count(*) from public.gmail_send_log where sent_at > now() - interval '7 days'),
    'sends_30d',        (select count(*) from public.gmail_send_log where sent_at > now() - interval '30 days'),
    'gmail_ok_7d',      (select count(*) from public.gmail_responses where ok and created_at > now() - interval '7 days'),
    'gmail_failed_7d',  (select count(*) from public.gmail_responses where not ok and created_at > now() - interval '7 days'),
    'errors_24h',       (select count(*) from public.app_events where kind = 'error' and created_at > now() - interval '24 hours'),
    'errors_7d',        (select count(*) from public.app_events where kind = 'error' and created_at > now() - interval '7 days'),
    'ai_calls_30d',     (select count(*) from public.app_events where kind = 'usage' and source in ('draft', 'refine-selection') and created_at > now() - interval '30 days'),
    'input_tokens_30d', (select coalesce(sum((data ->> 'input_tokens')::bigint), 0) from public.app_events where kind = 'usage' and source in ('draft', 'refine-selection') and created_at > now() - interval '30 days'),
    'output_tokens_30d',(select coalesce(sum((data ->> 'output_tokens')::bigint), 0) from public.app_events where kind = 'usage' and source in ('draft', 'refine-selection') and created_at > now() - interval '30 days'),
    'searches_30d',     (select count(*) from public.app_events where kind = 'usage' and source = 'enrich-lead' and created_at > now() - interval '30 days'),
    'errors_by_code_7d',(select coalesce(jsonb_object_agg(code, n), '{}'::jsonb)
                           from (select coalesce(code, 'unknown') as code, count(*) as n
                                   from public.app_events
                                  where kind = 'error' and created_at > now() - interval '7 days'
                                  group by 1) t),
    'last_health',      (select jsonb_build_object('at', created_at, 'ok', code = 'ok', 'mode', data ->> 'mode', 'checks', data -> 'checks')
                           from public.app_events where kind = 'health' order by created_at desc limit 1)
  );
$$;

create or replace function public.admin_user_stats()
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  leads bigint, drafts bigint, contacted bigint, sends_30d bigint,
  ai_calls_30d bigint, ai_tokens_30d bigint, errors_7d bigint, gmail_connected boolean
)
language sql stable security definer set search_path = public, auth
as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
         (select count(*) from public.leads l where l.user_id = u.id),
         (select count(*) from public.leads l where l.user_id = u.id and l.draft is not null),
         (select count(*) from public.outcomes o where o.user_id = u.id and o.contacted),
         (select count(*) from public.gmail_send_log g where g.user_id = u.id and g.sent_at > now() - interval '30 days'),
         (select count(*) from public.app_events e where e.user_id = u.id and e.kind = 'usage' and e.source in ('draft', 'refine-selection') and e.created_at > now() - interval '30 days'),
         (select coalesce(sum(coalesce((e.data ->> 'input_tokens')::bigint, 0) + coalesce((e.data ->> 'output_tokens')::bigint, 0)), 0)
            from public.app_events e where e.user_id = u.id and e.kind = 'usage' and e.source in ('draft', 'refine-selection') and e.created_at > now() - interval '30 days'),
         (select count(*) from public.app_events e where e.user_id = u.id and e.kind = 'error' and e.created_at > now() - interval '7 days'),
         exists (select 1 from public.gmail_connections c where c.user_id = u.id)
    from auth.users u
   order by u.created_at desc;
$$;

create or replace function public.admin_recent_events(kind_filter text, limit_n integer)
returns table (id bigint, created_at timestamptz, user_id uuid, email text, source text, kind text, code text, message text, data jsonb)
language sql stable security definer set search_path = public, auth
as $$
  select e.id, e.created_at, e.user_id, u.email::text, e.source, e.kind, e.code, e.message, e.data
    from public.app_events e
    left join auth.users u on u.id = e.user_id
   where (kind_filter is null or kind_filter = '' or e.kind = kind_filter)
   order by e.created_at desc
   limit least(greatest(coalesce(limit_n, 100), 1), 500);
$$;

create or replace function public.admin_recent_gmail(limit_n integer)
returns table (id bigint, created_at timestamptz, user_id uuid, email text, kind text, to_address text, subject text, ok boolean,
               http_status integer, gmail_message_id text, gmail_thread_id text, label_ids text[], error_message text)
language sql stable security definer set search_path = public, auth
as $$
  select r.id, r.created_at, r.user_id, u.email::text, r.kind, r.to_address, r.subject, r.ok,
         r.http_status, r.gmail_message_id, r.gmail_thread_id, r.label_ids, r.error_message
    from public.gmail_responses r
    left join auth.users u on u.id = r.user_id
   order by r.created_at desc
   limit least(greatest(coalesce(limit_n, 100), 1), 500);
$$;

revoke all on function public.admin_overview()                      from public, anon, authenticated;
revoke all on function public.admin_user_stats()                    from public, anon, authenticated;
revoke all on function public.admin_recent_events(text, integer)    from public, anon, authenticated;
revoke all on function public.admin_recent_gmail(integer)           from public, anon, authenticated;
grant execute on function public.admin_overview()                   to service_role;
grant execute on function public.admin_user_stats()                 to service_role;
grant execute on function public.admin_recent_events(text, integer) to service_role;
grant execute on function public.admin_recent_gmail(integer)        to service_role;

-- ---------------------------------------------------------------------
-- 7. MAKE YOURSELF AN ADMIN (run this separately, with YOUR login email)
-- ---------------------------------------------------------------------
-- insert into public.app_admins (user_id, note)
-- select id, 'owner' from auth.users where email = 'you@example.com'
-- on conflict (user_id) do nothing;


-- ####################################################################
-- ## PART 9 of 9: v8_schema.sql
-- ####################################################################

-- =====================================================================
-- v8 schema: follow-ups and client upsell ideas.
-- Run in the Supabase SQL Editor AFTER v7_schema.sql.
-- Safe to re-run. Adds columns only - nothing is deleted or changed.
-- =====================================================================

-- v8 builds on v7. If v7_schema.sql has not been run yet, stop here with a plain message
-- (nothing below is applied) instead of failing halfway with "relation does not exist".
do $$
begin
  if to_regclass('public.gmail_responses') is null then
    raise exception 'Run supabase/v7_schema.sql first (it creates the Gmail response log this file adds to), then run v8_schema.sql again.';
  end if;
end $$;

-- Follow-up emails sent to a lead, newest last:
--   [{ "sent_at": "...", "subject": "...", "body": "...", "thread_id": "...", "message_id": "..." }]
-- Written only by the send-email function. The ORIGINAL email stays in
-- sent_subject / sent_body, untouched, so Insights keeps the wording that
-- first went out.
alter table public.outcomes
  add column if not exists follow_ups jsonb not null default '[]'::jsonb;

-- AI upsell / cross-sell ideas saved for a client, so they are not paid for
-- again every time the Clients tab is opened.
alter table public.outcomes
  add column if not exists upsell_ideas jsonb,
  add column if not exists upsell_at    timestamptz;

-- Tells a follow-up apart from a first email in the Gmail response log.
alter table public.gmail_responses
  add column if not exists purpose text not null default 'first';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gmail_responses_purpose_check') then
    alter table public.gmail_responses
      add constraint gmail_responses_purpose_check check (purpose in ('first', 'followup'));
  end if;
end $$;

-- The Sent tab asks "which of my leads have a successful send?" - keep that quick.
create index if not exists gmail_responses_user_kind_idx
  on public.gmail_responses (user_id, kind, ok, created_at desc);


-- ####################################################################
-- ## LAST STEP (run separately, once): make yourself the administrator
-- ## Replace you@example.com with the email you sign in to the tool with.
-- ####################################################################
-- insert into public.app_admins (user_id, note)
-- select id, 'owner' from auth.users where email = 'you@example.com'
-- on conflict (user_id) do nothing;
