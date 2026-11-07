import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Activity } from 'lucide-react';
import { runServiceCheck, summarizeChecks } from '../lib/healthCheck';
import { explainUnreachable } from '../lib/backendProbe';
import { Spinner } from './ui';

// Lives in the Admin tab. One button that tests the AI key, search key,
// Google sign-in setup, the administrator's Gmail connection and the
// database, and says plainly what to fix. `runSignal` lets the app trigger
// the check automatically when something failed because of a setup problem.
const ICON = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle };

export default function ServiceCheck({ runSignal = 0 }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const lastSignal = useRef(0);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await runServiceCheck());
    } catch (e) {
      setResult(null);
      setError(e.network ? await explainUnreachable('health-check') : e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (runSignal > lastSignal.current) {
      lastSignal.current = runSignal;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  const summary = result ? summarizeChecks(result.checks) : null;

  return (
    <div className="card">
      <div className="row between">
        <div className="row">
          <Activity size={16} />
          <h2 className="card-title">Service check</h2>
          {summary && <span className={`chip-s ${summary.tone}`}>{summary.text}</span>}
        </div>
        <button className="btn primary" disabled={busy} onClick={run}>
          {busy ? <><Spinner size={13} /> Checking…</> : result ? 'Check again' : 'Run service check'}
        </button>
      </div>
      {!result && !busy && !error && <p className="card-sub" style={{ marginBottom: 0 }}>Tests your AI key, search key, Gmail and database in one click.</p>}
      {error && <div className="note bad mt12" role="alert">{error}</div>}
      {result && (
        <ul className="svc-list">
          {result.checks.map(c => {
            const Icon = ICON[c.status] || AlertTriangle;
            return (
              <li key={c.id} className={`svc-row ${c.status}`}>
                <Icon size={16} className="svc-icon" />
                <div>
                  <div className="svc-label">{c.label}</div>
                  <div className="svc-msg">{c.message}</div>
                </div>
              </li>
            );
          })}
          <li className="xs faint">Checked {new Date(result.checkedAt).toLocaleTimeString()}. The check uses a tiny amount of AI and search credit and sends no email.</li>
        </ul>
      )}
    </div>
  );
}
