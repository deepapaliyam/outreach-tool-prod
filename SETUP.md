# Outreach Tool — consolidated project (current as of this handoff)

This folder is the complete, current state of everything built so far —
base app, Gmail sending, source citations, status pipeline, exports,
and selective rewrite. Replace your entire local folder's contents with
this rather than tracking individual files across the earlier separate
zips.

## Setup, start to finish

### 1. Database
In Supabase SQL Editor, run these files **in this order**:
1. `supabase/schema.sql`
2. `supabase/gmail_schema.sql`
3. `supabase/snapshot_schema.sql`
4. `supabase/sender_profile_schema.sql`

(All use `create table if not exists` / `add column if not exists`, so
re-running any of these is always safe.)

### 2. Local config
```
cp .env.example .env
```
Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase →
Settings → API).

### 3. Install
```
npm install
```

### 4. Google Cloud + Supabase Google provider
Follow `GMAIL_OAUTH_SETUP.md` in full (Google Cloud Console OAuth
consent screen + credentials, enabling the Google provider in Supabase,
setting `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` secrets). Do this once.

### 5. Secrets and function deploys
```
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key
npx supabase secrets set GOOGLE_CLIENT_ID=your-client-id
npx supabase secrets set GOOGLE_CLIENT_SECRET=your-client-secret

npx supabase functions deploy draft
npx supabase functions deploy send-email
npx supabase functions deploy gmail-store-token
npx supabase functions deploy refine-selection
npx supabase functions deploy fetch-references
```

### 6. Run it
```
npm run dev
```

## Hosting-ready architecture note
Every Supabase Function call (`draft`, `send-email`, `gmail-store-token`,
`refine-selection`, `fetch-references`) goes through `src/lib/functionUrl.js`,
which builds an absolute URL from `VITE_SUPABASE_URL` — not a relative
`/api/...` path. This means the exact same code works identically in
`npm run dev` and in a production build on any host; there's no
dev-server-only proxy to keep in sync with hosting config.

## What this version can do
- Upload a daily `.xlsx`, dedupe director-rows to businesses, score by
  need/reachability/region — transparent, inspectable ("Why?" on every
  row).
- Generate drafts on demand (single or capped batch), each with an
  evaluation, cited sources, and a subject/body.
- **Edit drafts**: hand-type changes, or highlight a phrase and rewrite
  just that part with an optional instruction.
- **Send via Gmail** (OAuth, your own account or a test-user client's)
  or mark as sent manually — either way, the exact sent wording is
  snapshotted immutably for insights.
- **Voice/tone profile** (per account, in Supabase): tone, a writing
  sample, and reference links the app fetches and caches server-side so
  drafts can cite your own portfolio/case studies by URL.
- Track outcomes for **every** lead (not just contacted ones), shown as
  a full table with a computed pipeline status badge — Not contacted →
  Drafted → Contacted → Replied → Proposal sent → **Client** →
  **Client (Paid)** — a converted lead is explicitly categorized as a
  client throughout the app.
- **Insights**, filterable by industry/state/date range: summary stats
  (leads, contacted, clients, revenue, avg deal size), a status
  breakdown chart, reply rate by industry/score band, a conversion
  funnel, pricing patterns, and a full client list.
- **Export**: the prioritized list and outcomes as CSV or Excel (the
  Excel "Outcomes" sheet includes every lead with an Entity ID, so it's
  designed to be edited and re-uploaded); Insights as Excel, PDF,
  PowerPoint, or Word.
- **Import outcomes**: re-upload an edited "Outcomes" sheet (from this
  tool's own export) on the Track Outcomes tab to bulk-update statuses,
  matched by Entity ID.
- Pagination (100 at a time) on both the Upload and Track Outcomes
  tables.

## Round 5 — what's new, and an honest scoping note
This round added the Insights exports (Excel/PDF/PPT/Word), richer
Insights content and filters, the outcomes import/export round-trip,
the full-table Track Outcomes view, and "Client" categorization.

**Deliberate scope limit:** the four Insights export formats contain
data tables, not the on-screen chart images themselves. Capturing the
rendered recharts SVGs as embedded images (via a library like
html2canvas) is a real, addable enhancement — but it's the one part of
this feature that genuinely needs a live browser to verify correctly,
which wasn't available while building this. Every other part of this
round — the insights math and all four file formats — was independently
tested with real data before being handed over: the insights
aggregation was checked by hand against synthetic data, and each export
format was run through its actual library calls to confirm a valid
file comes out the other end.

## Still ahead (not in this build yet)
Brand white-labeling per client (name/colors/font). Embedding chart
images in exports, if wanted, once you can confirm it renders correctly
in your actual browser.
