# Outreach Tool — setup & update guide

This folder is the complete, current project. To update an existing
install, extract it over your folder (your `.env` and `node_modules`
aren't in the zip, so they stay as they are).

---

## A. Updating an install you already have running

Do these in order. Anything you've already done is harmless to repeat.

1. **SQL** — Supabase → SQL Editor, run (each is safe to re-run):
   - `supabase/test_mode_schema.sql` *(if you haven't already)*
   - `supabase/send_safety_schema.sql` **(new — send limits)**
2. **Secret** — needed for the web-presence check:
   `npx supabase secrets set SERPER_API_KEY=your-key`
   (free key with 2,500 searches at serper.dev)
3. **Deploy the two changed functions:**
   ```
   npx supabase functions deploy send-email
   npx supabase functions deploy enrich-lead
   ```
4. **Frontend** — replace the files, then `git add . && git commit -m "Send safety + web enrichment" && git push`. Vercel redeploys on its own.
5. In the app: Drafts tab → check the **Daily safe-send limit** field and click **Save profile**.

---

## B. Fresh install, start to finish

1. **Supabase project** → SQL Editor, run in this order:
   `schema.sql` → `gmail_schema.sql` → `snapshot_schema.sql` →
   `sender_profile_schema.sql` → `test_mode_schema.sql` → `send_safety_schema.sql`
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

   npx supabase functions deploy draft
   npx supabase functions deploy send-email
   npx supabase functions deploy gmail-store-token
   npx supabase functions deploy refine-selection
   npx supabase functions deploy fetch-references
   npx supabase functions deploy enrich-lead
   ```
   Check Supabase → Edge Functions afterwards: all six should be listed.
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
  Test sends to yourself and drafts don't count and aren't logged.
- **Spaced batch send** waits at least 3 minutes between emails (default
  5), trims itself to what's left of today's limit, skips already-emailed
  recipients, and stops on any real error instead of pushing on.
- If the limits can't be checked (e.g. the SQL wasn't run), real sends
  are **refused**, not allowed through.

## Web-presence check ("Enrich")

Per lead, or for the top N un-checked leads. Custom-domain emails get a
free direct check; everyone else gets one Serper.dev search (about
$0.001). Company-registration mirror sites (falconebiz, indiafilings,
zaubacorp…) are never counted as a website; a search hit is labelled
**"Possible website found — verify"** because business names collide.
Results feed the score and the drafts automatically.

## Known limits (worth knowing before you promise anything)

- **One Gmail per account.** No mailbox rotation, so ~30–50 real sends a
  day is the honest ceiling per user.
- **Spaced send runs in the browser tab.** Closing the tab or letting the
  computer sleep stops it (emails already sent stay recorded; just start
  it again for the rest).
- **Everything shares your Anthropic and Serper keys** on a shared
  instance — a dedicated deployment per client (their own keys) avoids
  that.
- Insights exports contain data tables, not the on-screen chart images.
- Brand white-labelling (name/colours per client) isn't built yet.
