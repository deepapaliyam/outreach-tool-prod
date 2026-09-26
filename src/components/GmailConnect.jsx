import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { functionUrl } from '../lib/functionUrl';

// Sits on the Drafts tab. Lets an already-logged-in (email/password) user
// additionally link their Google identity, requesting Gmail-send scope,
// then captures the one-time refresh token and hands it to the
// gmail-store-token function to persist server-side.
export default function GmailConnect() {
  const [connected, setConnected] = useState(null); // null = unknown yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // After the OAuth redirect back, Supabase briefly exposes
    // provider_refresh_token on the session — capture it once, then store it.
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      const anySession = session;
      if (anySession && anySession.provider_refresh_token && anySession.provider_token) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          await fetch(functionUrl('gmail-store-token'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${anySession.access_token}`,
            },
            body: JSON.stringify({
              refresh_token: anySession.provider_refresh_token,
              gmail_address: userData?.user?.email || null,
            }),
          });
          setConnected(true);
        } catch (e) {
          setError('Connected to Google, but saving the token failed — try again.');
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const connect = async () => {
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/gmail.send',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) { setError(error.message); setBusy(false); }
    // on success, the browser redirects to Google, then back — the
    // useEffect above picks up the token when it returns.
  };

  if (connected) {
    return <span className="tag verified">Gmail connected</span>;
  }
  return (
    <div>
      <button className="btn-ghost" onClick={connect} disabled={busy}>
        {busy ? 'Connecting…' : 'Connect Gmail to send'}
      </button>
      {error && <div className="status-line" style={{ color: '#B0361F' }}>{error}</div>}
    </div>
  );
}
