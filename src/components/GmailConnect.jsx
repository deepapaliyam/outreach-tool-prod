import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { functionUrl } from '../lib/functionUrl';

// Sits on the Drafts tab. Lets an already-logged-in (email/password) user
// additionally link their Google identity, requesting Gmail-send scope,
// then captures the one-time refresh token and hands it to the
// gmail-store-token function to persist server-side.
//
// Also checks REAL linked state on mount (not just "did a fresh OAuth
// redirect just happen") and offers a Disconnect action — Supabase
// refuses to re-run linkIdentity() while an identity is already linked,
// so if the very first grant happened before Manual Linking was turned
// on (and so came back missing scopes), disconnecting is the only way
// to force Google to show a genuinely fresh consent screen.
export default function GmailConnect() {
  const [connected, setConnected] = useState(null); // null = checking
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const checkLinked = async () => {
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      setConnected((data?.identities || []).some(i => i.provider === 'google'));
    } catch (e) {
      setConnected(false);
    }
  };

  useEffect(() => {
    checkLinked();
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

  const disconnect = async () => {
    if (!window.confirm('Disconnect Gmail? You\'ll need to reconnect (and re-approve permissions) before sending again.')) return;
    setBusy(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      const googleIdentity = (data?.identities || []).find(i => i.provider === 'google');
      if (googleIdentity) {
        const { error: unlinkErr } = await supabase.auth.unlinkIdentity(googleIdentity);
        if (unlinkErr) throw unlinkErr;
      }
      setConnected(false);
    } catch (e) {
      setError('Disconnect failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (connected === null) {
    return <span className="hint">Checking Gmail connection…</span>;
  }

  if (connected) {
    return (
      <div className="row-inline">
        <span className="tag verified">Gmail connected</span>
        <button className="btn-tiny" onClick={disconnect} disabled={busy}>
          {busy ? 'Disconnecting…' : 'Disconnect (to fix permissions / reconnect fresh)'}
        </button>
        {error && <div className="status-line" style={{ color: '#B0361F' }}>{error}</div>}
      </div>
    );
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
