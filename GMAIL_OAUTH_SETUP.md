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

10. **Email Draft** tab → **Connect Gmail to send** → approve on Google's screen.
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

## "Gmail stopped working after a week" (the 7-day expiry)

While the Google app's publishing status is **Testing**, Google
automatically expires each saved Gmail permission after **7 days**. Sends
then fail with *"Your Gmail connection has expired or was revoked"* and the
Service check shows Gmail in red. (An older copy of the `send-email`
function shows Google's raw words instead — *Could not refresh Google access
token … "invalid_grant"*. Same cause, same fix; deploying the current functions
just makes the message clearer.) The fix for one user is quick: on **Email
Draft**, press **Disconnect Gmail**, then **Connect Gmail to send**, and approve.
Nothing is lost and nothing was sent while it was broken. That is fine for you while testing,
but not for a paying client. For a handoff, pick one of these:

- **Client has Google Workspace (a company domain):** create the Google
  Cloud project inside their Workspace and set the Audience to
  **Internal**. Internal apps are not subject to the 7-day limit and need
  no verification.
- **Client uses ordinary Gmail:** in Google Auth Platform → Audience, move
  the app from *Testing* to **In production**. This removes the 7-day
  limit. Google may require its verification process for the
  `gmail.send` scope (it needs a privacy-policy page and a homepage);
  until verified, the consent screen still shows the "unverified" warning
  and the app is limited to 100 users — more than enough for one client.
  Check Google's current verification requirements before you promise a
  date, as they change.

Whichever you choose, do it **before** the client's go-live, then connect
their Gmail once from the finished setup.
