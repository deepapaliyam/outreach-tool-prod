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
