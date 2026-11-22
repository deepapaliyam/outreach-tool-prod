import React, { useState, useRef } from 'react';
import { FileSpreadsheet, Upload, Download, Search, CheckCircle2, Play, Square } from 'lucide-react';
import { PageHeader, ScorePill, Pager, Empty, Spinner, Switch } from '../components/ui';
import WhyPanel, { websiteTone } from '../components/LeadPanel';
import { recommendContact } from '../lib/scoring';
import { SafeLink } from '../components/ui';
import {
  ADDED_RANGES, STATUS_CHOICES, SORT_CHOICES, DEFAULT_FILTERS, homeStats, addedDay, addedAt, dayLabel, countByDay, isActioned,
} from '../lib/leadList';

const PAGE_SIZE = 100;

function RegionChips({ regions, setRegions }) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) setRegions([...new Set([...regions, ...parts])]);
    setText('');
  };
  return (
    <div className="chips">
      {regions.map(r => (
        <span className="chip" key={r}>{r}<button aria-label={`Remove ${r}`} onClick={() => setRegions(regions.filter(x => x !== r))}>×</button></span>
      ))}
      <input className="chip-add" type="text" value={text} placeholder="+ Add state" aria-label="Add a preferred state"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add} />
    </div>
  );
}

// The five numbers across the top. They always count ALL saved leads; clicking one filters the table below
// to those leads (click it again to clear).
function StatBar({ stats, filters, setFilters }) {
  const toggle = (key, value) => setFilters(f => ({ ...f, [key]: f[key] === value ? DEFAULT_FILTERS[key] : value }));
  const pct = stats.total ? Math.round((stats.actioned / stats.total) * 100) : 0;
  const cells = [
    { id: 'today', label: 'Added today', n: stats.today, sub: stats.today ? `${stats.todayPending} still to email` : 'Nothing new today', on: filters.added === 'today', click: () => toggle('added', 'today') },
    { id: 'week', label: 'Added this week', n: stats.week, sub: stats.week ? `${stats.weekPending} still to email` : 'Since Monday', on: filters.added === 'week', click: () => toggle('added', 'week') },
    { id: 'month', label: 'Added this month', n: stats.month, sub: stats.month ? `${stats.monthPending} still to email` : 'Since the 1st', on: filters.added === 'month', click: () => toggle('added', 'month') },
    { id: 'actioned', label: 'Leads actioned', n: stats.actioned, sub: `${pct}% of ${stats.total} saved`, on: filters.status === 'actioned', click: () => toggle('status', 'actioned') },
    { id: 'pending', label: 'Pending action', n: stats.pending, sub: 'Not emailed yet', on: filters.status === 'pending', click: () => toggle('status', 'pending'), accent: true },
  ];
  return (
    <div className="card statbar" role="group" aria-label="Lead summary">
      {cells.map(c => (
        <button key={c.id} type="button" className={`statcell${c.on ? ' on' : ''}`} aria-pressed={c.on} onClick={c.click}
          title={c.on ? 'Click to show all leads again' : `Show only: ${c.label.toLowerCase()}`}>
          <span className="eyebrow">{c.label}</span>
          <span className={`stat-n${c.accent ? ' accent' : ''}`}>{c.n}</span>
          <span className="stat-sub">{c.sub}</span>
        </button>
      ))}
    </div>
  );
}

export default function UploadPage({ ctl }) {
  const {
    leads, filteredSorted, filters, setFilters, industries, states, selectedLead, setSelectedId,
    uploadPage, setUploadPage, handleFile, uploadStatus,
    preferredRegions, setPreferredRegions, rescoreAllLeads, rescoring, rescoreProgress, rescoreStatus,
    autoCheckOnUpload, setAutoCheckOnUpload, enrichBatchN, setEnrichBatchN, runWebCheckButton, stopWebChecks,
    enrichBatchRunning, enrichBatchProgress, enrichStatus, uncheckedLeads, enriching, enrichOneLead,
    exportCSV, exportXLSX, openDraft,
  } = ctl;
  const [dragOver, setDragOver] = useState(false);
  const whyRef = useRef(null);
  const page = filteredSorted.slice(uploadPage * PAGE_SIZE, uploadPage * PAGE_SIZE + PAGE_SIZE);
  const checkedCount = leads.length - uncheckedLeads.length;
  const now = Date.now();
  const stats = homeStats(leads, now);
  const perDay = countByDay(filteredSorted);
  const byDate = filters.sort !== 'score';
  // On a narrower screen the day headings already say when each lead was added, so the column makes way for the buttons.
  const addedColClass = byDate ? 'col-added hide-when-grouped' : 'col-added';
  const filtersActive = ['search', 'industry', 'state'].some(k => filters[k]) || filters.minScore > 0 || filters.added !== 'all' || filters.status !== 'all';
  const set = (key) => (e) => setFilters(f => ({ ...f, [key]: e.target.value }));

  // The "Why this lead?" card is in the top row, so picking a lead far down the table would show nothing on
  // screen. Bring the card into view when (and only when) it is out of sight.
  const pick = (id) => {
    setSelectedId(id);
    const el = whyRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const r = el.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight;
    if (r.bottom < 80 || r.top > h) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageHeader title="Upload & Prioritize" sub="Find the businesses that need you most. Newest additions first, best opportunities on top of each day." />

      <StatBar stats={stats} filters={filters} setFilters={setFilters} />

      <div className="grid g-top3 mt16">
        <div className="card compact">
          <h2 className="card-title">Upload today's list</h2>
          <p className="card-sub">Import an Excel file. Already-saved businesses are skipped — safe to re-upload.</p>
          <div className={`drop${dragOver ? ' over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}>
            <div className="drop-ico"><FileSpreadsheet size={18} /></div>
            <div className="grow">
              <div className="drop-t">Drop your spreadsheet here</div>
              <div className="small faint">.xlsx or .xls</div>
            </div>
            <label className="btn sm" style={{ cursor: 'pointer' }}>
              <Upload size={14} /> Choose file
              <input type="file" accept=".xlsx,.xls" aria-label="Choose spreadsheet" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            </label>
          </div>
          {uploadStatus && <div className="upload-status" role="status"><CheckCircle2 size={15} /><span>{uploadStatus}</span></div>}
        </div>

        <div className="card compact">
          <h2 className="card-title">Prioritization settings</h2>
          <div className="field mt12">
            <label>Preferred regions <span className="opt">— matching states get a bonus</span></label>
            <RegionChips regions={preferredRegions} setRegions={setPreferredRegions} />
            <p className="hint">Applies to lists you upload from now on.{' '}
              <button className="btn link sm" disabled={rescoring || !leads.length} onClick={rescoreAllLeads}>
                {rescoring ? <><Spinner size={11} /> Re-scoring {rescoreProgress.done}/{rescoreProgress.total}…</> : `Re-score all ${leads.length} saved leads`}
              </button>
            </p>
            {rescoreStatus && <p className="hint" role="status">{rescoreStatus}</p>}
          </div>
          <div className="card-split" style={{ paddingTop: 12, marginTop: 12 }}>
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <div>
                <div className="strong">Automatic web-presence checks</div>
                <div className="small dim">Research new leads after every import. Keep this tab open while it runs.</div>
              </div>
              <Switch checked={autoCheckOnUpload} onChange={setAutoCheckOnUpload} label="Check automatically when I upload a list" />
            </div>
            <div className="row between mt12">
              <span className="small dim">{checkedCount} of {leads.length} checked</span>
              <span className="row">
                <label className="small row" style={{ gap: 6 }}>Top
                  <input className="input-sm" type="number" min="1" value={enrichBatchN} disabled={enrichBatchRunning} aria-label="How many leads to check"
                    onChange={e => setEnrichBatchN(Math.max(1, Number(e.target.value) || 1))} /> by score
                </label>
                <button className="btn sm" disabled={enrichBatchRunning || !leads.length} onClick={runWebCheckButton}>
                  {enrichBatchRunning
                    ? <><Spinner size={12} /> {enrichBatchProgress.done}/{enrichBatchProgress.total}…</>
                    : <><Play size={12} /> {uncheckedLeads.length ? `Run checks (${uncheckedLeads.length} new)` : 'Re-check top leads'}</>}
                </button>
                {enrichBatchRunning && <button className="btn sm" onClick={stopWebChecks}><Square size={11} /> Stop</button>}
              </span>
            </div>
            {enrichStatus && <p className="hint" role="status">{enrichStatus}</p>}
          </div>
        </div>

        {selectedLead
          ? <WhyPanel compact cardRef={whyRef} lead={selectedLead} onCheck={enrichOneLead} checking={enriching[selectedLead.id]} onDraft={openDraft} />
          : (
            <div className="card why-compact" aria-label="Why this lead" ref={whyRef}>
              <div className="eyebrow">Why this lead?</div>
              <p className="hint">Select a lead in the table below to see exactly how its score was worked out and what the web check found.</p>
              <div className="meter"><div className="meter-h">Need<span>would they benefit?</span></div><p className="hint" style={{ margin: 0 }}>No website <b>+8</b> · freemail email <b>+25</b> · industry <b>+6 to +14</b> · live site <b>−15</b></p></div>
              <div className="meter"><div className="meter-h">Reach<span>will they see it?</span></div><p className="hint" style={{ margin: 0 }}>Company email <b>+5</b> · director on the company domain <b>+15</b> · several directors up to <b>+6</b></p></div>
              <div className="meter"><div className="meter-h">Region<span>your call</span></div><p className="hint" style={{ margin: 0 }}>Preferred region <b>+10</b></p></div>
            </div>
          )}
      </div>

      <div className="card flush mt16">
        <div className="card-pad">
          <div className="row between">
            <div className="row"><h2 className="card-title">Ranked leads</h2><span className="tag grey">{leads.length} saved</span></div>
            <div className="row">
              <button className="btn sm" onClick={exportCSV}><Download size={13} /> Export CSV</button>
              <button className="btn sm" onClick={exportXLSX}><Download size={13} /> Export Excel</button>
            </div>
          </div>
          <div className="row mt12">
            <div className="search"><Search size={15} /><input type="search" placeholder="Search business name…" aria-label="Search leads" value={filters.search} onChange={set('search')} /></div>
            <select style={{ width: 'auto' }} aria-label="Date added" value={filters.added} onChange={set('added')}>
              {ADDED_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <select style={{ width: 'auto' }} aria-label="Status" value={filters.status} onChange={set('status')}>
              {STATUS_CHOICES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <select style={{ width: 'auto' }} aria-label="Industry" value={filters.industry} onChange={set('industry')}>
              <option value="">All industries</option>{industries.map(i => <option key={i} value={i}>{i.length > 40 ? i.slice(0, 38) + '…' : i}</option>)}
            </select>
            <select style={{ width: 'auto' }} aria-label="State" value={filters.state} onChange={set('state')}>
              <option value="">All states</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="small row" style={{ gap: 6 }}>Min score
              <input className="input-sm" type="number" value={filters.minScore} aria-label="Minimum score" onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value) || 0 }))} />
            </label>
            <label className="small row" style={{ gap: 6 }}>Sort
              <select style={{ width: 'auto' }} aria-label="Sort order" value={filters.sort} onChange={set('sort')}>
                {SORT_CHOICES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            {filtersActive && <button className="btn link sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button>}
            <span className="small faint grow" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{filteredSorted.length} shown · {byDate ? 'newest first, then best score' : 'best score first'}</span>
          </div>
        </div>

        {filteredSorted.length === 0 ? (
          leads.length === 0
            ? <Empty title="No leads yet" sub="Upload today's file to get a prioritized list." />
            : <Empty title="No leads match these filters" sub="Try a different date range or status.">
                <button className="btn sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button>
              </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Score</th><th>Business</th><th className={addedColClass}>Added</th><th>Contact</th><th>Website</th><th>Actions</th></tr></thead>
                <tbody>
                  {page.map((l, i) => {
                    const c = recommendContact(l);
                    const addr = c.primary ? c.primary.addr : (c.fallback ? c.fallback.addr : '—');
                    const sel = selectedLead && selectedLead.id === l.id;
                    const site = l.web_findings && l.web_findings.website;
                    const day = addedDay(l);
                    const newDay = byDate && (i === 0 || addedDay(page[i - 1]) !== day);
                    const at = addedAt(l);
                    return (
                      <React.Fragment key={l.id}>
                        {newDay && (
                          <tr className="day-row"><th colSpan={6} scope="colgroup">{dayLabel(day, now)} <span className="faint">· {perDay.get(day)} lead{perDay.get(day) === 1 ? '' : 's'}</span></th></tr>
                        )}
                        <tr className={`click${sel ? ' sel' : ''}`} onClick={() => pick(l.id)}>
                          <td><ScorePill score={l.priority_score} /></td>
                          <td className="biz-cell">
                            <div className="biz">{l.name}</div>
                            <div className="sub">{[l.nic_label && l.nic_label.length > 30 ? l.nic_label.slice(0, 28) + '…' : l.nic_label, [l.district, l.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
                            {l.stakeholder_name && <div className="sub">Director: {l.stakeholder_name}</div>}
                          </td>
                          <td className={`small dim ${addedColClass}`} style={{ whiteSpace: 'nowrap' }} title={at != null ? new Date(at).toLocaleString() : ''}>{at != null ? dayLabel(day, now) : '—'}</td>
                          <td><div className="mono small">{addr}</div><div className="sub">{c.primary ? 'Company email' : c.fallback ? 'Director email' : 'No email'}</div></td>
                          <td>
                            <span className={`web-s ${websiteTone(l.website_status)}`}>{l.website_status || 'Unknown'}</span>
                            {site && <div className="sub" onClick={e => e.stopPropagation()}><SafeLink url={site.url}>{site.confidence === 'confirmed_own_domain' ? 'site' : 'possible site'}</SafeLink></div>}
                            {!l.web_checked_at && (
                              <div className="sub"><button className="btn link sm" style={{ padding: '0 2px' }} disabled={enriching[l.id]}
                                onClick={e => { e.stopPropagation(); enrichOneLead(l); }}>{enriching[l.id] ? <Spinner size={11} /> : 'Check'}</button></div>
                            )}
                          </td>
                          <td>
                            <span className="row" style={{ gap: 4, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                              <button className="btn link sm" onClick={e => { e.stopPropagation(); pick(l.id); }}>Why?</button>
                              <button className={`btn sm${sel ? ' primary' : ''}`} onClick={e => { e.stopPropagation(); openDraft(l); }}>{isActioned(l) ? 'Sent' : 'Draft'}</button>
                            </span>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={uploadPage} setPage={setUploadPage} total={filteredSorted.length} pageSize={PAGE_SIZE} />
          </>
        )}
      </div>
    </>
  );
}
