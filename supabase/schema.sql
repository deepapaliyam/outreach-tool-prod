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
