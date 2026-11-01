-- =====================================================================
-- v7 schema: profile & signature fields, hidden admin, event log,
-- Gmail response log, logo storage.
-- Run in the Supabase SQL Editor after the earlier schema files.
-- Safe to re-run.
-- =====================================================================

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
