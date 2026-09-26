import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Upload, Mail, TrendingUp, ClipboardList, Search, Loader2, Check, Download } from 'lucide-react';

import { parseWorkbookRows, scoreLead, recommendContact, computeStatus, isClient } from './lib/scoring';
import { generateDraft } from './lib/drafting';
import { sendViaGmail } from './lib/sending';
import { refineSelection } from './lib/refining';
import { fetchReferences } from './lib/references';
import { computeInsightsData } from './lib/insights';
import { exportInsightsXLSX, exportInsightsPDF, exportInsightsPPTX, exportInsightsDOCX } from './lib/exports';
import GmailConnect from './components/GmailConnect';
import {
  fetchLeads, upsertNewLeads, updateLeadDraft, updateLeadScore,
  fetchOutcomes, saveOutcome,
  fetchSenderProfile, saveSenderProfile,
} from './lib/db';
import { CSS } from './styles';

// This App keeps the same four-tab UX as the prototype, but every read/write
// goes through db.js (Supabase) instead of browser storage. Leads carry an
// `outcome` object assembled from the outcomes table for convenient rendering.

const CHART_COLORS = ['#2F6F62', '#C4622D', '#7A8B87', '#B0361F', '#9CC7BD', '#E8B084'];
const REASONS = ['Price too high', 'No response', 'Chose competitor', 'Timing / not ready', 'Other'];

// Single computed pipeline status, derived from the granular outcome
// fields rather than stored separately — keeps one source of truth so
// the badge can never drift out of sync with the underlying data.
function StatusBadge({ lead }) {
  const s = computeStatus(lead);
  return <span className={`status-badge status-${s.tone}`}>{s.label}</span>;
}

function Pager({ page, setPage, total, pageSize }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  return (
    <div className="pager">
      <button className="btn-tiny" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Previous</button>
      <span className="hint" style={{ margin: 0 }}>{start}-{end} of {total} (page {page + 1} of {totalPages})</span>
      <button className="btn-tiny" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
    </div>
  );
}
function ScorePill({ score }) {
  const tone = score >= 60 ? 'hi' : score >= 35 ? 'mid' : 'lo';
  return <span className={`pill pill-${tone}`}>{score}</span>;
}
function Empty({ title, sub }) {
  return <div className="empty"><div className="empty-title">{title}</div><div className="empty-sub">{sub}</div></div>;
}
function ScoreBreakdown({ lead }) {
  const groups = { Need: [], Reach: [], Region: [] };
  (lead.score_breakdown || []).forEach(b => { (groups[b.group] || (groups[b.group] = [])).push(b); });
  return (
    <div className="breakdown">
      <div className="breakdown-total">
        Priority {lead.priority_score} = Need {lead.need_score} + Reach {lead.reach_score}{lead.region_bonus ? ` + Region ${lead.region_bonus}` : ''}
      </div>
      {['Need', 'Reach', 'Region'].map(g => (groups[g] && groups[g].length > 0) && (
        <div key={g} className="breakdown-group">
          <span className="breakdown-glabel">{g}</span>
          {groups[g].map((b, i) => (
            <div key={i} className="breakdown-line">
              <span className={`breakdown-pts ${b.points < 0 ? 'neg' : ''}`}>{b.points > 0 ? '+' : ''}{b.points}</span>
              <span className="breakdown-why">{b.why}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Owns its own local buffer for the body text so typing/selecting feels
// instant, independent of the parent's Supabase round-trips. Resets
// whenever a different lead is selected, or a full regenerate produces a
// new generatedAt timestamp.
function DraftDetail({ lead, generating, sending, onRegenerate, onSendGmail, onMarkSent, onBodyUpdated, copy }) {
  const [bodyText, setBodyText] = useState(lead.draft.body);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBodyText(lead.draft.body);
    setDirty(false);
    setSelStart(0);
    setSelEnd(0);
    setInstruction('');
  }, [lead.id, lead.draft?.generatedAt]);

  const handleSelect = (e) => {
    setSelStart(e.target.selectionStart);
    setSelEnd(e.target.selectionEnd);
  };
  const hasSelection = selEnd > selStart;
  const locked = !!lead.outcome.contacted;

  const saveEdit = async () => {
    setSaving(true);
    try { await onBodyUpdated(lead, bodyText); setDirty(false); }
    finally { setSaving(false); }
  };

  const doRewrite = async () => {
    const selectedText = bodyText.slice(selStart, selEnd);
    if (!selectedText.trim()) return;
    setRefining(true);
    try {
      const replacement = await refineSelection({ fullBody: bodyText, selectedText, instruction, lead });
      const newBody = bodyText.slice(0, selStart) + replacement.trim() + bodyText.slice(selEnd);
      setBodyText(newBody);
      await onBodyUpdated(lead, newBody);
      setDirty(false);
      setSelStart(0);
      setSelEnd(0);
      setInstruction('');
    } catch (e) {
      alert('Rewrite failed: ' + e.message);
    } finally {
      setRefining(false);
    }
  };

  return (
    <div>
      <div className="row-between"><div className="biz-name" style={{ fontSize: 17 }}>{lead.name}</div><ScorePill score={lead.priority_score} /></div>
      <div className="dim" style={{ marginBottom: 12 }}>{lead.nic_label} · {lead.district}, {lead.state}</div>
      <ScoreBreakdown lead={lead} />
      <ul className="evals" style={{ marginTop: 14 }}>{(lead.draft.evaluation || []).map((e, i) => <li key={i}>{e}</li>)}</ul>

      {lead.draft.sources && lead.draft.sources.length > 0 && (
        <div className="sources-box">
          <div className="sources-label">Sources used in this draft</div>
          <ul className="sources-list">{lead.draft.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      <div className="out-box"><div className="label"><span>Subject</span><button className="copy-btn" onClick={() => copy(lead.draft.subject)}>Copy</button></div><div className="subject-text">{lead.draft.subject}</div></div>

      <div className="out-box">
        <div className="label">
          <span>Body{dirty && <em style={{ color: 'var(--rust)', fontStyle: 'normal' }}> · unsaved edit</em>}</span>
          <button className="copy-btn" onClick={() => copy(bodyText)}>Copy</button>
        </div>
        <textarea
          className="body-editable"
          value={bodyText}
          disabled={locked}
          onChange={(e) => { setBodyText(e.target.value); setDirty(true); }}
          onSelect={handleSelect}
          onMouseUp={handleSelect}
          onKeyUp={handleSelect}
        />
      </div>

      {!locked && (
        <div className="refine-bar">
          <input
            type="text"
            placeholder={hasSelection ? `Optional instruction for: "${bodyText.slice(selStart, selEnd).slice(0, 36)}${selEnd - selStart > 36 ? '…' : ''}"` : 'Select text in the body above to rewrite just that part'}
            value={instruction}
            disabled={!hasSelection}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <button className="btn-tiny" disabled={!hasSelection || refining} onClick={doRewrite}>
            {refining ? <Loader2 className="spin" size={12} /> : 'Rewrite selection'}
          </button>
        </div>
      )}

      {dirty && !locked && (
        <button className="btn-tiny" style={{ marginTop: 8 }} disabled={saving} onClick={saveEdit}>
          {saving ? <Loader2 className="spin" size={12} /> : 'Save edit'}
        </button>
      )}

      <div className="row-inline" style={{ marginTop: 14 }}>
        <button className="btn-tiny" onClick={() => copy(`Subject: ${lead.draft.subject}\n\n${bodyText}`)}>Copy both</button>
        {!locked && (
          <button className="btn-tiny" disabled={generating || dirty} title={dirty ? 'Save or discard your edit first' : ''} onClick={() => onRegenerate(lead)}>
            {generating ? <Loader2 className="spin" size={12} /> : 'Regenerate (full)'}
          </button>
        )}
      </div>

      {!locked && <GmailConnect />}

      <div className="row-inline" style={{ marginTop: 10 }}>
        {!locked ? (
          <>
            <button className="btn-primary" disabled={sending || dirty} title={dirty ? 'Save your edit before sending' : ''} onClick={() => onSendGmail(lead)}>
              {sending ? <Loader2 className="spin" size={13} /> : <Check size={13} />} Send via Gmail
            </button>
            <button className="btn-tiny" disabled={dirty} title={dirty ? 'Save your edit before sending' : ''} onClick={() => onMarkSent(lead)}>Sent manually — just mark it</button>
          </>
        ) : <span className="tag verified">Sent {lead.outcome.contacted_date}{lead.outcome.sent_via_gmail ? ' (Gmail)' : ''}</span>}
      </div>
      {dirty && !locked && <div className="hint" style={{ marginTop: 6 }}>Save your edit before sending, so the wording that's sent matches what gets recorded for insights.</div>}
      {locked && (
        <div className="hint" style={{ marginTop: 8 }}>Locked — this exact wording was sent and is preserved for insights. Regenerating is disabled after send.</div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('upload');
  const [leads, setLeads] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [sender, setSender] = useState({});
  const [referenceUrlsInput, setReferenceUrlsInput] = useState('');
  const [fetchingRefs, setFetchingRefs] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState('');
  const [preferredRegionsInput, setPreferredRegionsInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [filters, setFilters] = useState({ search: '', industry: '', state: '', minScore: 0 });
  const [outcomeSearch, setOutcomeSearch] = useState('');
  const [outcomeStatusFilter, setOutcomeStatusFilter] = useState('');
  const PAGE_SIZE = 100;
  const [uploadPage, setUploadPage] = useState(0);
  const [outcomePage, setOutcomePage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [generating, setGenerating] = useState({});
  const [batchN, setBatchN] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [outcomeDraft, setOutcomeDraft] = useState({});
  const [expanded, setExpanded] = useState(null);

  const preferredRegions = useMemo(
    () => preferredRegionsInput.split(',').map(s => s.trim()).filter(Boolean),
    [preferredRegionsInput]
  );

  // Load leads + outcomes + sender profile from Supabase, merge outcome onto each lead.
  const reload = useCallback(async () => {
    try {
      const [leadRows, outcomeRows] = await Promise.all([fetchLeads(), fetchOutcomes()]);
      const byLead = new Map(outcomeRows.map(o => [o.lead_id, o]));
      setLeads(leadRows.map(l => ({ ...l, outcome: byLead.get(l.id) || {} })));
    } catch (e) {
      console.error('Failed to load leads/outcomes:', e);
    }
    try {
      const profile = await fetchSenderProfile();
      if (profile) {
        setSender({ name: profile.name, offer: profile.offer, tone: profile.tone, voiceSample: profile.voice_sample, referenceNotes: profile.reference_notes || [] });
        setReferenceUrlsInput((profile.reference_urls || []).join('\n'));
      }
    } catch (e) {
      console.error('Failed to load sender profile — has supabase/sender_profile_schema.sql been run yet?', e);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Instant local update while typing — no per-keystroke network write.
  const updateSenderField = (patch) => setSender(s => ({ ...s, ...patch }));

  // Explicit save: persists name/offer/tone/voice sample, and — if
  // reference URLs are present — re-fetches and re-caches their text via
  // the fetch-references function (server-side, not per-draft).
  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileStatus('');
    try {
      const urls = referenceUrlsInput.split('\n').map(u => u.trim()).filter(Boolean).slice(0, 5);
      let referenceNotes = [];
      if (urls.length) {
        setFetchingRefs(true);
        try { referenceNotes = await fetchReferences(urls); }
        finally { setFetchingRefs(false); }
      }
      const nextSender = { ...sender, referenceNotes };
      setSender(nextSender);
      await saveSenderProfile({
        name: nextSender.name || '',
        offer: nextSender.offer || '',
        tone: nextSender.tone || '',
        voice_sample: nextSender.voiceSample || '',
        reference_urls: urls,
        reference_notes: referenceNotes,
      });
      setProfileStatus('Saved.');
    } catch (e) {
      setProfileStatus('Save failed: ' + e.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('Reading file…');
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const parsed = parseWorkbookRows(rows);
        const scored = parsed.map(en => scoreLead(en, preferredRegions));
        const { inserted, skipped } = await upsertNewLeads(scored);
        setUploadStatus(`Loaded ${parsed.length} businesses (${rows.length} rows deduped). ${inserted} new, ${skipped} already saved.`);
        await reload();
      } catch (err) {
        console.error(err);
        setUploadStatus('Could not read/save that file — check the columns and that you are signed in.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, [preferredRegions, reload]);

  const [rescoring, setRescoring] = useState(false);
  const [rescoreProgress, setRescoreProgress] = useState({ done: 0, total: 0 });
  const [rescoreStatus, setRescoreStatus] = useState('');

  // Scoring normally happens once, at upload time, and is permanently
  // saved — so changing "preferred regions" (or any future scoring
  // input) never touches leads already in the database on its own. This
  // is the explicit, on-demand action that applies the CURRENT scoring
  // inputs to every already-saved lead.
  const rescoreAllLeads = async () => {
    setRescoring(true);
    setRescoreStatus('');
    setRescoreProgress({ done: 0, total: leads.length });
    try {
      const updated = [];
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const rescored = scoreLead(lead, preferredRegions);
        const patch = {
          need_score: rescored.need_score,
          reach_score: rescored.reach_score,
          region_bonus: rescored.region_bonus,
          priority_score: rescored.priority_score,
          score_breakdown: rescored.score_breakdown,
        };
        await updateLeadScore(lead.id, patch);
        updated.push({ ...lead, ...patch });
        setRescoreProgress({ done: i + 1, total: leads.length });
      }
      setLeads(updated);
      setRescoreStatus(`Re-scored ${updated.length} lead${updated.length === 1 ? '' : 's'} with your current preferred regions.`);
    } catch (e) {
      setRescoreStatus('Re-score failed: ' + e.message);
    } finally {
      setRescoring(false);
    }
  };

  const runDraft = async (lead) => {
    setGenerating(g => ({ ...g, [lead.id]: true }));
    try {
      const draft = await generateDraft(lead, sender);
      await updateLeadDraft(lead.id, draft);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, draft } : l));
    } catch (e) { console.error(e); }
    finally { setGenerating(g => ({ ...g, [lead.id]: false })); }
  };

  // Used for both manual body edits and selective-rewrite splices —
  // keeps subject/evaluation/sources, only replaces body.
  const updateDraftBody = async (lead, newBody) => {
    const newDraft = { ...lead.draft, body: newBody };
    await updateLeadDraft(lead.id, newDraft);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, draft: newDraft } : l));
  };

  const runBatch = async () => {
    const candidates = [...leads].filter(l => !l.draft).sort((a, b) => b.priority_score - a.priority_score).slice(0, batchN);
    if (!candidates.length) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: candidates.length });
    for (let i = 0; i < candidates.length; i++) {
      try {
        const draft = await generateDraft(candidates[i], sender);
        await updateLeadDraft(candidates[i].id, draft);
        setLeads(prev => prev.map(l => l.id === candidates[i].id ? { ...l, draft } : l));
      } catch (e) { /* skip failed, continue */ }
      setBatchProgress({ done: i + 1, total: candidates.length });
    }
    setBatchRunning(false);
  };

  const markSent = async (lead) => {
    const outcome = {
      ...lead.outcome,
      contacted: true,
      contacted_date: new Date().toISOString().slice(0, 10),
      sent_subject: lead.draft?.subject,
      sent_body: lead.draft?.body,
      sent_sources: lead.draft?.sources || [],
    };
    await saveOutcome(lead.id, outcome);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, outcome } : l));
  };

  const [sending, setSending] = useState({});
  const sendNow = async (lead) => {
    setSending(s => ({ ...s, [lead.id]: true }));
    try {
      await sendViaGmail(lead);
      setLeads(prev => prev.map(l => l.id === lead.id
        ? { ...l, outcome: { ...l.outcome, contacted: true, contacted_date: new Date().toISOString().slice(0, 10), sent_via_gmail: true, sent_subject: lead.draft.subject, sent_body: lead.draft.body, sent_sources: lead.draft.sources || [] } }
        : l));
    } catch (e) {
      alert('Send failed: ' + e.message);
    } finally {
      setSending(s => ({ ...s, [lead.id]: false }));
    }
  };

  const saveOutcomeRow = async (lead, outcome) => {
    // A lead is "contacted" if it was sent through the tool (Drafts tab),
    // OR if you're recording that it replied / progressed / paid —
    // logically there can't be a reply or a conversion without having
    // reached out first, even if that reach-out happened outside the
    // tool. A bare note or a quoted price alone still does NOT imply
    // contact — only real pipeline-progress signals do.
    const impliedContacted = !!(outcome.replied || outcome.proposal_sent || outcome.materialized || outcome.payment_received);
    const merged = { ...outcome, contacted: lead.outcome?.contacted || impliedContacted };
    await saveOutcome(lead.id, merged);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, outcome: merged } : l));
  };

  const filteredSorted = useMemo(() => leads
    .filter(l => {
      if (filters.search && !l.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.industry && l.nic_label !== filters.industry) return false;
      if (filters.state && l.state !== filters.state) return false;
      if (l.priority_score < filters.minScore) return false;
      return true;
    })
    .sort((a, b) => b.priority_score - a.priority_score), [leads, filters]);
  useEffect(() => { setUploadPage(0); }, [filters]);

  const industries = useMemo(() => [...new Set(leads.map(l => l.nic_label).filter(Boolean))].sort(), [leads]);
  const states = useMemo(() => [...new Set(leads.map(l => l.state).filter(Boolean))].sort(), [leads]);
  const selectedLead = leads.find(l => l.id === selectedId) || null;

  useEffect(() => { if (selectedLead) setOutcomeDraft(selectedLead.outcome || {}); }, [selectedId]); // eslint-disable-line

  const exportCSV = () => {
    const headers = ['Business Name', 'Industry', 'District', 'State', 'Priority Score', 'Recommended Contact', 'Website Status'];
    const lines = [headers.join(',')];
    filteredSorted.forEach(l => {
      const c = recommendContact(l);
      const addr = c.primary ? c.primary.addr : (c.fallback ? c.fallback.addr : '');
      lines.push([l.name, l.nic_label, l.district, l.state, l.priority_score, addr, l.website_status]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prioritized-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // Excel export — richer than CSV (proper column widths, a second sheet
  // for pipeline/outcome status), using the xlsx library already used for import.
  const exportXLSX = () => {
    const leadRows = filteredSorted.map(l => {
      const c = recommendContact(l);
      const addr = c.primary ? c.primary.addr : (c.fallback ? c.fallback.addr : '');
      return {
        'Business Name': l.name, 'Industry': l.nic_label, 'District': l.district, 'State': l.state,
        'Priority Score': l.priority_score, 'Need Score': l.need_score, 'Reach Score': l.reach_score,
        'Recommended Contact': addr, 'Website Status': l.website_status, 'Status': computeStatus(l).label,
      };
    });
    // Every lead, with an Entity ID column — this sheet is designed to be
    // edited in Excel and re-uploaded via "Import outcomes" on the Track
    // Outcomes tab, so blank rows for untouched leads are intentional.
    const outcomeRows = leads.map(l => ({
      'Entity ID': l.entity_id,
      'Business Name': l.name,
      'Status': computeStatus(l).label,
      'Contacted': l.outcome?.contacted ? 'Yes' : '',
      'Contacted Date': l.outcome?.contacted_date || '',
      'Replied': l.outcome?.replied ? 'Yes' : '',
      'Response Type': l.outcome?.response_type || '',
      'Proposal Sent': l.outcome?.proposal_sent ? 'Yes' : '',
      'Quoted Price': l.outcome?.quoted_price || '',
      'Materialized (Client)': l.outcome?.materialized ? 'Yes' : '',
      'Reason Not Proceeded': l.outcome?.not_proceeded_reason || '',
      'Payment Received': l.outcome?.payment_received ? 'Yes' : '',
      'Final Amount': l.outcome?.final_amount || '',
      'Notes': l.outcome?.notes || '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leadRows), 'Leads');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outcomeRows), 'Outcomes');
    XLSX.writeFile(wb, `outreach-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // --- Import outcomes back in from an edited export -----------------------
  const [importStatus, setImportStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const OUTCOME_COLS = ['Contacted', 'Contacted Date', 'Replied', 'Response Type', 'Proposal Sent', 'Quoted Price', 'Materialized (Client)', 'Reason Not Proceeded', 'Payment Received', 'Final Amount', 'Notes'];
  const truthy = (v) => ['yes', 'y', 'true', '1'].includes(String(v ?? '').trim().toLowerCase());

  const handleImportOutcomes = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Reading file…');
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'outcomes');
        if (!sheetName) {
          setImportStatus('No "Outcomes" sheet found — use a file exported from this tool (Export Excel on the Upload tab).');
          setImporting(false);
          return;
        }
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
        const byEntityId = new Map(leads.map(l => [String(l.entity_id), l]));
        let updated = 0, noMatch = 0, blank = 0;
        for (const row of rows) {
          const entityId = String(row['Entity ID'] || '').trim();
          const lead = byEntityId.get(entityId);
          if (!lead) { noMatch++; continue; }
          const hasAnyData = OUTCOME_COLS.some(k => String(row[k] ?? '').trim() !== '');
          if (!hasAnyData) { blank++; continue; }
          const replied = truthy(row['Replied']);
          const proposalSent = truthy(row['Proposal Sent']);
          const materialized = truthy(row['Materialized (Client)']);
          const paymentReceived = truthy(row['Payment Received']);
          // Same logic as the manual form: a reply/proposal/conversion/payment
          // implies contact even if the "Contacted" column itself was left blank.
          const impliedContacted = replied || proposalSent || materialized || paymentReceived;
          const outcome = {
            contacted: truthy(row['Contacted']) || !!lead.outcome?.contacted || impliedContacted,
            contacted_date: row['Contacted Date'] || lead.outcome?.contacted_date || null,
            replied,
            response_type: row['Response Type'] || null,
            proposal_sent: proposalSent,
            quoted_price: row['Quoted Price'] || null,
            materialized,
            not_proceeded_reason: row['Reason Not Proceeded'] || null,
            payment_received: paymentReceived,
            final_amount: row['Final Amount'] || null,
            notes: row['Notes'] || '',
            sent_subject: lead.outcome?.sent_subject, sent_body: lead.outcome?.sent_body, sent_sources: lead.outcome?.sent_sources,
          };
          await saveOutcome(lead.id, outcome);
          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, outcome } : l));
          updated++;
        }
        setImportStatus(`Updated ${updated} lead${updated === 1 ? '' : 's'}.${noMatch ? ` ${noMatch} row(s) had no matching Entity ID.` : ''}`);
      } catch (err) {
        console.error(err);
        setImportStatus('Could not read that file — make sure it has an "Outcomes" sheet with an "Entity ID" column.');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ---- Insights aggregation --------------------------------------------
  const withOutcome = leads.filter(l => l.outcome && l.outcome.contacted);

  const outcomeTabLeads = useMemo(() => {
    return [...leads]
      .filter(l => {
        if (outcomeSearch && !l.name.toLowerCase().includes(outcomeSearch.toLowerCase())) return false;
        if (outcomeStatusFilter && computeStatus(l).tone !== outcomeStatusFilter) return false;
        return true;
      })
      .sort((a, b) => b.priority_score - a.priority_score);
  }, [leads, outcomeSearch, outcomeStatusFilter]);
  useEffect(() => { setOutcomePage(0); }, [outcomeSearch, outcomeStatusFilter]);
  const insightsReady = withOutcome.length >= 3;

  const [insightsFilters, setInsightsFilters] = useState({ industry: '', state: '', dateFrom: '', dateTo: '' });
  const insightsData = useMemo(() => computeInsightsData(leads, insightsFilters), [leads, insightsFilters]);
  const [exportingFormat, setExportingFormat] = useState('');
  const runExport = async (format) => {
    setExportingFormat(format);
    try {
      if (format === 'xlsx') exportInsightsXLSX(insightsData);
      else if (format === 'pdf') exportInsightsPDF(insightsData);
      else if (format === 'pptx') await exportInsightsPPTX(insightsData);
      else if (format === 'docx') await exportInsightsDOCX(insightsData);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExportingFormat('');
    }
  };

  const copy = (t) => navigator.clipboard.writeText(t);

  return (
    <div className="app">
      <style>{CSS}</style>
      <header className="topbar">
        <div>
          <div className="eyebrow">Daily outreach command center</div>
          <h1>Lead Prioritization &amp; Outreach</h1>
        </div>
        <nav className="tabs">
          <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}><Upload size={14} /> Upload &amp; Prioritize</button>
          <button className={tab === 'drafts' ? 'active' : ''} onClick={() => setTab('drafts')}><Mail size={14} /> Drafts</button>
          <button className={tab === 'outcomes' ? 'active' : ''} onClick={() => setTab('outcomes')}><ClipboardList size={14} /> Track Outcomes</button>
          <button className={tab === 'insights' ? 'active' : ''} onClick={() => setTab('insights')}><TrendingUp size={14} /> Insights</button>
        </nav>
      </header>

      {!loaded ? <div className="empty"><Loader2 className="spin" size={18} /> Loading your saved leads…</div> : (
        <>
          {/* UPLOAD ---------------------------------------------------- */}
          {tab === 'upload' && (
            <div className="grid-main">
              <div className="card">
                <h2>Upload today's list</h2>
                <p className="hint">Same columns as before. Already-saved businesses are skipped automatically — safe to re-upload.</p>
                <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
                {uploadStatus && <div className="status-line">{uploadStatus}</div>}
                <div className="field-row" style={{ marginTop: 16 }}>
                  <label>Preferred regions <span className="opt">(comma-separated — gives matching states a bonus)</span></label>
                  <input type="text" value={preferredRegionsInput} onChange={e => setPreferredRegionsInput(e.target.value)} placeholder="e.g. Kerala, Karnataka" />
                </div>
                <p className="hint">Only applies automatically to leads you upload from now on. Changed this and want it to apply to leads already saved?</p>
                <button className="btn-tiny" disabled={rescoring || !leads.length} onClick={rescoreAllLeads}>
                  {rescoring ? <><Loader2 className="spin" size={12} /> Re-scoring {rescoreProgress.done}/{rescoreProgress.total}…</> : `Re-score all ${leads.length} saved leads now`}
                </button>
                {rescoreStatus && <div className="status-line">{rescoreStatus}</div>}
              </div>

              <div>
                <div className="card infopanel" style={{ marginBottom: 18 }}>
                  <h2>How leads get prioritized</h2>
                  <p className="hint">Every score is the sum of transparent, hand-tunable parts. Click <b>Why?</b> on a row to see the exact breakdown.</p>
                  <div className="how-grid">
                    <div><div className="how-h">Need — would they benefit?</div><ul className="how-list"><li>Freemail email <b>+25</b> · custom <b>+5</b></li><li>Industry <b>+6 to +14</b></li><li>Above min. capital <b>+10</b></li><li>No site <b>+8</b> · live site <b>-15</b></li></ul></div>
                    <div><div className="how-h">Reach — will they see it?</div><ul className="how-list"><li>Company email <b>+5</b></li><li>Director on domain <b>+15</b></li><li>Multiple directors <b>up to +6</b></li></ul></div>
                    <div><div className="how-h">Region — your call</div><ul className="how-list"><li>Preferred region <b>+10</b></li></ul></div>
                  </div>
                </div>

                <div className="card">
                  <div className="row-between">
                    <h2>Prioritized list — {leads.length} saved</h2>
                    <button className="btn-ghost" onClick={exportCSV}><Download size={13} /> Export CSV</button>
                    <button className="btn-ghost" onClick={exportXLSX} style={{ marginLeft: 8 }}><Download size={13} /> Export Excel</button>
                  </div>
                  <div className="filters">
                    <div className="search-box"><Search size={14} /><input placeholder="Search name…" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /></div>
                    <select value={filters.industry} onChange={e => setFilters(f => ({ ...f, industry: e.target.value }))}>
                      <option value="">All industries</option>{industries.map(i => <option key={i} value={i}>{i.length > 40 ? i.slice(0, 38) + '…' : i}</option>)}
                    </select>
                    <select value={filters.state} onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}>
                      <option value="">All states</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <label className="minscore">Min<input type="number" value={filters.minScore} onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value) || 0 }))} style={{ width: 56 }} /></label>
                  </div>
                  {filteredSorted.length === 0 ? <Empty title="No leads yet" sub="Upload today's file to get a prioritized list." /> : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Score</th><th>Business</th><th>Industry</th><th>Location</th><th>Contact</th><th>Website</th><th></th><th></th></tr></thead>
                        <tbody>
                          {filteredSorted.slice(uploadPage * PAGE_SIZE, uploadPage * PAGE_SIZE + PAGE_SIZE).map(l => {
                            const c = recommendContact(l);
                            const addr = c.primary ? c.primary.addr : (c.fallback ? c.fallback.addr : '—');
                            const isOpen = expanded === l.id;
                            return (
                              <React.Fragment key={l.id}>
                                <tr>
                                  <td><ScorePill score={l.priority_score} /></td>
                                  <td className="biz-name">{l.name}</td>
                                  <td className="dim">{l.nic_label && l.nic_label.length > 28 ? l.nic_label.slice(0, 26) + '…' : l.nic_label}</td>
                                  <td className="dim">{l.district}, {l.state}</td>
                                  <td className="mono small">{addr}</td>
                                  <td className="dim">{l.website_status}</td>
                                  <td><button className="btn-tiny ghost" onClick={() => setExpanded(isOpen ? null : l.id)}>{isOpen ? 'Hide' : 'Why?'}</button></td>
                                  <td><button className="btn-tiny" onClick={() => { setSelectedId(l.id); setTab('drafts'); }}>Draft →</button></td>
                                </tr>
                                {isOpen && <tr className="expand-row"><td colSpan={8}><ScoreBreakdown lead={l} /></td></tr>}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                      <Pager page={uploadPage} setPage={setUploadPage} total={filteredSorted.length} pageSize={PAGE_SIZE} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DRAFTS ---------------------------------------------------- */}
          {tab === 'drafts' && (
            <div className="grid-main">
              <div className="card">
                <h2>Your voice &amp; business</h2>
                <p className="hint">Saved to your account — shapes every draft's tone, and lets it cite your own work.</p>
                <div className="field-row"><label>Your name / business</label><input value={sender.name || ''} onChange={e => updateSenderField({ name: e.target.value })} placeholder="e.g. Deepa — Web Design Studio" /></div>
                <div className="field-row"><label>What you offer</label><input value={sender.offer || ''} onChange={e => updateSenderField({ offer: e.target.value })} placeholder="e.g. clean, fast websites for small businesses" /></div>
                <div className="field-row"><label>Tone <span className="opt">(optional)</span></label>
                  <select value={sender.tone || ''} onChange={e => updateSenderField({ tone: e.target.value })}>
                    <option value="">Warm, professional default</option>
                    <option>Warm and casual</option>
                    <option>Professional and polished</option>
                    <option>Direct and to the point</option>
                    <option>Friendly and enthusiastic</option>
                    <option>Formal</option>
                  </select>
                </div>
                <div className="field-row"><label>Sample of your own writing <span className="opt">(optional — paste a past email so drafts sound more like you)</span></label>
                  <textarea value={sender.voiceSample || ''} onChange={e => updateSenderField({ voiceSample: e.target.value })} placeholder="Paste an email you've actually sent before…" />
                </div>
                <div className="field-row"><label>Reference links <span className="opt">(optional, one per line — portfolio, case studies. Drafts may cite these.)</span></label>
                  <textarea value={referenceUrlsInput} onChange={e => setReferenceUrlsInput(e.target.value)} placeholder={'https://your-portfolio.com\nhttps://example.com/case-study'} />
                </div>
                {sender.referenceNotes && sender.referenceNotes.length > 0 && (
                  <div className="sources-box">
                    <div className="sources-label">Cached from your links (as of last save)</div>
                    <ul className="sources-list">
                      {sender.referenceNotes.map((r, i) => (
                        <li key={i}>{r.url}{r.error ? ' — could not fetch' : r.text ? ` — "${r.text.slice(0, 60)}…"` : ' — page had no readable text'}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button className="btn-tiny" disabled={profileSaving} onClick={saveProfile}>
                  {fetchingRefs ? <><Loader2 className="spin" size={12} /> Fetching links…</> : profileSaving ? <Loader2 className="spin" size={12} /> : 'Save profile'}
                </button>
                {profileStatus && <div className="status-line">{profileStatus}</div>}

                <h2 style={{ marginTop: 22 }}>Generate in batch</h2>
                <p className="hint">On demand, highest-priority first — never all at once, so every send stays reviewed.</p>
                <div className="row-inline">
                  <label>Top <input type="number" value={batchN} onChange={e => setBatchN(Math.max(1, Number(e.target.value) || 1))} style={{ width: 54 }} /> without a draft</label>
                  <button className="btn-primary" disabled={batchRunning || !sender.name || !sender.offer} onClick={runBatch}>
                    {batchRunning ? <><Loader2 className="spin" size={13} /> {batchProgress.done}/{batchProgress.total}</> : 'Generate batch'}
                  </button>
                </div>
                {(!sender.name || !sender.offer) && <div className="status-line">Fill in your details first.</div>}

                <h2 style={{ marginTop: 22 }}>Queue</h2>
                <div className="mini-list">
                  {[...leads].sort((a, b) => b.priority_score - a.priority_score).filter(l => !l.draft).slice(0, 30).map(l => (
                    <div key={l.id} className={`mini-row ${selectedId === l.id ? 'sel' : ''}`} onClick={() => setSelectedId(l.id)}>
                      <ScorePill score={l.priority_score} /><span className="mini-name">{l.name}</span>
                      <button className="btn-tiny" disabled={generating[l.id] || !sender.name || !sender.offer} onClick={e => { e.stopPropagation(); runDraft(l); }}>
                        {generating[l.id] ? <Loader2 className="spin" size={12} /> : 'Draft'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h2>Drafted ({leads.filter(l => l.draft).length})</h2>
                {!selectedLead || !selectedLead.draft ? <Empty title="Select a lead with a draft" sub="Or generate one from the queue." /> : (
                  <DraftDetail
                    key={selectedLead.id}
                    lead={selectedLead}
                    generating={generating[selectedLead.id]}
                    sending={sending[selectedLead.id]}
                    onRegenerate={runDraft}
                    onSendGmail={sendNow}
                    onMarkSent={markSent}
                    onBodyUpdated={updateDraftBody}
                    copy={copy}
                  />
                )}

                {leads.filter(l => l.draft).length > 0 && (
                  <div className="mini-list" style={{ marginTop: 18 }}>
                    {[...leads].filter(l => l.draft).sort((a, b) => b.priority_score - a.priority_score).map(l => (
                      <div key={l.id} className={`mini-row ${selectedId === l.id ? 'sel' : ''}`} onClick={() => setSelectedId(l.id)}>
                        <ScorePill score={l.priority_score} />
                        <span className="mini-name">{l.name}</span>
                        {l.outcome.contacted && <span className="tag verified" style={{ marginLeft: 'auto' }}>Sent</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OUTCOMES -------------------------------------------------- */}
          {tab === 'outcomes' && (
            <div className="grid-main-single">
              <div className="card">
                <div className="row-between">
                  <h2>All leads ({outcomeTabLeads.length})</h2>
                  <span className="hint" style={{ margin: 0 }}>{leads.filter(isClient).length} client{leads.filter(isClient).length === 1 ? '' : 's'}</span>
                </div>
                <div className="import-row">
                  <label className="btn-tiny import-label">
                    {importing ? <Loader2 className="spin" size={12} /> : 'Import outcomes from Excel'}
                    <input type="file" accept=".xlsx,.xls" onChange={handleImportOutcomes} disabled={importing} style={{ display: 'none' }} />
                  </label>
                  <span className="hint" style={{ margin: 0 }}>Uses the "Outcomes" sheet from an Excel export made by this tool (Export Excel, Upload tab).</span>
                </div>
                {importStatus && <div className="status-line">{importStatus}</div>}
                <div className="filters" style={{ marginBottom: 12, marginTop: 10 }}>
                  <div className="search-box"><Search size={14} /><input placeholder="Search name…" value={outcomeSearch} onChange={e => setOutcomeSearch(e.target.value)} /></div>
                  <select value={outcomeStatusFilter} onChange={e => setOutcomeStatusFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    <option value="none">Not contacted</option>
                    <option value="drafted">Drafted</option>
                    <option value="contacted">Contacted</option>
                    <option value="replied">Replied</option>
                    <option value="proposal">Proposal sent</option>
                    <option value="won">Client</option>
                    <option value="lost">Lost</option>
                    <option value="paid">Client (Paid)</option>
                  </select>
                </div>
                {outcomeTabLeads.length === 0 ? <Empty title="No leads match" sub="Try clearing the search or filter." /> : (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Score</th><th>Business</th><th>Industry</th><th>Location</th><th>Contact</th><th>Website</th><th>Status</th></tr></thead>
                        <tbody>
                          {outcomeTabLeads.slice(outcomePage * PAGE_SIZE, outcomePage * PAGE_SIZE + PAGE_SIZE).map(l => {
                            const c = recommendContact(l);
                            const addr = c.primary ? c.primary.addr : (c.fallback ? c.fallback.addr : '—');
                            return (
                              <tr key={l.id} className={`clickable-row ${selectedId === l.id ? 'row-sel' : ''}`} onClick={() => setSelectedId(l.id)}>
                                <td><ScorePill score={l.priority_score} /></td>
                                <td className="biz-name">{l.name}</td>
                                <td className="dim">{l.nic_label && l.nic_label.length > 28 ? l.nic_label.slice(0, 26) + '…' : l.nic_label}</td>
                                <td className="dim">{l.district}, {l.state}</td>
                                <td className="mono small">{addr}</td>
                                <td className="dim">{l.website_status}</td>
                                <td><StatusBadge lead={l} /></td>
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
              <div className="card">
                <h2>Log outcome</h2>
                {!selectedLead ? <Empty title="Select a lead" sub="Pick one from the list." /> : (
                  <div>
                    <div className="biz-name" style={{ marginBottom: 14 }}>{selectedLead.name}</div>
                    <div className="grid2">
                      <div className="check-row"><input type="checkbox" checked={!!outcomeDraft.replied} onChange={e => setOutcomeDraft(d => ({ ...d, replied: e.target.checked }))} /><label>Replied</label></div>
                      <div className="field-row"><label>Response type</label><select value={outcomeDraft.response_type || ''} onChange={e => setOutcomeDraft(d => ({ ...d, response_type: e.target.value }))}><option value="">—</option><option>Positive</option><option>Neutral</option><option>Negative</option><option>No response</option></select></div>
                      <div className="check-row"><input type="checkbox" checked={!!outcomeDraft.proposal_sent} onChange={e => setOutcomeDraft(d => ({ ...d, proposal_sent: e.target.checked }))} /><label>Proposal sent</label></div>
                      <div className="field-row"><label>Quoted price (₹)</label><input type="text" value={outcomeDraft.quoted_price || ''} onChange={e => setOutcomeDraft(d => ({ ...d, quoted_price: e.target.value }))} placeholder="15000" /></div>
                      <div className="check-row"><input type="checkbox" checked={!!outcomeDraft.materialized} onChange={e => setOutcomeDraft(d => ({ ...d, materialized: e.target.checked }))} /><label>Materialized into a build</label></div>
                      {!outcomeDraft.materialized && <div className="field-row"><label>Reason not proceeded</label><select value={outcomeDraft.not_proceeded_reason || ''} onChange={e => setOutcomeDraft(d => ({ ...d, not_proceeded_reason: e.target.value }))}><option value="">—</option>{REASONS.map(r => <option key={r}>{r}</option>)}</select></div>}
                      <div className="check-row"><input type="checkbox" checked={!!outcomeDraft.payment_received} onChange={e => setOutcomeDraft(d => ({ ...d, payment_received: e.target.checked }))} /><label>Payment received</label></div>
                      <div className="field-row"><label>Final amount (₹)</label><input type="text" value={outcomeDraft.final_amount || ''} onChange={e => setOutcomeDraft(d => ({ ...d, final_amount: e.target.value }))} placeholder="12000" /></div>
                      <div className="field-row full"><label>Notes</label><textarea value={outcomeDraft.notes || ''} onChange={e => setOutcomeDraft(d => ({ ...d, notes: e.target.value }))} /></div>
                    </div>
                    <button className="btn-primary" style={{ marginTop: 14 }} onClick={() => saveOutcomeRow(selectedLead, outcomeDraft)}>Save outcome</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* INSIGHTS -------------------------------------------------- */}
          {tab === 'insights' && (
            !insightsReady ? (
              <Empty title={`${withOutcome.length} outcome${withOutcome.length === 1 ? '' : 's'} logged so far`} sub="Log at least 3 contacted leads with outcomes to unlock patterns — reply rate by industry and score band, a funnel, client list, and what pricing works." />
            ) : (
              <div className="grid-main-single">
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <div className="row-between">
                    <h2>Filters</h2>
                    <div className="row-inline">
                      <button className="btn-ghost" disabled={exportingFormat === 'xlsx'} onClick={() => runExport('xlsx')}>{exportingFormat === 'xlsx' ? <Loader2 className="spin" size={13} /> : <Download size={13} />} Excel</button>
                      <button className="btn-ghost" disabled={exportingFormat === 'pdf'} onClick={() => runExport('pdf')}>{exportingFormat === 'pdf' ? <Loader2 className="spin" size={13} /> : <Download size={13} />} PDF</button>
                      <button className="btn-ghost" disabled={exportingFormat === 'pptx'} onClick={() => runExport('pptx')}>{exportingFormat === 'pptx' ? <Loader2 className="spin" size={13} /> : <Download size={13} />} PowerPoint</button>
                      <button className="btn-ghost" disabled={exportingFormat === 'docx'} onClick={() => runExport('docx')}>{exportingFormat === 'docx' ? <Loader2 className="spin" size={13} /> : <Download size={13} />} Word</button>
                    </div>
                  </div>
                  <div className="filters" style={{ marginTop: 4 }}>
                    <select value={insightsFilters.industry} onChange={e => setInsightsFilters(f => ({ ...f, industry: e.target.value }))}>
                      <option value="">All industries</option>{industries.map(i => <option key={i} value={i}>{i.length > 40 ? i.slice(0, 38) + '…' : i}</option>)}
                    </select>
                    <select value={insightsFilters.state} onChange={e => setInsightsFilters(f => ({ ...f, state: e.target.value }))}>
                      <option value="">All states</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <label className="minscore">From<input type="date" value={insightsFilters.dateFrom} onChange={e => setInsightsFilters(f => ({ ...f, dateFrom: e.target.value }))} /></label>
                    <label className="minscore">To<input type="date" value={insightsFilters.dateTo} onChange={e => setInsightsFilters(f => ({ ...f, dateTo: e.target.value }))} /></label>
                    {(insightsFilters.industry || insightsFilters.state || insightsFilters.dateFrom || insightsFilters.dateTo) && (
                      <button className="btn-tiny" onClick={() => setInsightsFilters({ industry: '', state: '', dateFrom: '', dateTo: '' })}>Clear</button>
                    )}
                  </div>
                  <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>"Total leads" reflects the industry/state filters only — the date range narrows contacted/client/revenue figures, since leads themselves have no activity date to filter by.</p>
                </div>

                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <h2>Summary</h2>
                  <div className="summary-stats">
                    <div><div className="big-num">{insightsData.summary.totalLeads}</div><div className="hint">total leads</div></div>
                    <div><div className="big-num">{insightsData.summary.totalContacted}</div><div className="hint">contacted (in range)</div></div>
                    <div><div className="big-num">{insightsData.summary.totalClients}</div><div className="hint">clients (in range)</div></div>
                    <div><div className="big-num">₹{insightsData.summary.totalRevenue}</div><div className="hint">total revenue</div></div>
                    <div><div className="big-num">₹{insightsData.summary.avgDealSize || '—'}</div><div className="hint">avg. deal size</div></div>
                  </div>
                </div>

                <div className="card">
                  <h2>Status breakdown</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={insightsData.statusBreakdown} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E3E0D6" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip /><Bar dataKey="count" fill="#2F6F62" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card">
                  <h2>Reply rate by industry</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={insightsData.replyByIndustry.map(d => ({ ...d, name: d.name.length > 22 ? d.name.slice(0, 20) + '…' : d.name }))} margin={{ left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E3E0D6" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => [`${v}%`, 'Reply rate']} />
                      <Bar dataKey="replyRate" fill="#2F6F62" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card">
                  <h2>Reply rate by priority band</h2>
                  <p className="hint">Validates whether the score actually predicts response.</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={insightsData.replyByBand}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E3E0D6" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => [`${v}%`, 'Reply rate']} />
                      <Bar dataKey="replyRate" fill="#C4622D" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card">
                  <h2>Conversion funnel</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={insightsData.funnel} layout="vertical" margin={{ left: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E3E0D6" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} /><YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={90} />
                      <Tooltip /><Bar dataKey="value" fill="#2F6F62" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card">
                  <h2>Pricing — what tends to work</h2>
                  <div className="price-stats">
                    <div><div className="big-num">₹{insightsData.pricing.avgWonPrice || '—'}</div><div className="hint">avg quoted, won ({insightsData.pricing.wonCount})</div></div>
                    <div><div className="big-num">₹{insightsData.pricing.avgLostPrice || '—'}</div><div className="hint">avg quoted, not proceeded ({insightsData.pricing.lostCount})</div></div>
                  </div>
                  {insightsData.pricing.reasons.length > 0 && (
                    <>
                      <p className="hint" style={{ marginTop: 16 }}>Reasons deals didn't proceed:</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart><Pie data={insightsData.pricing.reasons} dataKey="value" nameKey="name" outerRadius={75} label={{ fontSize: 11 }}>{insightsData.pricing.reasons.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
                      </ResponsiveContainer>
                    </>
                  )}
                </div>

                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <h2>Clients ({insightsData.clients.length})</h2>
                  {insightsData.clients.length === 0 ? <Empty title="No clients yet in this range" sub="Mark a lead's outcome as materialized to see it here." /> : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Business</th><th>Industry</th><th>State</th><th>Quoted</th><th>Final</th><th>Contacted</th><th>Paid</th></tr></thead>
                        <tbody>
                          {insightsData.clients.map((c, i) => (
                            <tr key={i}>
                              <td className="biz-name">{c.name}</td>
                              <td className="dim">{c.industry && c.industry.length > 28 ? c.industry.slice(0, 26) + '…' : c.industry}</td>
                              <td className="dim">{c.state}</td>
                              <td className="mono small">{c.quotedPrice ? `₹${c.quotedPrice}` : '—'}</td>
                              <td className="mono small">{c.finalAmount ? `₹${c.finalAmount}` : '—'}</td>
                              <td className="dim">{c.contactedDate}</td>
                              <td>{c.paid === 'Yes' ? <span className="tag verified">Paid</span> : <span className="dim">No</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
