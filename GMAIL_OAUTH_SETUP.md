# Setting up Gmail sending (Google Cloud + Supabase dashboard)

This is the "console work" only you can click through — about 15 minutes.

## A. Google Cloud Console

1. Go to console.cloud.google.com, create a new project (any name, e.g.
   "outreach-tool").
2. **Enable the Gmail API**: left menu → APIs & Services → Library →
   search "Gmail API" → Enable.
3. **Configure the OAuth consent screen**: APIs & Services → OAuth
   consent screen.
   - User type: External (unless you have a Google Workspace org).
   - Fill in app name, your email, developer contact.
   - Scopes: add `.../auth/gmail.send`.
   - **Publishing status: leave as "Testing"** — this is the important
     part. In Testing, only pre-added test users can connect, but no
     Google review is required.
   - **Test users**: add your client's Gmail address here (and your own,
     for trying it yourself first). Up to 100 addresses.
4. **Create OAuth credentials**: APIs & Services → Credentials → Create
   Credentials → OAuth client ID.
   - Application type: Web application.
   - Authorized redirect URIs: add your Supabase callback URL —
     `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback`
     (same project-ref as everywhere else in this build).
   - Save. Copy the **Client ID** and **Client secret** shown.

## B. Supabase dashboard

5. **Enable Google as a provider**: Authentication → Providers → Google
   → toggle on → paste the Client ID and Client secret from step 4 →
   Save.
6. **Store the same secret for your Edge Function** (in your terminal,
   inside the project folder):
   ```
   npx supabase secrets set GOOGLE_CLIENT_ID=your-client-id
   npx supabase secrets set GOOGLE_CLIENT_SECRET=your-client-secret
   ```
7. **Deploy the two new functions**:
   ```
   npx supabase functions deploy gmail-store-token
   npx supabase functions deploy send-email
   ```

## C. Try it

8. Apply the three edits in `GMAIL_SETUP_PATCH.md`, run
   `supabase/gmail_schema.sql` in the SQL Editor, restart `npm run dev`.
9. Sign in with an email you added as a test user in step 3, open a
   drafted lead, click **"Connect Gmail to send."** Approve the Google
   consent screen (it will show an "unverified app" warning — expected
   in Testing mode; click **Advanced → Go to outreach-tool (unsafe)** to
   proceed. This warning is exactly what test-user status looks like,
   not a sign anything's wrong).
10. Click **Send via Gmail** on a draft. Check the "Sent" folder of that
    Gmail account to confirm it actually went out.

## When you're ready to onboard a client

Add their Gmail address as a test user (step 3) before they try to
connect — if their address isn't on that list, Google will block the
consent screen with an access-denied message. That's the one manual
step per new client until (if ever) you go through full verification.
