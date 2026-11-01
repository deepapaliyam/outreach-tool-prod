import React, { useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { computeStatus } from '../lib/scoring';
import { safeHref } from '../lib/webcheck';

// Small building blocks shared by every page.

export function PageHeader({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Spinner({ size = 14 }) { return <Loader2 className="spin" size={size} />; }

export function ScorePill({ score, on = false }) {
  const tone = score >= 60 ? 'hi' : score >= 35 ? 'mid' : 'lo';
  return <span className={`score ${tone}${on ? ' on' : ''}`}>{score}</span>;
}

export function StatusBadge({ lead }) {
  const s = computeStatus(lead);
  return <span className={`status ${s.tone}`}>{s.label}</span>;
}

export function Empty({ title, sub, children }) {
  return <div className="empty"><div className="empty-title">{title}</div>{sub && <div className="empty-sub">{sub}</div>}{children && <div style={{ marginTop: 12 }}>{children}</div>}</div>;
}

const NOTE_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info };
export function Notice({ tone = 'info', children, action }) {
  const Icon = NOTE_ICON[tone] || Info;
  return (
    <div className={`note ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon size={16} />
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <i />
    </span>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="seg" role="group">
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value}
          className={`${value === o.value ? 'on' : ''}${o.warn ? ' warn' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, sub, brand }) {
  return (
    <div className="card stat">
      <div className="eyebrow">{label}</div>
      <div className={`stat-n${brand ? ' accent' : ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Pager({ page, setPage, total, pageSize }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  return (
    <div className="pager">
      <span>Showing {start}–{end} of {total}</span>
      <span className="row">
        <button className="btn sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
        <button className="btn sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
      </span>
    </div>
  );
}

// Results come from Google, so links are only ever rendered as plain
// http(s) links that open in a new tab.
export function SafeLink({ url, children }) {
  const href = safeHref(url);
  return href
    ? <a className="src-link" href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>
    : <span>{children}</span>;
}

// ---- Toasts: replace the browser's blocking alert() boxes ---------------------
export function Toasts({ items, dismiss }) {
  if (!items.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.tone || ''}`} role={t.tone === 'bad' ? 'alert' : 'status'}>
          <div className="grow">
            <div className="t-title">{t.title}</div>
            {t.text && <div className="t-body">{t.text}</div>}
          </div>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// ---- Chart card with a "View as table" switch (every chart has a text twin) ------
export function ChartCard({ title, sub, rows, columns, children, summary }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="card chart-card">
      <div className="chart-h">
        <div>
          <h3 className="card-title">{title}</h3>
          {sub && <div className="card-sub" style={{ marginBottom: 8 }}>{sub}</div>}
        </div>
        {rows && rows.length > 0 && (
          <button className="btn link sm table-toggle" onClick={() => setAsTable(v => !v)}>{asTable ? 'View chart' : 'View as table'}</button>
        )}
      </div>
      {asTable ? (
        <div className="table-wrap">
          <table>
            <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{columns.map(c => <td key={c.key}>{c.format ? c.format(r[c.key]) : r[c.key]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={summary || title}>{children}</div>
      )}
    </div>
  );
}
