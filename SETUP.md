# Outreach Tool — setup & update guide

This folder is the complete, current project. To update an existing
install, extract it over your folder (your `.env` and `node_modules`
aren't in the zip, so they stay as they are).

---

## A. Updating an install you already have running

Do these in order. Anything you've already done is harmless to repeat.

1. **SQL (new this version).** Supabase → SQL Editor → paste and run
   `supabase/v7_schema.sql`. It is safe to run twice. It adds the profile
   and signature columns, the hidden-admin list, the error/usage log, the
   Gmail response log and the logo storage bucket.
2. **Make yourself the administrator.** Still in the SQL Editor, run this
   once with *your own login email* (the one you sign in to the tool with):
   ```
   insert into public.app_admins (user_id, note)
   select id, 'owner' from auth.users where email = 'you@example.com'
   on conflict (user_id) do nothing;
   ```
   Only this SQL editor can add or remove administrators. There is no
   button for it anywhere in the app, so nobody can promote themselves.
3. **Deploy the functions** (run in the project folder):
   ```
   npx supabase functions deploy draft
   npx supabase functions deploy refine-selection
   npx supabase functions deploy enrich-lead
   npx supabase functions deploy send-email
   npx supabase functions deploy admin
   npx supabase functions deploy health-check --no-verify-jwt
   ```
   The `--no-verify-jwt` on `health-check` is deliberate: that function
   checks the sign-in itself, which is what lets an uptime monitor call it
   (see "Keeping it running"). Use it exactly as written. The new `admin`
   function is deployed normally.
4. **Frontend** — replace the files, then
   `git add . && git commit -m "New design, profile and signature, admin tab" && git push`.
   Vercel redeploys on its own. (Run `npm install` first if you run it
   locally: the signature editor adds two small packages.)
5. **Try it:**
   - Open the app. The sidebar now has **Upload & Prioritize**, **Email Draft**,
     **Track Outcomes**, **Insights**, and under *Account* **Profile & Settings**
     plus **Admin** (you only — nobody else sees it).
   - **Profile & Settings** → fill in your name and what you offer (your old
     details carried over), then build your signature and press **Save changes**.
     **Send me a test email** shows exactly how it looks in a real inbox.
   - **Admin → Service check → Run service check.** Every line should be
     green. Anything red says what to fix.

**What changed in this version**

- **New look**, following your Figma prototype: dark sidebar, cards, score pills.
- **Drafts is now "Email Draft".** Your name, title, business details, writing
  tone and writing sample moved out of it into **Profile & Settings**, so the
  drafting screen is only for reviewing and sending.
- **Profile & Settings** holds name, title, phone, contact email, business
  name and website, business information, preferred tone, a sample of your own
  writing, portfolio and social links, and a **rich-text email signature**
  (bold, colours, links, logo upload, a "Build from my details" starter).
  The signature is sent as a real styled HTML email, with a plain-text copy
  for mail programs that need one.
- **Hidden Admin tab** (administrators only): server and API health, an error
  log, usage per user (AI calls and tokens, web searches, emails sent), and
  every Gmail response. Ordinary users never see the tab, and the server
  refuses every admin request from anyone not on the list. When an API key or
  credit problem happens, ordinary users now see a neutral "recorded for your
  administrator" message; you see the full instruction.
- **Gmail's answer is captured** for every send, test send and Gmail draft:
  message ID, thread ID, labels — or the exact reason Gmail refused. It shows
  under the email you are working on, in a "Gmail responses" table, and on
  Track Outcomes.
- Security fix: drafting and rewriting now require a real sign-in (before, an
  anonymous caller with your project's public key could have used them).
- Everything from the previous version stays: clear key/credit errors, batches
  that stop at the first setup problem, and the Service check (now in Admin).

---

## B. Fresh install, start to finish

1. **Supabase project** → SQL Editor, run in this order:
   `schema.sql` → `gmail_schema.sql` → `snapshot_schema.sql` →
   `sender_profile_schema.sql` → `test_mode_schema.sql` → `send_safety_schema.sql` →
   `web_findings_schema.sql` → `v7_schema.sql`, then make yourself the
   administrator with the SQL in section A, step 2.
2. **Supabase dashboard settings** (one-time, all off by default):
   - Authentication → Providers → **Email** → turn **Confirm email OFF**
     (password sign-up must work without a mail server).
   - Authentication → Providers → **Google** → enable, paste the
     Client ID/Secret from `GMAIL_OAUTH_SETUP.md`.
   - **Enable manual linking** (Supabase calls it "Allow / Enable manual
     linking"; search the Authentication section for it — Supabase moves
     it around). Without it, "Connect Gmail" fails with *"Manual linking
     is disabled"*.
   - Authentication → URL Configuration → set **Site URL** to your live
     app URL and add it under **Redirect URLs** with `/**` on the end.
3. **Google Cloud** — follow `GMAIL_OAUTH_SETUP.md`.
4. **Secrets and functions** (run inside the project folder, linked to the
   right project with `npx supabase link --project-ref YOUR-REF`):
   ```
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase secrets set GOOGLE_CLIENT_ID=...
   npx supabase secrets set GOOGLE_CLIENT_SECRET=...
   npx supabase secrets set SERPER_API_KEY=...
   # optional:
   #   ANTHROPIC_MODEL=...        (override the AI model without redeploying)
   #   HEALTH_CHECK_TOKEN=...     (lets a monitor call health-check; see "Keeping it running")

   npx supabase functions deploy draft
   npx supabase functions deploy send-email
   npx supabase functions deploy gmail-store-token
   npx supabase functions deploy refine-selection
   npx supabase functions deploy fetch-references
   npx supabase functions deploy enrich-lead
   npx supabase functions deploy admin
   npx supabase functions deploy health-check --no-verify-jwt
   ```
   Check Supabase → Edge Functions afterwards: all eight should be listed.
   (An empty list is why drafts fail with "Failed to fetch".)
5. **Local run:** copy `.env.example` to `.env` (a real file named
   exactly `.env`), fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Supabase → Settings → API), then
   `npm install` and `npm run dev`.
6. **Hosting (Vercel):** push to GitHub, import the repo, add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment
   variables **of type Config** (they're public by design — the
   anon key is protected by row-level security). If the live site is a
   blank page with *"supabaseUrl is required"* in the console, delete
   both variables, re-add them as Config, and redeploy — that is what
   fixed it for us. Vercel's free Hobby plan is for non-commercial use;
   move to Pro once this is running for a paying client.

---

## Keeping it running (read this before you sell it)

The tool depends on five outside things. Each can stop working, and each
has a known fix (some are free set-up, some are a paid plan).

| What | How it fails | Make it not fail |
|---|---|---|
| **Anthropic key** (`ANTHROPIC_API_KEY`) | Expired → "invalid x-api-key". An expiry date is chosen when the key is created and can't be changed later. | Create the key with **Expiration: Never**. Keep it only as a Supabase secret. For each client, use *their* Anthropic account so nothing is shared. |
| **Anthropic credit** | Prepaid credit runs out, or a spending limit is hit → drafting stops. Purchased credit also **lapses one year after purchase**. | Billing page → turn on **auto-reload**. Separately set a monthly spend limit in the Console's limits settings so a bug can't run up a bill. Don't buy a year's credit in one go. |
| **Serper key / credits** | The free starter credits are a one-time allowance; once they run out, web checks fail. | Top up (or pick a paid plan) at serper.dev. The error says so plainly. |
| **Gmail permission** | Google expires it **every 7 days** while the Google app is in *Testing* mode. | Dedicated handoff: put the client's Google Cloud app through *publishing*/verification (see `GMAIL_OAUTH_SETUP.md`). Until then, Disconnect → Connect Gmail weekly. |
| **Supabase / Vercel plan** | A **free** Supabase project pauses itself after about a week of low activity (the app then shows "Failed to fetch"). Vercel's free tier is for non-commercial use. | Client projects: Supabase **Pro** (never pauses) and Vercel **Pro**. |

**Service check.** **Admin → Service check** tests the AI key, the search
key, the Google secrets, *your* Gmail connection and the database in one
click. When a draft or web check fails because of a setup problem, an
administrator sees a banner with a **Run service check** button that opens it
and runs it. It uses a few tokens of AI and one search credit, and sends no email.

**Know before the client does (monitoring).** The `health-check` function
can be called by a free scheduler or uptime monitor, with no login:

1. Choose a long random text and store it:
   `npx supabase secrets set HEALTH_CHECK_TOKEN=your-long-random-text`
2. Have a scheduler (n8n, which you already use, works) call
   `https://YOUR-PROJECT.supabase.co/functions/v1/health-check`
   every few hours with the header `x-monitor-token: your-long-random-text`.
3. It answers **200** when healthy and **503** when something has failed —
   make the scheduler email you on anything but 200. Add `?serper=1` to the
   address once a day to include the search key (it uses one credit).
4. Bonus: that regular call also stops a free Supabase project from pausing.

Monitor calls skip the per-user Gmail check (there's no user), so the 7-day
Gmail expiry is caught by the in-app Service check instead.

**Per-client checklist at handoff:** Anthropic key with Never expiry +
auto-reload + spend limit · Serper plan · Supabase Pro · Vercel Pro ·
Google app published (or the weekly reconnect explained in writing) ·
`HEALTH_CHECK_TOKEN` set and the monitor emailing you · a calendar reminder
for the date their purchased credit lapses.

## Profile & Settings, signature and Gmail responses

**Profile & Settings is per user.** Each person who signs in keeps their own
name, business details, tone, links and signature; nobody else can read them.
Drafting needs only a **name** and **what you offer**. Everything else
improves the draft and the signature.

**Portfolio links.** The first five are read once, when you save (not on every
draft), so the AI can mention real work. The page shows what it read. If a
page can't be read, your profile still saves, with a warning.

**Signature.** Once a signature is saved, drafts are written to end with just
a closing phrase ("Warm regards,") and the signature is added when the email
is sent, so your name is never repeated. Older drafts that already sign off by
name keep the signature switched off by default. You can switch it on or off
for each email ("Add my signature") and preview exactly what will be sent.
Logos are uploaded to your own public storage folder (PNG, JPG, GIF or WebP,
under 512 KB) because mail programs have to fetch them from the web. Only
safe formatting is kept (no scripts, no forms, only http/https links and
images); this is checked in the browser and again on the server when sent.
A signature that looks fine in the app can still look different in some mail
programs, so use **Send me a test email** after changing it.

**Gmail responses.** "Accepted" means Gmail took the message and gave it an
ID. It is **not proof of delivery**: if the address doesn't exist the bounce
arrives later as an email in your own inbox. Showing bounces and replies
inside the tool would need a larger Google permission (reading your mail),
which means Google's full security review for a published app. It isn't built.
Until then, record replies on **Track Outcomes**.

**The Admin tab** shows every user's usage and every Gmail response, so
tell your clients (in writing) that the administrator of the system can see
this operational data. It never shows email passwords or Gmail tokens.

## How sending stays safe

- **Test mode is ON by default**, per account. "Send via Gmail" then goes
  to your own inbox (subject prefixed `[TEST — would send to …]`) and
  never marks the lead as contacted. Turning it off needs a confirmation.
- **Save as Gmail draft** puts the email in your Gmail Drafts and sends
  nothing.
- For **real sends**, the server (not the browser, so a second tab or a
  refresh can't get around it) enforces:
  1. a **daily limit** — default 30, adjustable 1–100, counted over a
     rolling 24 hours;
  2. **at least 2 minutes** between sends;
  3. **the same address never twice in 30 days** (one director often sits
     on several new entities).
  Test sends to yourself and Gmail drafts don't count toward these limits
  (Gmail's answer to them is still recorded, so you can see it).
- **Spaced batch send** waits at least 3 minutes between emails (default
  5), trims itself to what's left of today's limit, skips already-emailed
  recipients, and stops on any real error instead of pushing on.
- If the limits can't be checked (e.g. the SQL wasn't run), real sends
  are **refused**, not allowed through.

## Web-presence check

**When it runs.** Automatically when you upload a list (untick "Check
automatically when I upload a list" to turn that off): every lead from
that file that has never been checked — and has no website status you
typed yourself — is checked, six at a time, updating the table live.
Nothing else is re-checked unless you press **Re-check** (per lead, or
"Re-check web presence" for the top N by score).

**What it does per lead.** Two things at the same time: (1) for a
custom-domain company email, a free direct check of that domain (reads
its page title and description, and spots placeholder / parked pages);
(2) one Google search via Serper.dev (~$0.001) for the exact business
name — "Private Limited" removed — plus district and state.

**What you can see (Why? on Upload & Prioritize, or the Lead score & web check section of Email Draft).** The search used, the
website found and why, name-matched listings (Justdial, IndiaMART,
Facebook…), Google Business results, other results (context only), and
which company-registration directories were ignored (falconebiz,
zaubacorp…). Every item links to its source.

**How much it's trusted.** Only a website on the company's **own email
domain** counts as confirmed. A search hit is labelled "Possible match —
not verified", because business names collide constantly.

**How drafts use it.** Drafts (and selective rewrites) are handed only
confirmed facts and name-matched listings. A "possible" site, unmatched
listings and other results are never passed to the model, and a
search-based "not found" is never presented as a fact about the business.
If the web check is newer than a draft, the draft shows a "Regenerate"
hint.

## Known limits (worth knowing before you promise anything)

- **One Gmail per account.** No mailbox rotation, so ~30–50 real sends a
  day is the honest ceiling per user.
- **Spaced send runs in the browser tab.** Closing the tab or letting the
  computer sleep stops it (emails already sent stay recorded; just start
  it again for the rest).
- **Everything shares your Anthropic and Serper keys** on a shared
  instance — a dedicated deployment per client (their own keys) avoids
  that, and means one client's expired key or empty credit can't affect another.
- **Several administrators** all see all users' usage. On a dedicated
  deployment there is normally one user, so this only matters on a shared one.
- Insights exports contain data tables, not the on-screen chart images.
- Brand white-labelling (name/colours per client) isn't built yet.
