import React, { useMemo } from 'react';
import { Search, Upload, Download } from 'lucide-react';
import { PageHeader, StatCard, StatusBadge, Pager, Empty, Spinner, Notice } from '../components/ui';
import { computeStatus, isClient } from '../lib/scoring';
import { KIND_LABEL } from '../lib/gmailResponses';
import { rupee, num } from '../lib/money';

const PAGE_SIZE = 100;
const REASONS = ['Price too high', 'No response', 'Chose competitor', 'Timing / not ready', 'Other'];
const CHIPS = [['', 'All leads'], ['none', 'Not contacted'], ['drafted', 'Drafted'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['proposal', 'Proposal sent'], ['won', 'Client'], ['lost', 'Lost'], ['paid', 'Client (paid)']];
const NEXT = { none: 'Write a draft', drafted: 'Review and send', contacted: 'Wait, then follow up', replied: 'Send a proposal', proposal: 'Follow up on proposal', won: 'Collect payment', paid: 'Project handoff', lost: 'Closed' };

const when = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '—');

export default function OutcomesPage({ ctl }) {
  const {
    leads, outcomeTabLeads, outcomeSearch, setOutcomeSearch, outcomeStatusFilter, setOutcomeStatusFilter, outcomePage, setOutcomePage,
    selectedLead, setSelectedId, outcomeDraft, setOutcomeDraft, saveOutcomeRow, savingOutcome,
    handleImportOutcomes, importing, importStatus, exportXLSX, responseFor,
  } = ctl;

  const stats = useMemo(() => {
    const contacted = leads.filter(l => l.outcome?.contacted).length;
    const replied = leads.filter(l => l.outcome?.replied).length;
    const clients = leads.filter(isClient);
    const paid = clients.filter(l => l.outcome.payment_received);
    const revenue = paid.reduce((s, l) => s + (num(l.outcome.final_amount) || num(l.outcome.quoted_price)), 0);
    return { contacted, replied, clients: clients.length, paid: paid.length, revenue };
  }, [leads]);
  const counts = useMemo(() => {
    const c = { '': leads.length };
    leads.forEach(l => { const t = computeStatus(l).tone; c[t] = (c[t] || 0) + 1; });
    return c;
  }, [leads]);

  const page = outcomeTabLeads.slice(outcomePage * PAGE_SIZE, outcomePage * PAGE_SIZE + PAGE_SIZE);
  const resp = selectedLead ? responseFor(selectedLead.id) : null;
  const set = (patch) => setOutcomeDraft(d => ({ ...d, ...patch }));

  return (
    <>
      <PageHeader title="Track Outcomes" sub="Turn conversations into a clear pipeline. Keep replies, proposals and payments in one place.">
        <label className="btn" style={{ cursor: 'pointer' }}>
          {importing ? <Spinner size={14} /> : <Upload size={15} />} Import outcomes from Excel
          <input type="file" accept=".xlsx,.xls" aria-label="Import outcomes file" onChange={handleImportOutcomes} disabled={importing} style={{ display: 'none' }} />
        </label>
      </PageHeader>
      {importStatus && <div style={{ marginBottom: 14 }}><Notice tone="info"><span role="status">{importStatus}</span></Notice></div>}

      <div className="grid g-4">
        <StatCard label="Tracked leads" value={leads.length} sub="Across all saved businesses" />
        <StatCard label="Received a reply" value={stats.replied} sub={`${stats.contacted ? Math.round((stats.replied / stats.contacted) * 100) : 0}% of ${stats.contacted} contacted leads`} />
        <StatCard label="Converted to clients" value={stats.clients} sub={`${stats.paid} paid · ${stats.clients - stats.paid} awaiting payment`} />
        <StatCard label="Collected revenue" value={rupee(stats.revenue)} brand sub={`Payments received · ${stats.paid} client${stats.paid === 1 ? '' : 's'}`} />
      </div>

      <div className="grid g-wide-side mt16">
        <div className="card flush">
          <div className="card-pad">
            <div className="row">
              <div className="search"><Search size={15} /><input type="search" placeholder="Search businesses…" aria-label="Search outcomes" value={outcomeSearch} onChange={e => setOutcomeSearch(e.target.value)} /></div>
              <button className="btn sm" onClick={exportXLSX}><Download size={13} /> Export Excel</button>
            </div>
            <div className="filter-chips mt12" role="group" aria-label="Status filter">
              {CHIPS.map(([val, label]) => (
                <button key={label} className={outcomeStatusFilter === val ? 'on' : ''} aria-pressed={outcomeStatusFilter === val} onClick={() => setOutcomeStatusFilter(val)}>{label}<small>{counts[val] || 0}</small></button>
              ))}
            </div>
          </div>
          {outcomeTabLeads.length === 0 ? <Empty title="No leads match" sub="Try clearing the search or filter." /> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Business</th><th>Status</th><th>Last activity</th><th>Quoted</th><th>Collected</th><th>Next step</th></tr></thead>
                  <tbody>
                    {page.map(l => {
                      const st = computeStatus(l);
                      const o = l.outcome || {};
                      const last = o.contacted_date || (o.updated_at && o.updated_at.slice(0, 10)) || (l.draft && l.draft.generatedAt);
                      return (
                        <tr key={l.id} className={`click${selectedLead && selectedLead.id === l.id ? ' sel' : ''}`} onClick={() => setSelectedId(l.id)}>
                          <td><div className="biz">{l.name}</div><div className="sub">{[l.district, l.nic_label].filter(Boolean).join(' · ')}</div></td>
                          <td><StatusBadge lead={l} /></td>
                          <td className="small dim">{when(last)}</td>
                          <td className="small num">{rupee(o.quoted_price)}</td>
                          <td className="small num" style={{ color: o.payment_received ? 'var(--ok)' : undefined, fontWeight: o.payment_received ? 600 : 400 }}>{o.payment_received ? rupee(o.final_amount || o.quoted_price) : '—'}</td>
                          <td className="small dim">{NEXT[st.tone]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={outcomePage} setPage={setOutcomePage} total={outcomeTabLeads.length} pageSize={PAGE_SIZE} />
            </>
          )}
        </div>

        <div className="card" style={{ position: 'sticky', top: 66 }}>
          <h2 className="card-title">Log an outcome</h2>
          {!selectedLead ? <Empty title="Select a lead" sub="Pick one from the list." /> : (
            <div className="mt12">
              <div className="row between"><div className="biz" style={{ fontSize: 16 }}>{selectedLead.name}</div><StatusBadge lead={selectedLead} /></div>
              <div className="small dim" style={{ marginBottom: 8 }}>{[selectedLead.stakeholder_name, [selectedLead.district, selectedLead.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
              {resp && (
                <div className={`resp-box ${resp.ok ? 'ok' : 'bad'}`} style={{ marginTop: 0, marginBottom: 12 }}>
                  <b>Last Gmail response:</b> {resp.ok ? 'accepted' : 'failed'} · {KIND_LABEL[resp.kind] || resp.kind} · {resp.at ? new Date(resp.at).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}
                  {resp.ok ? <div className="mono xs" style={{ marginTop: 3 }}>{resp.messageId || '—'}</div> : <div className="xs" style={{ marginTop: 3 }}>{resp.error || 'Gmail returned no details.'}</div>}
                </div>
              )}
              <label className="check"><input type="checkbox" checked={!!outcomeDraft.replied} onChange={e => set({ replied: e.target.checked })} /> Replied</label>
              <div className="field mt12"><label htmlFor="o-resp">Response type</label>
                <select id="o-resp" value={outcomeDraft.response_type || ''} onChange={e => set({ response_type: e.target.value })}><option value="">—</option><option>Positive</option><option>Neutral</option><option>Negative</option><option>No response</option></select></div>
              <label className="check"><input type="checkbox" checked={!!outcomeDraft.proposal_sent} onChange={e => set({ proposal_sent: e.target.checked })} /> Proposal sent</label>
              <div className="field mt12"><label htmlFor="o-quote">Quoted price (₹)</label><input id="o-quote" type="text" value={outcomeDraft.quoted_price || ''} onChange={e => set({ quoted_price: e.target.value })} placeholder="15000" /></div>
              <label className="check"><input type="checkbox" checked={!!outcomeDraft.materialized} onChange={e => set({ materialized: e.target.checked })} /> Converted to a client (materialized into a build)</label>
              {!outcomeDraft.materialized && (
                <div className="field mt12"><label htmlFor="o-reason">Reason not proceeded</label>
                  <select id="o-reason" value={outcomeDraft.not_proceeded_reason || ''} onChange={e => set({ not_proceeded_reason: e.target.value })}><option value="">—</option>{REASONS.map(r => <option key={r}>{r}</option>)}</select></div>
              )}
              <label className="check mt12"><input type="checkbox" checked={!!outcomeDraft.payment_received} onChange={e => set({ payment_received: e.target.checked })} /> Payment received</label>
              <div className="field mt12"><label htmlFor="o-final">Final amount (₹)</label><input id="o-final" type="text" value={outcomeDraft.final_amount || ''} onChange={e => set({ final_amount: e.target.value })} placeholder="12000" /></div>
              <div className="field"><label htmlFor="o-notes">Notes</label><textarea id="o-notes" value={outcomeDraft.notes || ''} onChange={e => set({ notes: e.target.value })} /></div>
              <button className="btn primary" style={{ width: '100%' }} disabled={savingOutcome} onClick={() => saveOutcomeRow(selectedLead, outcomeDraft)}>{savingOutcome ? <Spinner size={14} /> : 'Save outcome'}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
