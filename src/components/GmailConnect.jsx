import React, { useState, useEffect, useCallback } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from './ui';

// The connection half of the Gmail card on the Email Draft page. Lets an
// already-logged-in (email/password) user additionally link their Google
// identity, requesting Gmail-send scope. The one-time refresh token that
// comes back after the redirect is stored by lib/gmailToken.js, called from
// the sign-in gate, so it is captured whichever page the browser lands on.
//
// It also checks the REAL linked state on mount and offers a Disconnect
// action — Supabase refuses to re-run linkIdentity() while an identity is
// already linked, so if the very first grant came back missing scopes,
// disconnecting is the only way to force a genuinely fresh consent screen.
export const RETURN_TAB_KEY = 'outreach.returnTab';

export default function GmailConnect({ address }) {
  const [connected, setConnected] = useState(null); // null = checking
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const checkLinked = useCallback(async () => {
    try {
      const { data, error: e } = await supabase.auth.getUserIdentities();
      if (e) throw e;
      setConnected((data?.identities || []).some(i => i.provider === 'google'));
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    checkLinked();
    const onLinked = (ev) => {
      if (ev.detail && ev.detail.ok) { setError(''); checkLinked(); }
      else setError('Connected to Google, but saving the permission failed — try again.');
    };
    window.addEventListener('gmail-linked', onLinked);
    return () => window.removeEventListener('gmail-linked', onLinked);
  }, [checkLinked]);

  const connect = async () => {
    setBusy(true);
    setError('');
    try { sessionStorage.setItem(RETURN_TAB_KEY, 'drafts'); } catch { /* the app just opens on its first page */ }
    const { error: e } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/gmail.send',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (e) { setError(e.message); setBusy(false); }
    // on success, the browser redirects to Google, then back.
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Gmail? You\'ll need to reconnect (and re-approve permissions) before sending again.')) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: e } = await supabase.auth.getUserIdentities();
      if (e) throw e;
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

  return (
    <div className="row" style={{ gap: 14 }}>
      <div className="gmail-ico"><Mail size={19} /></div>
      <div>
        {connected === null && <div className="strong">Checking Gmail connection…</div>}
        {connected === true && (
          <>
            <div className="strong">Gmail connected <span className="tag ok" style={{ marginLeft: 6 }}>Active</span></div>
            <div className="small dim">{address || 'Your Google account'} ·{' '}
              <button className="btn link sm" style={{ padding: 0 }} onClick={disconnect} disabled={busy}
                title="Use this to fix permissions, or after Google has expired the connection">
                {busy ? 'Working…' : 'Disconnect Gmail'}
              </button>
            </div>
          </>
        )}
        {connected === false && (
          <>
            <div className="strong">Gmail not connected</div>
            <div className="small dim">Connect once so the tool can send from your own account.</div>
          </>
        )}
        {error && <div className="small" style={{ color: 'var(--bad)', marginTop: 4 }} role="alert">{error}</div>}
      </div>
      {connected === false && (
        <button className="btn primary" onClick={connect} disabled={busy}>
          {busy ? <><Spinner size={13} /> Connecting…</> : 'Connect Gmail to send'}
        </button>
      )}
    </div>
  );
}
