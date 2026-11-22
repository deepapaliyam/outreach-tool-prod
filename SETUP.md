# Outreach Tool — setup & update guide

This folder is the complete, current project. To update an existing
install, extract it over your folder (your `.env` and `node_modules`
aren't in the zip, so they stay as they are).

---

## A. Updating an install you already have running

> **Make sure every change lands in the right Supabase project.**
> Your live app talks to exactly one project: the one in its
> `VITE_SUPABASE_URL` (Vercel → your project → Settings → Environment
> Variables). Its first part, 20 letters like `abcdefghijklmnopqrst`, is the
> **project reference**. Three things must all go to that project: the **SQL**
> (open that project in the Supabase dashboard before pasting — check the
> reference in the address bar), the **functions**, and the **secrets**.
> The Supabase command-line tool silently uses whichever project this folder
> was last "linked" to, which is how a deploy ends up in the wrong place. So
> the commands below always name the project:
> `npm run deploy:functions -- YOUR-REF` (add `--dry-run` to preview).
> Without `YOUR-REF` it reads `VITE_SUPABASE_URL` from your `.env` file.

Do these in order. Anything you've already done is harmless to repeat.

1. **SQL (new this version) — the simple way.** Supabase → SQL Editor → New
   query → paste the whole of **`supabase/00_run_everything.sql`** → Run. It
   runs every setup file (the original ones, v7 and v8) in the right order, adds
   only what is missing, keeps all your leads and outcomes, and is safe to run
   again. Supabase may ask you to confirm because the file has "drop policy"
   lines; that only refreshes access rules, so confirm. Then, once, make
   yourself administrator (the SQL is at the very end of that file, and in
   step 2 of the v7 box below).
   *Prefer one file at a time?* v8 needs v7, and v7 needs the original setup
   files: `schema` → `gmail_schema` → `snapshot_schema` → `sender_profile_schema`
   → `test_mode_schema` → `send_safety_schema` → `web_findings_schema` →
   `v7_schema` → `v8_schema`. Running one too early stops with a plain message
   ("Run supabase/v7_schema.sql first" or "Some earlier setup files have not
   been run yet") and changes nothing. The older wording was *relation
   "public.gmail_responses" does not exist* or *relation "public.sender_profiles"
   does not exist* — the same thing: an earlier file was skipped.
2. **Deploy the functions** (run in the project folder). Two of them changed —
   `draft` (follow-ups and client ideas) and `send-email` (the "already
   emailed" and follow-up rules, and a clearer Gmail-reconnect message) — and
   deploying all eight together keeps them in step:
   ```
   npm run deploy:functions -- YOUR-REF
   ```
   Replace `YOUR-REF` with your project reference (see the box above). The
   command prints which project it is deploying to — read that line — and
   says so if the folder had been linked to a different one. It runs the
   eight `npx supabase functions deploy … --project-ref YOUR-REF` lines
   (`health-check` with `--no-verify-jwt`, deliberately — see "Keeping it
   running"). Afterwards open Supabase → **Edge Functions** and check that
   *Last updated* for `send-email` and `draft` shows today. **If it still
   shows an old date, the old code is still running** — that is the usual
   reason a fix "didn't work". The Admin tab checks this for you: if it says
   *"Your Supabase project is running, but the "admin" function did not
   answer"*, the function is not deployed — run the command again and make
   sure it finishes without an error. If it says *"Could not reach Supabase
   at all"*, check your internet, then open supabase.com/dashboard and click
   **Restore project** (free projects pause after a week without activity).
3. **Reconnect Gmail** (needed if sends stopped with *invalid_grant* or
   *"Your Gmail connection has expired"*). Email Draft → **Disconnect Gmail**,
   then **Connect Gmail to send**, and approve. Google expires the permission
   every 7 days while your Google app is in *Testing* mode (see "Keeping it
   running"), so this is the whole fix; nothing is lost and nothing was sent
   while it was broken. Then **Admin → Service check** should show Gmail green.
   If instead the error says *"missing the permission to send email"*
   (Google's *insufficient authentication scopes*), the connection was made
   without the send permission: in Google Cloud, make sure the **Gmail API**
   is enabled and `gmail.send` is listed under **Data Access**
   (`GMAIL_OAUTH_SETUP.md`, steps 2 and 5), then Disconnect, Connect again
   and tick the box that lets the app send email.
4. **Frontend** — replace the files, then
   `git add . && git commit -m "Sent and Clients tabs, follow-ups" && git push`.
   Vercel redeploys on its own.
5. **Try it** — everything below is safe while **Test mode** is on:
   - **Sent** and **Clients** now appear in the sidebar. Anyone you have already
     emailed moves to **Sent** and disappears from the **Email Draft** queue.
   - Email Draft → **Start spaced send** now skips everyone already sent and
     says how many it left out.
   - In **Sent**, open a lead that was emailed at least 3 days ago and press
     **Suggest a follow-up**. In test mode the follow-up goes to *you*.

**What changed in v8**

- **A lead that has been emailed is never offered for sending again.** It leaves
  the Email Draft queue and the spaced-batch list, and the server refuses a
  second first-email to the same lead even from an out-of-date screen. Test
  emails to yourself don't count as "sent" — but a test batch now skips leads
  that already had a test, so it moves down the list instead of repeating the
  same ones.
- **New Sent tab** — everyone you have emailed. A **Last 1 day / 1 week / 1 month
  / All time** switch sits at the top, with the **Latest reached out** table
  directly under it (newest first). Below that, four sections: **Awaiting
  reply**, **Replied & in progress**, **No response** and **Declined**, so
  declined and silent leads are kept apart and never chased by mistake.
  Click anyone to read the email you sent, record what happened (*They
  replied*, *Not interested* with a reason, *Give up — no response*, *Reopen*),
  or write a follow-up.
- **Follow-ups** are suggested only when they make sense, and nothing is sent
  until you press Send:
  - at least **3 days** after your last email to that person, and at most **2**
    follow-ups per lead;
  - never to someone who replied, became a client or said no;
  - written from your first email, as a short polite nudge ("Re: <first subject>");
  - optionally (the box is ticked by default) the tool first **re-checks their
    website and listings live** (one search) and mentions a change only if it
    found one — an unchanged or worse result is shown to you but never put in
    the email;
  - it goes into the **same Gmail conversation** as the first email, so you see
    them together in your own Gmail. Whether the *recipient's* mail app also
    joins them depends on that app (see Known limits).
- **New Clients tab** — leads you marked *Converted to a client*, with what each
  paid, a warning to settle payment before pitching more, free **upsell /
  cross-sell** prompts based on what the tool actually knows (no website
  listing, a free-mail address…), and **Suggest ideas**: the AI writes ideas for
  that client from your offer, their web check and your notes. It costs one AI
  call and the result is saved, so reopening the tab costs nothing.
- **New home screen (Upload & Prioritize).** A stat bar on top counts leads
  added today / this week (since Monday) / this month (since the 1st), leads
  actioned (emailed) and leads pending action; click a number to filter the
  table to it. Upload, Prioritization settings and "Why this lead?" are three
  compact cards in one row, and the ranked table is full width below. The
  table is sorted by the day a lead was added (newest first) and, inside a day,
  by score, with a heading row per day. New filters: **Date added**, **Status**
  (all / pending / actioned) and **Sort** (newest-then-score, or best score only).
  No database change — it uses the date each lead was saved.
- **Deploys can no longer land in the wrong project.** `npm run deploy:functions`
  now names the project itself (from what you type or your `.env`), prints which one it is
  using, and warns if the folder was linked to a different project.
- **Admin tab tells "not deployed" from "paused".** When the server can't be
  reached it asks Supabase itself whether the project is awake, and shows only the fix that applies.
- **Clearer Gmail-reconnect messages.** Google's raw *invalid_grant* and
  *insufficient authentication scopes* texts are replaced by plain steps in
  the screen, even before the new functions are deployed.

**Assumptions I made — change them if they're wrong**

- *No response* means 7 days with no reply and no follow-up since. You can
  change it in the Sent tab (3, 5, 7, 10 or 14 days). The tool can't read your
  inbox, so a lead only counts as *Replied* when **you** press *They replied*.
- The **Sent** tab opens on **Last 1 week**, and remembers your choice.
- Follow-up limits (3 days, 2 follow-ups) are enforced by the server.

**Coming from before v7?** If you used `00_run_everything.sql` above, the SQL part is already done; do the rest of these (administrator, functions, frontend), then the v8 steps above.

1. **SQL.** Supabase → SQL Editor → paste and run
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
   npm run deploy:functions -- YOUR-REF
   ```
   That deploys all eight to the project you name (`health-check` gets
   `--no-verify-jwt`). The `--no-verify-jwt` on `health-check` is deliberate: that function
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

**What changed in v7**

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

1. **Supabase project** → SQL Editor → paste and run the one file
   **`supabase/00_run_everything.sql`** (it contains every setup file, in order),
   then make yourself the administrator with the SQL at the end of that file.
   (Or run these one at a time, in this order: `schema.sql` → `gmail_schema.sql` →
   `snapshot_schema.sql` → `sender_profile_schema.sql` → `test_mode_schema.sql` →
   `send_safety_schema.sql` → `web_findings_schema.sql` → `v7_schema.sql` →
   `v8_schema.sql`.)
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
4. **Secrets and functions** (run inside the project folder). Every command
   names the project with `--project-ref YOUR-REF`, so it cannot land in
   another one:
   ```
   npx supabase login
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref YOUR-REF
   npx supabase secrets set GOOGLE_CLIENT_ID=... --project-ref YOUR-REF
   npx supabase secrets set GOOGLE_CLIENT_SECRET=... --project-ref YOUR-REF
   npx supabase secrets set SERPER_API_KEY=... --project-ref YOUR-REF
   # optional:
   #   ANTHROPIC_MODEL=...        (override the AI model without redeploying)
   #   HEALTH_CHECK_TOKEN=...     (lets a monitor call health-check; see "Keeping it running")

   npm run deploy:functions -- YOUR-REF
   ```
   To see which secrets a project has (names only, never values):
   `npx supabase secrets list --project-ref YOUR-REF`.
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
   `npx supabase secrets set HEALTH_CHECK_TOKEN=your-long-random-text --project-ref YOUR-REF`
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
     on several new entities);
  4. **a lead is emailed once** — a second *first* email to a lead that was
     already sent is refused (follow-ups are the way to write again);
  5. **follow-ups**: at least 3 days after your last email to that lead, at
     most 2 per lead, and never to a lead that replied or said no. Follow-ups
     skip the same-address rule (it's the same conversation) but still count
     toward the daily limit and the 2-minute gap.
  Test sends to yourself and Gmail drafts don't count toward these limits
  (Gmail's answer to them is still recorded, so you can see it), and a test
  follow-up records nothing against the lead.
- **Spaced batch send** waits at least 3 minutes between emails (default
  5), trims itself to what's left of today's limit, skips leads that were
  already emailed (and, in test mode, leads that already had a test), and
  stops on any real error instead of pushing on.
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
- **Replies are not detected.** The tool only has permission to *send* from
  your Gmail, not to read it, so it can't see replies or bounces. *Replied*,
  *Declined* and *No response* come from what you record (and, for no response,
  from the days that have passed). Reading your inbox would need Google's full
  security review for a published app; it isn't built.
- **Follow-up threading.** A follow-up is placed in the same Gmail
  conversation (and titled "Re: …"), but because the tool can't read the
  first email's hidden message ID, the *recipient's* mail app may show it as a
  separate message. The words still make sense on their own.
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
