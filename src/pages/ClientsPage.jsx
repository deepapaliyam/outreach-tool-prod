import React, { useMemo, useState } from 'react';
import { Search, Sparkles, Copy } from 'lucide-react';
import { PageHeader, StatCard, StatusBadge, Empty, Spinner, Notice } from '../components/ui';
import { checklistIdeas } from '../lib/upsell';
import { rupee, num } from '../lib/money';
import { followUpAddress } from '../lib/sent';

const whenDay = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const TYPE_LABEL = { upsell: 'Upsell', 'cross-sell': 'Cross-sell' };

function Idea({ idea, onCopy, source }) {
  return (
    <div className={`idea${source === 'lead' || source === 'email' ? ' from-lead' : ''}`}>
      <div className="idea-h">
        <div className="idea-t">{idea.title}</div>
        <span className="row" style={{ gap: 6, flex: 'none' }}>
          <span className={`tag ${idea.type === 'cross-sell' ? 'brand' : 'ok'}`}>{TYPE_LABEL[idea.type] || 'Idea'}</span>
        </span>
      </div>
      <p><b>Why:</b> {idea.why}</p>
      {idea.pitch && <p><b>How to raise it:</b> {idea.pitch}</p>}
      {idea.timing && <p><b>When:</b> {idea.timing}</p>}
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="xs faint">{source === 'ai' ? 'Written by AI for this client' : source === 'lead' ? 'Based on this client’s web check' : source === 'email' ? 'Based on their email address' : 'General idea'}</span>
        <button className="btn quiet sm" onClick={() => onCopy(`${idea.title}\n${idea.pitch || idea.why}`)}><Copy size={12} /> Copy</button>
      </div>
    </div>
  );
}

export default function ClientsPage({ ctl }) {
  const { clients, selectedLead, setSelectedId, setTab, copy, sender, suggestUpsell, upsellBusy, liveIdeas } = ctl;
  const [search, setSearch] = useState('');

  const stats = useMemo(() => {
    const paid = clients.filter(l => l.outcome.payment_received);
    const revenue = paid.reduce((s, l) => s + (num(l.outcome.final_amount) || num(l.outcome.quoted_price)), 0);
    return { total: clients.length, paid: paid.length, unpaid: clients.length - paid.length, revenue };
  }, [clients]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...clients]
      .filter(l => !q || l.name.toLowerCase().includes(q))
      .sort((a, b) => String(b.outcome.updated_at || '').localeCompare(String(a.outcome.updated_at || '')));
  }, [clients, search]);

  const selected = selectedLead && clients.some(c => c.id === selectedLead.id) ? selectedLead : null;

  return (
    <>
      <PageHeader title="Clients" sub="People who became clients. Look after them — and see what else you could offer." />

      {clients.length === 0 ? (
        <div className="card"><Empty title="No clients yet" sub="When a lead becomes a client, tick “Converted to a client” in Track Outcomes and they appear here, with ideas for what to offer next.">
          <button className="btn primary" onClick={() => setTab('outcomes')}>Open Track Outcomes</button>
        </Empty></div>
      ) : (
        <div className="stack">
          <div className="grid g-4">
            <StatCard label="Clients" value={stats.total} sub="Converted from outreach" />
            <StatCard label="Paid" value={stats.paid} sub="Payment received" />
            <StatCard label="Awaiting payment" value={stats.unpaid} sub="Settle these before pitching more" />
            <StatCard label="Collected revenue" value={rupee(stats.revenue)} brand sub="From paid clients" />
          </div>

          <div className="grid g-wide-side">
            <div className="card flush">
              <div className="card-pad">
                <div className="search"><Search size={15} /><input type="search" placeholder="Search clients…" aria-label="Search clients" value={search} onChange={e => setSearch(e.target.value)} /></div>
              </div>
              {shown.length === 0 ? <Empty title="No clients match" sub="Try clearing the search." /> : (
                <div className="table-wrap">
                  <table aria-label="Clients">
                    <thead><tr><th>Client</th><th>Status</th><th>Sold for</th><th>Ideas</th></tr></thead>
                    <tbody>
                      {shown.map(l => {
                        const o = l.outcome;
                        const ideas = (liveIdeas[l.id] && liveIdeas[l.id].ideas) || o.upsell_ideas || [];
                        return (
                          <tr key={l.id} className={`click${selected && selected.id === l.id ? ' sel' : ''}`} onClick={() => setSelectedId(l.id)}>
                            <td><div className="biz">{l.name}</div><div className="sub">{[l.district, l.nic_label].filter(Boolean).join(' · ')}</div></td>
                            <td><StatusBadge lead={l} /></td>
                            <td className="small num">{rupee(o.final_amount || o.quoted_price)}</td>
                            <td className="small dim">{ideas.length ? `${ideas.length} saved` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="sticky-panel">
              {selected ? <ClientDetail key={selected.id} lead={selected} ctl={{ copy, sender, suggestUpsell, upsellBusy, liveIdeas, setTab }} /> : (
                <div className="card"><Empty title="Select a client" sub="See what you delivered and ideas for what to offer next." /></div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ClientDetail({ lead, ctl }) {
  const { copy, sender, suggestUpsell, upsellBusy, liveIdeas, setTab } = ctl;
  const o = lead.outcome || {};
  const saved = liveIdeas[lead.id] || (o.upsell_ideas ? { ideas: o.upsell_ideas, at: o.upsell_at } : null);
  const ideas = saved ? saved.ideas : [];
  const checklist = useMemo(() => checklistIdeas(lead), [lead]);
  const busy = !!upsellBusy[lead.id];
  const webChecked = lead.web_checked_at ? new Date(lead.web_checked_at).toLocaleDateString([], { day: 'numeric', month: 'short' }) : null;

  return (
    <div className="card" data-testid="client-detail">
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <h2 className="card-title" style={{ fontSize: 17 }}>{lead.name}</h2>
          <div className="small dim">{[lead.stakeholder_name, [lead.district, lead.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
        </div>
        <StatusBadge lead={lead} />
      </div>
      <dl className="mail-meta" style={{ borderBottom: 0, paddingBottom: 4 }}>
        <dt>Contact</dt><dd>{followUpAddress(lead) || '—'}</dd>
        <dt>Sold</dt><dd>{rupee(o.final_amount || o.quoted_price)}{o.payment_received ? ' · paid' : ' · payment not yet received'}</dd>
        <dt>Industry</dt><dd>{lead.nic_label || '—'}</dd>
        <dt>Website</dt><dd>{lead.website_status || 'Unknown'}{webChecked ? ` · checked ${webChecked}` : ''}</dd>
        {o.notes && <><dt>Notes</dt><dd>{o.notes}</dd></>}
      </dl>

      {!o.payment_received && (
        <div className="mt8"><Notice tone="warn"><b>Payment is still outstanding.</b> Settle it first — pitching more before you have been paid for this project rarely goes well. Log the payment in Track Outcomes.</Notice></div>
      )}

      <div className="card-split mt16" style={{ paddingTop: 12 }}>
        <div className="row between">
          <span className="eyebrow">Ideas written for this client</span>
          <button className="btn primary sm" disabled={busy} onClick={() => suggestUpsell(lead)}>
            {busy ? <><Spinner size={12} /> Thinking…</> : <><Sparkles size={13} /> {ideas.length ? 'Refresh ideas' : 'Suggest ideas'}</>}
          </button>
        </div>
        {!ideas.length && !busy && <p className="hint">The AI uses your offer and business details{sender.offer ? '' : ' (add what you offer in Profile & Settings for sharper ideas)'}, what is known about this client and your notes. It costs one AI call, and the result is saved.</p>}
        {saved && saved.at && <p className="hint">Written {whenDay(saved.at)}. They are suggestions to weigh up, not facts about the client.</p>}
        {ideas.map((idea, i) => <Idea key={i} idea={idea} source="ai" onCopy={copy} />)}
      </div>

      <div className="card-split mt16" style={{ paddingTop: 12 }}>
        <span className="eyebrow">Also worth considering</span>
        <p className="hint">Quick, free prompts. The tinted ones come from what the tool found about this business (its web check or email address); the rest apply to most clients.</p>
        {checklist.map(idea => <Idea key={idea.id} idea={idea} source={idea.basis} onCopy={copy} />)}
      </div>

      <p className="hint mt12">Add what you sold, and what they said, in <button className="btn link sm" style={{ padding: 0 }} onClick={() => setTab('outcomes')}>Track Outcomes</button> notes — the AI uses them.</p>
    </div>
  );
}
