import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { PageHeader, StatCard, Empty, Spinner, Notice, Segmented } from '../components/ui';
import ServiceCheck from '../components/ServiceCheck';
import { loadAdminOverview, loadAdminEvents, loadAdminGmail } from '../lib/admin';
import { explainUnreachable } from '../lib/backendProbe';
import { KIND_LABEL, shortId } from '../lib/gmailResponses';

const TABS = [['overview', 'Overview'], ['users', 'Users'], ['events', 'Errors & events'], ['gmail', 'Gmail responses'], ['service', 'Service check']];
const n = (v) => Number(v ?? 0).toLocaleString('en-IN');
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

// Everything an operator needs to run the tool for clients: server and API
// connection health, error reports, per-user usage and every Gmail response.
// This page is only ever built for administrators, and every call it makes is
// refused by the server for anyone else.
// Admin-only pointers for errors other than "no answer at all" (that one is explained in full by
// explainUnreachable, which checks whether Supabase itself is awake).
function adminHint(error) {
  const msg = String(error || '');
  if (/v7_schema|could not reach (the server|supabase)|did not answer/i.test(msg)) return '';
  return ' (If this mentions a missing function or table, run supabase/v7_schema.sql in the SQL Editor and deploy the admin function.)';
}

export default function AdminPage({ ctl }) {
  const { serviceCheckSignal } = ctl;
  const [tab, setTab] = useState(serviceCheckSignal > 0 ? 'service' : 'overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState(null);
  const [eventKind, setEventKind] = useState('error');
  const [gmail, setGmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async (which) => {
    setLoading(true);
    setError('');
    try {
      if (which === 'overview' || which === 'users') { const r = await loadAdminOverview(); setOverview(r.overview); setUsers(r.users || []); }
      else if (which === 'events') setEvents((await loadAdminEvents(eventKind, 150)).events || []);
      else if (which === 'gmail') setGmail((await loadAdminGmail(150)).responses || []);
    } catch (e) {
      setError(e.network ? await explainUnreachable('admin') : (e.adminMessage || e.message));
    } finally {
      setLoading(false);
    }
  }, [eventKind]);

  useEffect(() => { if (tab !== 'service') load(tab); }, [tab, load]);

  const o = overview;
  return (
    <>
      <PageHeader title="Admin" sub="Server and API health, error reports, usage per user and every Gmail response. Nobody else can see this tab.">
        <span className="admin-badge"><ShieldCheck size={12} /> Administrators only</span>
        {tab !== 'service' && <button className="btn sm" disabled={loading} onClick={() => load(tab)}>{loading ? <Spinner size={12} /> : <RefreshCw size={13} />} Refresh</button>}
      </PageHeader>

      <div className="subtabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setOpen(null); }}>{label}</button>)}
      </div>

      {error && <div style={{ marginBottom: 14 }}><Notice tone="bad">{error}{adminHint(error)}</Notice></div>}

      {tab === 'service' && <ServiceCheck runSignal={serviceCheckSignal} />}

      {tab === 'overview' && (o ? (
        <div className="stack">
          <div className="grid g-4">
            <StatCard label="Users" value={n(o.users)} sub={`${n(o.leads)} leads · ${n(o.drafts)} drafted`} />
            <StatCard label="Emails sent" value={n(o.sends_24h)} sub={`last 24h · ${n(o.sends_7d)} in 7 days · ${n(o.sends_30d)} in 30`} brand />
            <StatCard label="Gmail responses (7d)" value={`${n(o.gmail_ok_7d)} ok`} sub={`${n(o.gmail_failed_7d)} failed`} />
            <StatCard label="Errors" value={n(o.errors_24h)} sub={`last 24h · ${n(o.errors_7d)} in 7 days`} />
          </div>
          <div className="grid g-4">
            <StatCard label="AI calls (30d)" value={n(o.ai_calls_30d)} sub="drafts + rewrites" />
            <StatCard label="AI tokens in (30d)" value={n(o.input_tokens_30d)} sub="input" />
            <StatCard label="AI tokens out (30d)" value={n(o.output_tokens_30d)} sub="output" />
            <StatCard label="Web searches (30d)" value={n(o.searches_30d)} sub="Serper credits used" />
          </div>
          <div className="grid g-2">
            <div className="card">
              <h2 className="card-title">Errors by type · last 7 days</h2>
              {Object.keys(o.errors_by_code_7d || {}).length === 0 ? <p className="card-sub">No errors recorded. 🎉</p> : (
                <div className="code-list">
                  {Object.entries(o.errors_by_code_7d).sort((a, b) => b[1] - a[1]).map(([code, c]) => (
                    <div className="code-row" key={code}><code>{code}</code><b>{c}</b></div>
                  ))}
                </div>
              )}
            </div>
            <div className="card">
              <h2 className="card-title">Last service check</h2>
              {!o.last_health ? <p className="card-sub">None recorded yet — run one in the Service check tab.</p> : (
                <>
                  <p className="card-sub">{when(o.last_health.at)} · {o.last_health.mode || 'admin'} · <span className={`chip-s ${o.last_health.ok ? 'ok' : 'fail'}`}>{o.last_health.ok ? 'all working' : 'needs attention'}</span></p>
                  <ul className="svc-list">
                    {(o.last_health.checks || []).map(c => (
                      <li key={c.id} className={`svc-row ${c.status}`}><div><div className="svc-label">{c.label}</div><div className="svc-msg">{c.message}</div></div></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (loading ? <div className="card"><Empty title="Loading…" /></div> : null))}

      {tab === 'users' && (
        <div className="card flush">
          {users.length === 0 ? <Empty title={loading ? 'Loading…' : 'No users'} /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>User</th><th>Joined</th><th>Last sign-in</th><th>Leads</th><th>Drafts</th><th>Contacted</th><th>Sent (30d)</th><th>AI calls</th><th>AI tokens</th><th>Errors (7d)</th><th>Gmail</th></tr></thead>
              <tbody>{users.map(u => (
                <tr key={u.user_id}>
                  <td className="biz">{u.email}</td><td className="small dim">{when(u.created_at)}</td><td className="small dim">{when(u.last_sign_in_at)}</td>
                  <td className="num">{n(u.leads)}</td><td className="num">{n(u.drafts)}</td><td className="num">{n(u.contacted)}</td><td className="num">{n(u.sends_30d)}</td>
                  <td className="num">{n(u.ai_calls_30d)}</td><td className="num">{n(u.ai_tokens_30d)}</td>
                  <td className="num" style={{ color: Number(u.errors_7d) ? 'var(--bad)' : undefined }}>{n(u.errors_7d)}</td>
                  <td>{u.gmail_connected ? <span className="tag ok">Connected</span> : <span className="tag grey">No</span>}</td>
                </tr>))}
              </tbody></table></div>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="card flush">
          <div className="card-pad row between">
            <Segmented value={eventKind} onChange={setEventKind} options={[{ value: 'error', label: 'Errors' }, { value: 'usage', label: 'Usage' }, { value: 'health', label: 'Health checks' }, { value: '', label: 'Everything' }]} />
            <span className="small faint">Newest first · latest 150</span>
          </div>
          {!events || events.length === 0 ? <Empty title={loading ? 'Loading…' : 'Nothing recorded'} sub="Errors and usage appear here as people use the tool." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>When</th><th>Kind</th><th>Source</th><th>Code</th><th>User</th><th>Message</th></tr></thead>
              <tbody>{events.map(e => (
                <React.Fragment key={e.id}>
                  <tr className="click" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                    <td className="small">{when(e.created_at)}</td>
                    <td><span className={`tag ${e.kind === 'error' ? 'bad' : e.kind === 'health' ? 'brand' : 'grey'}`}>{e.kind}</span></td>
                    <td className="small mono">{e.source}</td><td className="small mono">{e.code || '—'}</td><td className="small dim">{e.email || '—'}</td>
                    <td className="small" style={{ maxWidth: 360 }}>{(e.message || '').slice(0, 120)}</td>
                  </tr>
                  {open === e.id && <tr><td colSpan={6} style={{ background: '#FBFAF7' }}><pre className="json">{JSON.stringify({ message: e.message, ...e.data }, null, 2)}</pre></td></tr>}
                </React.Fragment>))}
              </tbody></table></div>
          )}
        </div>
      )}

      {tab === 'gmail' && (
        <div className="card flush">
          {!gmail || gmail.length === 0 ? <Empty title={loading ? 'Loading…' : 'No Gmail responses yet'} /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>When</th><th>User</th><th>Type</th><th>To</th><th>Result</th><th>Message ID</th><th>Thread ID</th><th>Labels</th></tr></thead>
              <tbody>{gmail.map(r => (
                <React.Fragment key={r.id}>
                  <tr className="click" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                    <td className="small">{when(r.created_at)}</td><td className="small dim">{r.email}</td>
                    <td><span className="tag grey">{KIND_LABEL[r.kind] || r.kind}</span></td><td className="small mono">{r.to_address}</td>
                    <td>{r.ok ? <span className="tag ok">Accepted</span> : <span className="tag bad">Failed · {r.http_status || 'n/a'}</span>}</td>
                    <td className="small mono">{shortId(r.gmail_message_id) || '—'}</td><td className="small mono">{shortId(r.gmail_thread_id) || '—'}</td>
                    <td className="small">{(r.label_ids || []).join(', ')}</td>
                  </tr>
                  {open === r.id && <tr><td colSpan={8} style={{ background: '#FBFAF7' }}>{r.ok ? <span className="small mono">message {r.gmail_message_id} · thread {r.gmail_thread_id}</span> : <b>{r.error_message}</b>}<div className="small dim">{r.subject}</div></td></tr>}
                </React.Fragment>))}
              </tbody></table></div>
          )}
        </div>
      )}
    </>
  );
}
