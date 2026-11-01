import React, { useState } from 'react';
import { RefreshCw, Copy } from 'lucide-react';
import { Empty, Spinner, Notice } from './ui';
import { KIND_LABEL, shortId } from '../lib/gmailResponses';

// Gmail's own answer for every send, test send and Gmail draft: the message ID,
// thread ID and labels it returned, or the exact error. Your records only.
export default function GmailResponses({ rows, loading, error, onRefresh, onCopy, limit = 25 }) {
  const [open, setOpen] = useState(null);
  const shown = (rows || []).slice(0, limit);
  return (
    <div className="card flush" id="gmail-responses">
      <div className="card-pad">
        <div className="row between">
          <div>
            <h2 className="card-title">Gmail responses</h2>
            <p className="card-sub" style={{ marginBottom: 0 }}>What Gmail answered each time the tool sent, test-sent or saved a draft.</p>
          </div>
          <button className="btn sm" onClick={onRefresh} disabled={loading}>{loading ? <Spinner size={12} /> : <RefreshCw size={13} />} Refresh</button>
        </div>
        <div className="mt12">
          <Notice tone="info"><b>“Accepted” means Gmail took the message</b> — it is not proof of inbox delivery. If an address doesn't exist, the bounce arrives later as a separate email in your own inbox.</Notice>
        </div>
        {error && <div className="mt12"><Notice tone="warn">Could not load responses: {error} (Has <code>supabase/v7_schema.sql</code> been run?)</Notice></div>}
      </div>
      {shown.length === 0 ? <Empty title="Nothing yet" sub="After you send, test-send or save a Gmail draft, Gmail's answer is recorded here." /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Type</th><th>To</th><th>Subject</th><th>Gmail said</th><th>Message ID</th></tr></thead>
            <tbody>
              {shown.map(r => (
                <React.Fragment key={r.id}>
                  <tr className="click" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                    <td className="small">{new Date(r.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span className="tag grey">{KIND_LABEL[r.kind] || r.kind}</span></td>
                    <td className="small mono">{r.to_address}</td>
                    <td className="small trunc" style={{ maxWidth: 220 }}>{r.subject}</td>
                    <td>{r.ok ? <span className="tag ok">Accepted</span> : <>
                      <span className="tag bad">Failed{r.http_status ? ` · ${r.http_status}` : ''}</span>
                      {r.error_message && <div className="xs" style={{ color: 'var(--bad)', marginTop: 4, maxWidth: 260 }}>{r.error_message}</div>}
                    </>}</td>
                    <td className="mono small">{r.gmail_message_id ? shortId(r.gmail_message_id) : '—'}</td>
                  </tr>
                  {open === r.id && (
                    <tr><td colSpan={6} style={{ background: '#FBFAF7' }}>
                      {r.ok ? (
                        <dl className="kv" style={{ marginTop: 0 }}>
                          <dt>Message ID</dt><dd>{r.gmail_message_id} <button className="icon-btn" aria-label="Copy message ID" onClick={e => { e.stopPropagation(); onCopy(r.gmail_message_id); }}><Copy size={13} /></button></dd>
                          <dt>Thread ID</dt><dd>{r.gmail_thread_id || '—'}</dd>
                          <dt>Labels</dt><dd>{(r.label_ids || []).join(', ') || '—'}</dd>
                          <dt>HTTP status</dt><dd>{r.http_status}</dd>
                        </dl>
                      ) : (
                        <div><b>Gmail's error:</b> {r.error_message || 'No details were returned.'}</div>
                      )}
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
