import { functionUrl } from './functionUrl';

// After "Connect Gmail", Google sends the browser back to the app and Supabase
// briefly holds the long-lived Gmail permission (provider_refresh_token) on
// the session. This stores it server-side, once. It is called from the
// always-present sign-in gate, so it works no matter which page the browser
// lands on after the redirect.
let storedFor = '';

export async function storeGmailTokenFromSession(session) {
  if (!session || !session.provider_refresh_token || !session.provider_token) return false;
  if (storedFor === session.provider_refresh_token) return false;
  storedFor = session.provider_refresh_token;
  try {
    const res = await fetch(functionUrl('gmail-store-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        refresh_token: session.provider_refresh_token,
        gmail_address: session.user?.email || null,
      }),
    });
    if (!res.ok) throw new Error('store failed');
    window.dispatchEvent(new CustomEvent('gmail-linked', { detail: { ok: true } }));
    return true;
  } catch {
    storedFor = '';
    window.dispatchEvent(new CustomEvent('gmail-linked', { detail: { ok: false } }));
    return false;
  }
}
