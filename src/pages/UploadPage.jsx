import React, { useState } from 'react';
import { FileSpreadsheet, Upload, Download, Search, CheckCircle2, Play, Square } from 'lucide-react';
import { PageHeader, ScorePill, Pager, Empty, Spinner, Switch } from '../components/ui';
import WhyPanel, { websiteTone } from '../components/LeadPanel';
import { recommendContact } from '../lib/scoring';
import { SafeLink } from '../components/ui';

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
  const page = filteredSorted.slice(uploadPage * PAGE_SIZE, uploadPage * PAGE_SIZE + PAGE_SIZE);
  const checkedCount = leads.length - uncheckedLeads.length;

  return (
    <>
      <PageHeader title="Upload & Prioritize" sub="Find the businesses that need you most. Start with today's best opportunities." />

      <div className="grid g-top">
        <div className="card">
          <h2 className="card-title">Upload today's list</h2>
          <p className="card-sub">Import an Excel file. Already-saved businesses are automatically skipped — safe to re-upload.</p>
          <div className={`drop${dragOver ? ' over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}>
            <div className="drop-ico"><FileSpreadsheet size={20} /></div>
            <div className="grow">
              <div className="drop-t">Drop your spreadsheet here, or browse</div>
              <div className="small faint">.xlsx or .xls · business, location and contact details</div>
            </div>
            <label className="btn" style={{ cursor: 'pointer' }}>
              <Upload size={15} /> Choose file
              <input type="file" accept=".xlsx,.xls" aria-label="Choose spreadsheet" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            </label>
          </div>
          {uploadStatus && <div className="upload-status" role="status"><CheckCircle2 size={15} /><span>{uploadStatus}</span></div>}
        </div>

        <div className="card">
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
          <div className="card-split" style={{ paddingTop: 14 }}>
            <div className="row between">
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
      </div>

      <div className="grid g-main-side mt16">
        <div className="card flush">
          <div className="card-pad">
            <div className="row between">
              <div className="row"><h2 className="card-title">Ranked leads</h2><span className="tag grey">{leads.length} saved</span></div>
              <div className="row">
                <button className="btn sm" onClick={exportCSV}><Download size={13} /> Export CSV</button>
                <button className="btn sm" onClick={exportXLSX}><Download size={13} /> Export Excel</button>
              </div>
            </div>
            <div className="row mt12">
              <div className="search"><Search size={15} /><input type="search" placeholder="Search business name…" aria-label="Search leads" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /></div>
              <select style={{ width: 'auto' }} aria-label="Industry" value={filters.industry} onChange={e => setFilters(f => ({ ...f, industry: e.target.value }))}>
                <option value="">All industries</option>{industries.map(i => <option key={i} value={i}>{i.length > 40 ? i.slice(0, 38) + '…' : i}</option>)}
              </select>
              <select style={{ width: 'auto' }} aria-label="State" value={filters.state} onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}>
                <option value="">All states</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="small row" style={{ gap: 6 }}>Min score
                <input className="input-sm" type="number" value={filters.minScore} aria-label="Minimum score" onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value) || 0 }))} />
              </label>
              <span className="small faint grow" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{filteredSorted.length} shown · best first</span>
            </div>
          </div>

          {filteredSorted.length === 0 ? <Empty title="No leads yet" sub="Upload today's file to get a prioritized list." /> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Score</th><th>Business</th><th>Contact</th><th>Website</th><th>Actions</th></tr></thead>
                  <tbody>
                    {page.map(l => {
                      const c = recommendContact(l);
                      const addr = c.primary ? c.primary.addr : (c.fallback ? c.fallback.addr : '—');
                      const sel = selectedLead && selectedLead.id === l.id;
                      const site = l.web_findings && l.web_findings.website;
                      return (
                        <tr key={l.id} className={`click${sel ? ' sel' : ''}`} onClick={() => setSelectedId(l.id)}>
                          <td><ScorePill score={l.priority_score} /></td>
                          <td className="biz-cell">
                            <div className="biz">{l.name}</div>
                            <div className="sub">{[l.nic_label && l.nic_label.length > 30 ? l.nic_label.slice(0, 28) + '…' : l.nic_label, [l.district, l.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
                            {l.stakeholder_name && <div className="sub">Director: {l.stakeholder_name}</div>}
                          </td>
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
                              <button className="btn link sm" onClick={e => { e.stopPropagation(); setSelectedId(l.id); }}>Why?</button>
                              <button className={`btn sm${sel ? ' primary' : ''}`} onClick={e => { e.stopPropagation(); openDraft(l); }}>Draft</button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={uploadPage} setPage={setUploadPage} total={filteredSorted.length} pageSize={PAGE_SIZE} />
            </>
          )}
        </div>

        {selectedLead
          ? <WhyPanel lead={selectedLead} onCheck={enrichOneLead} checking={enriching[selectedLead.id]} onDraft={openDraft} />
          : (
            <div className="card">
              <div className="eyebrow">Why this lead?</div>
              <p className="hint">Select a lead in the list to see exactly how its score was worked out and what the web check found.</p>
              <div className="meter"><div className="meter-h">Need<span>would they benefit?</span></div><p className="hint" style={{ margin: 0 }}>No website <b>+8</b> · freemail email <b>+25</b> · industry <b>+6 to +14</b> · live site <b>−15</b></p></div>
              <div className="meter"><div className="meter-h">Reach<span>will they see it?</span></div><p className="hint" style={{ margin: 0 }}>Company email <b>+5</b> · director on the company domain <b>+15</b> · several directors up to <b>+6</b></p></div>
              <div className="meter"><div className="meter-h">Region<span>your call</span></div><p className="hint" style={{ margin: 0 }}>Preferred region <b>+10</b></p></div>
            </div>
          )}
      </div>
    </>
  );
}
