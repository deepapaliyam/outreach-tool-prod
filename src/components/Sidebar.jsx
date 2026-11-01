import React from 'react';
import { ArrowUpRight, ListFilter, Mail, Send, Columns3, Handshake, BarChart3, UserCog, ShieldCheck, LogOut } from 'lucide-react';
import { initialsOf } from '../lib/profile';

// Left navigation, as in the Figma prototype. The Admin entry exists in the
// page ONLY for administrators — for everyone else it is not rendered at all.
export default function Sidebar({ tab, setTab, counts, sendMeter, me, profile, isAdmin, onSignOut, open, close }) {
  const go = (t) => { setTab(t); close(); };
  const item = (id, label, Icon, count, extra = '') => (
    <button className={`${tab === id ? 'active' : ''} ${extra}`} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
      <Icon size={17} /> <span>{label}</span>{count != null && <span className="count">{count}</span>}
    </button>
  );
  const pct = Math.min(100, Math.round((sendMeter.count / sendMeter.cap) * 100));
  const left = Math.max(0, sendMeter.cap - sendMeter.count);
  const display = profile.name || me?.email || '';
  return (
    <aside className={`side${open ? ' open' : ''}`} aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark"><ArrowUpRight size={18} /></div>
        <div><div className="brand-name">Outreach Tool</div><div className="brand-sub">Lead prioritization</div></div>
      </div>

      <div className="side-label">Workspace</div>
      <nav className="nav">
        {item('upload', 'Upload & Prioritize', ListFilter, counts.leads)}
        {item('drafts', 'Email Draft', Mail, counts.drafts)}
        {item('sent', 'Sent', Send, counts.sent)}
        {item('outcomes', 'Track Outcomes', Columns3)}
        {item('clients', 'Clients', Handshake, counts.clients)}
        {item('insights', 'Insights', BarChart3)}
      </nav>

      <div className="side-label">Account</div>
      <nav className="nav">
        {item('profile', 'Profile & Settings', UserCog)}
        {isAdmin && item('admin', 'Admin', ShieldCheck, null, 'admin-link')}
      </nav>

      <div className="limit-card" title="Real sends in the last 24 hours. Test sends don't count.">
        <div className="limit-row"><span>Daily send limit</span><b>{sendMeter.count} / {sendMeter.cap}</b></div>
        <div className={`bar${pct >= 100 ? ' full' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        <div className="limit-note">{left} send{left === 1 ? '' : 's'} left in the last-24-hours window</div>
      </div>

      <div className="me">
        <div className="avatar" aria-hidden="true">{initialsOf(display)}</div>
        <div className="me-text">
          <div className="me-name">{display}</div>
          <div className="me-sub">{profile.company || me?.email || ''}</div>
        </div>
        <button onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
      </div>
    </aside>
  );
}
