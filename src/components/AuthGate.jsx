import React, { useState, useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { storeGmailTokenFromSession } from '../lib/gmailToken';
import { Spinner, Notice } from './ui';
import { CSS } from '../styles';

// Email + password sign-in — no magic-link email required, so this works
// even before (or without) custom SMTP is configured. Requires "Confirm
// email" to be turned OFF in Supabase Dashboard -> Authentication ->
// Providers -> Email, so signUp() returns a usable session immediately.
//
// This gate is always mounted, so it is also where the Gmail permission that
// Google hands back after "Connect Gmail" is picked up and stored — whichever
// page the browser lands on after the redirect. Sign-out lives in the sidebar.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      storeGmailTokenFromSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      storeGmailTokenFromSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="auth"><style>{CSS}</style>
        <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Spinner size={16} /> Loading…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth"><style>{CSS}</style>
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-mark"><ArrowUpRight size={20} /></div>
            <div><div className="brand-name" style={{ color: 'var(--ink)' }}>Outreach Tool</div><div className="small faint">Lead prioritization &amp; outreach</div></div>
          </div>
          <h1>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
          <p className="muted small" style={{ margin: '0 0 18px' }}>
            {mode === 'signup' ? 'Use your work email. You can set up your business details after signing in.' : 'Welcome back — pick up where you left off.'}
          </p>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
            </div>
            {error && <div style={{ marginBottom: 12 }}><Notice tone="bad">{error}</Notice></div>}
            <button type="submit" className="btn primary" disabled={busy} style={{ width: '100%', padding: '10px 14px' }}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <div className="small" style={{ marginTop: 16, textAlign: 'center' }}>
            {mode === 'signin' ? (
              <>First time? <button className="btn link sm" onClick={() => { setMode('signup'); setError(''); }}>Create an account</button></>
            ) : (
              <>Already have an account? <button className="btn link sm" onClick={() => { setMode('signin'); setError(''); }}>Sign in</button></>
            )}
          </div>
        </div>
      </div>
    );
  }

  return children;
}
