import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Email + password sign-in — no magic-link email required, so this works
// even before (or without) custom SMTP is configured. Requires "Confirm
// email" to be turned OFF in Supabase Dashboard -> Authentication ->
// Providers -> Email, so signUp() returns a usable session immediately.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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

  if (!ready) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Loading…</div>;

  if (!session) {
    return (
      <div style={{ maxWidth: 380, margin: '80px auto', fontFamily: 'system-ui', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22 }}>Outreach Tool</h1>
        <form onSubmit={submit}>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: '100%', padding: 10, marginBottom: 10, borderRadius: 6, border: '1px solid #ccc' }}
          />
          <input
            type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="password (min 6 characters)"
            style={{ width: '100%', padding: 10, marginBottom: 10, borderRadius: 6, border: '1px solid #ccc' }}
          />
          {error && <div style={{ color: '#B0361F', fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <button type="submit" disabled={busy}
            style={{ width: '100%', padding: '10px 20px', borderRadius: 6, border: 'none', background: '#2F6F62', color: '#fff', fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <div style={{ fontSize: 13 }}>
          {mode === 'signin' ? (
            <>First time? <button onClick={() => { setMode('signup'); setError(''); }} style={{ border: 'none', background: 'none', color: '#C4622D', cursor: 'pointer', fontWeight: 600 }}>Create an account</button></>
          ) : (
            <>Already have an account? <button onClick={() => { setMode('signin'); setError(''); }} style={{ border: 'none', background: 'none', color: '#C4622D', cursor: 'pointer', fontWeight: 600 }}>Sign in</button></>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ textAlign: 'right', padding: '8px 16px', fontSize: 12 }}>
        {session.user.email} · <button onClick={() => supabase.auth.signOut()} style={{ border: 'none', background: 'none', color: '#C4622D', cursor: 'pointer', fontWeight: 600 }}>Sign out</button>
      </div>
      {children}
    </div>
  );
}
