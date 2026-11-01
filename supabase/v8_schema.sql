-- =====================================================================
-- v8 schema: follow-ups and client upsell ideas.
-- Run in the Supabase SQL Editor AFTER v7_schema.sql.
-- Safe to re-run. Adds columns only - nothing is deleted or changed.
-- =====================================================================

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
