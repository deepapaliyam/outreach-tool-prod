# Gmail sending — Google Cloud and Supabase setup (one time, ~15 min)

Google reorganised this console: what used to be one "OAuth consent
screen" wizard is now **Google Auth Platform** with separate sections
(Branding, Audience, Data Access, Clients). The steps below match that.

## A. Google Cloud Console

1. console.cloud.google.com → create a project (e.g. "outreach-tool").
2. **APIs & Services → Library → Gmail API → Enable.**
3. **Google Auth Platform → Branding:** app name, support email, developer
   contact. (The app name is only what people see on the consent screen.)
4. **Audience:** user type **External**; leave publishing status on
   **Testing** (don't publish). Under **Test users**, add every Gmail
   address that will connect — yours, and each client's *before* they
   try. Anyone not listed is blocked by Google at the consent screen.
5. **Data Access → Add or remove scopes:** add
   `https://www.googleapis.com/auth/gmail.send` and save.
6. **Clients → Create client:** type **Web application**. Under
   **Authorized redirect URIs** add
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
   (One client can serve several Supabase projects — just add each
   project's callback URL.) Copy the **Client ID** and **Client secret**
   (the secret is shown once).

## B. Supabase

7. Authentication → Providers → **Google** → enable → paste the Client ID
   and secret → Save.
8. **Enable manual linking** (Authentication section; off by default).
   Users sign up with email + password and *then* link Google, which is
   "manual linking" — without it the button fails with *"Manual linking
   is disabled"*.
9. Store the same credentials for the functions:
   ```
   npx supabase secrets set GOOGLE_CLIENT_ID=...
   npx supabase secrets set GOOGLE_CLIENT_SECRET=...
   npx supabase functions deploy gmail-store-token
   npx supabase functions deploy send-email
   ```

## C. Connecting inside the app

10. Drafts tab → **Connect Gmail to send** → approve on Google's screen.
    It will say the app is "unverified" — expected in Testing mode
    (Advanced → continue). Check the consent screen lists sending email
    on your behalf before approving.
11. If sending later fails with *"insufficient authentication scopes"*,
    the connection was made without the send permission. Click
    **Disconnect** next to "Gmail connected", then connect again and
    approve the Gmail permission. (Supabase won't re-run the flow while
    an identity is already linked, which is why Disconnect exists.)

## Handing over to a client

For a dedicated deployment, create the Google Cloud project under the
client's own Google account and use their Client ID/secret, so their
sending identity and app registration are entirely theirs.
