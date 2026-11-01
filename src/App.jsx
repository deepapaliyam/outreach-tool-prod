import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Menu } from 'lucide-react';

import { parseWorkbookRows, scoreLead, recommendContact, computeStatus } from './lib/scoring';
import { generateDraft } from './lib/drafting';
import { sendViaGmail, sendSignatureTest, signatureDefault } from './lib/sending';
import { fetchReferences } from './lib/references';
import { computeInsightsData } from './lib/insights';
import { enrichLeadWithRetry } from './lib/enrichment';
import { needsWebCheck } from './lib/webcheck';
import { exportInsightsXLSX, exportInsightsPDF, exportInsightsPPTX, exportInsightsDOCX } from './lib/exports';
import { runSequentially, describeBatchResult } from './lib/batch';
import { setViewerIsAdmin } from './lib/apiErrors';
import { profileFromRow, rowFromProfile, cleanProfileForSave, profileIsReady, clampCap } from './lib/profile';
import { latestByLead, shortId } from './lib/gmailResponses';
import { supabase } from './lib/supabase';
import {
  fetchLeads, upsertNewLeads, updateLeadDraft, updateLeadScore, bulkUpdateLeadScores,
  fetchOutcomes, saveOutcome, fetchSenderProfile, saveSenderProfile, fetchSendStats,
  fetchIsAdmin, fetchGmailResponses, uploadSignatureLogo,
} from './lib/db';
import { RETURN_TAB_KEY } from './components/GmailConnect';
import Sidebar from './components/Sidebar';
import { Toasts, Spinner } from './components/ui';
import UploadPage from './pages/UploadPage';
import DraftPage from './pages/DraftPage';
import OutcomesPage from './pages/OutcomesPage';
import InsightsPage from './pages/InsightsPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import { CSS } from './styles';

// The controller. Every read/write goes through lib/db.js (Supabase). Leads
// carry an `outcome` object assembled from the outcomes table for convenient
// rendering. Pages are plain components that receive what they need as `ctl`.

const TITLES = { upload: 'Upload & Prioritize', drafts: 'Email Draft', outcomes: 'Track Outcomes', insights: 'Insights', profile: 'Profile & Settings', admin: 'Admin' };
const TABS = Object.keys(TITLES);
const MIN_BATCH_GAP_MIN = 3; // the server enforces a 2-minute floor; 3 leaves headroom for timing jitter
const WEB_CHECK_PARALLEL = 6;

const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* the preference just won't persist */ } };
const today = () => new Date().toISOString().slice(0, 10);

// Gmail's answer, in the one shape the screens use.
function rowToResponse(r) {
  if (!r) return null;
  return { ok: r.ok, kind: r.kind, at: r.created_at, messageId: r.gmail_message_id, threadId: r.gmail_thread_id, labelIds: r.label_ids || [], error: r.error_message };
}

export default function App() {
  const [tab, setTabState] = useState(() => {
    let t = 'upload';
    try {
      const r = sessionStorage.getItem(RETURN_TAB_KEY);
      if (r && TABS.includes(r)) t = r;
      sessionStorage.removeItem(RETURN_TAB_KEY);
    } catch { /* first page it is */ }
    return t;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leads, setLeads] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [sender, setSender] = useState(() => profileFromRow(null));
  const [toasts, setToasts] = useState([]);

  // ---- small shared helpers ------------------------------------------------
  const dismissToast = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  const notify = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(list => [...list.slice(-3), { id, ...t }]);
    setTimeout(() => dismissToast(id), t.tone === 'bad' ? 14000 : 7000);
  }, [dismissToast]);
  const copy = useCallback(async (text) => {
    try { await navigator.clipboard.writeText(text); notify({ tone: 'ok', title: 'Copied to clipboard' }); }
    catch { notify({ tone: 'warn', title: 'Could not copy', text: 'Your browser blocked clipboard access — select the text and copy it by hand.' }); }
  }, [notify]);

  const setTab = useCallback((t) => { setTabState(TABS.includes(t) ? t : 'upload'); window.scrollTo?.(0, 0); }, []);

  // ---- who is looking ------------------------------------------------------
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data?.user ? { id: data.user.id, email: data.user.email } : null)).catch(() => {});
    fetchIsAdmin().then(v => { setIsAdmin(v); setViewerIsAdmin(v); });
  }, []);
  // The Admin tab only exists for administrators.
  useEffect(() => { if (tab === 'admin' && !isAdmin) setTabState('upload'); }, [tab, isAdmin]);

  // ---- data ------------------------------------------------------------------
  const reload = useCallback(async () => {
    let merged = [];
    try {
      const [leadRows, outcomeRows] = await Promise.all([fetchLeads(), fetchOutcomes()]);
      const byLead = new Map(outcomeRows.map(o => [o.lead_id, o]));
      merged = leadRows.map(l => ({ ...l, outcome: byLead.get(l.id) || {} }));
      setLeads(merged);
    } catch (e) {
      console.error('Failed to load leads/outcomes:', e);
    }
    try {
      const row = await fetchSenderProfile();
      if (row) setSender(profileFromRow(row));
    } catch (e) {
      console.error('Failed to load sender profile — has supabase/sender_profile_schema.sql been run yet?', e);
    }
    setLoaded(true);
    return merged;
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Real outreach sends in the last rolling 24h — powers the safe-send meter.
  const [sendStats, setSendStats] = useState({ count: 0, lastSentAt: null });
  const refreshSendStats = useCallback(async () => {
    try { setSendStats(await fetchSendStats()); }
    catch (e) { console.warn('Could not load send stats — has supabase/send_safety_schema.sql been run?', e); }
  }, []);
  useEffect(() => { refreshSendStats(); }, [refreshSendStats]);
  useEffect(() => { if (tab === 'drafts') refreshSendStats(); }, [tab, refreshSendStats]);

  // What Gmail answered, for every send, test send and Gmail draft.
  const [gmailRows, setGmailRows] = useState([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState('');
  const [liveResponses, setLiveResponses] = useState({});
  const refreshGmail = useCallback(async () => {
    setGmailLoading(true);
    try { setGmailRows(await fetchGmailResponses(100)); setGmailError(''); }
    catch (e) { setGmailError(e.message || String(e)); }
    finally { setGmailLoading(false); }
  }, []);
  useEffect(() => { refreshGmail(); }, [refreshGmail]);
  const latestRows = useMemo(() => latestByLead(gmailRows), [gmailRows]);
  const responseFor = useCallback((leadId) => {
    const persisted = rowToResponse(latestRows.get(leadId));
    const live = liveResponses[leadId];
    if (live && (!persisted || live.at >= persisted.at)) return live;
    return persisted;
  }, [latestRows, liveResponses]);

  // ---- profile ---------------------------------------------------------------
  const profileReady = profileIsReady(sender);
  const dailyCap = clampCap(sender.dailySendCap);

  const saveProfile = async (form) => {
    const { profile, skipped } = cleanProfileForSave(form);
    const urls = profile.portfolioLinks.map(l => l.url).slice(0, 5);
    const previous = (sender.portfolioLinks || []).map(l => l.url).slice(0, 5).join('\n');
    let referenceNotes = sender.referenceNotes || [];
    let warning = '';
    // Portfolio pages are read once, when the list changes — not on every save and never per draft.
    if (urls.join('\n') !== previous) {
      if (urls.length) {
        try { referenceNotes = await fetchReferences(urls); }
        catch (e) { referenceNotes = []; warning = ` Your profile was saved, but the portfolio pages could not be read (${e.message}).`; }
      } else referenceNotes = [];
    }
    const next = { ...profile, referenceNotes, testMode: sender.testMode };
    await saveSenderProfile(rowFromProfile(next, { reference_notes: referenceNotes }));
    setSender(next);
    const notes = [];
    if (skipped) notes.push(`${skipped} link${skipped === 1 ? ' was' : 's were'} skipped because ${skipped === 1 ? "it isn't" : "they aren't"} a web address.`);
    // `profile` is what was really stored (links tidied), so the page can show exactly that and not report phantom unsaved changes.
    return { message: `Saved.${warning}${notes.length ? ' ' + notes.join(' ') : ''}`, referenceNotes, profile: next };
  };

  const setTestModeAndPersist = async (value) => {
    setSender(s => ({ ...s, testMode: value }));
    try { await saveSenderProfile({ test_mode: value }); }
    catch (e) { console.error('Failed to persist test mode change', e); }
  };
  const enableTestMode = () => setTestModeAndPersist(true);
  const disableTestMode = () => {
    if (window.confirm("Turn OFF test mode? \"Send via Gmail\" will start sending REAL emails to leads' real addresses immediately. Real sends are limited to your daily safe-send limit, at least 2 minutes apart, and never to the same address twice in 30 days.")) {
      setTestModeAndPersist(false);
    }
  };
  const testMode = sender.testMode !== false;

  // ---- upload & scoring ------------------------------------------------------
  const [uploadStatus, setUploadStatus] = useState('');
  const [preferredRegions, setPreferredRegionsState] = useState(() => readJson('preferredRegions', []));
  const setPreferredRegions = (r) => { setPreferredRegionsState(r); writeJson('preferredRegions', r); };
  const [autoCheckOnUpload, setAutoCheckState] = useState(() => readJson('autoCheckOnUpload', true) !== false);
  const setAutoCheckOnUpload = (v) => { setAutoCheckState(v); writeJson('autoCheckOnUpload', v); };
  const [filters, setFilters] = useState({ search: '', industry: '', state: '', minScore: 0 });
  const [uploadPage, setUploadPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  const enrichRunningRef = useRef(false);
  const enrichStopRef = useRef(false);
  const autoCheckRef = useRef(null); // always points at the latest runner, so the memoised upload handler never calls a stale one

  const handleFile = useCallback((file) => {
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
        setUploadStatus(`${file.name} · ${parsed.length} businesses (${rows.length} rows de-duplicated): ${inserted} new, ${skipped} already saved.`);
        const fresh = await reload();
        // Check the leads from THIS file that have never been checked and have no
        // hand-entered website status — several at once, in the background.
        const inFile = new Set(parsed.map(p => p.entity_id));
        const toCheck = (fresh || []).filter(l => inFile.has(l.entity_id) && needsWebCheck(l));
        if (toCheck.length && autoCheckRef.current && autoCheckRef.current(toCheck)) {
          setUploadStatus(prev => `${prev} Checking web presence for ${toCheck.length} lead${toCheck.length === 1 ? '' : 's'} in the background…`);
        }
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
  // Scoring normally happens once, at upload time, and is permanently saved — so
  // changing "preferred regions" never touches saved leads on its own. This is the
  // explicit action that applies the CURRENT scoring inputs to every saved lead.
  const rescoreAllLeads = async () => {
    setRescoring(true);
    setRescoreStatus('');
    setRescoreProgress({ done: 0, total: leads.length });
    try {
      const rescoredById = new Map();
      const updated = leads.map(lead => {
        const rescored = scoreLead(lead, preferredRegions);
        const patch = {
          need_score: rescored.need_score, reach_score: rescored.reach_score, region_bonus: rescored.region_bonus,
          priority_score: rescored.priority_score, score_breakdown: rescored.score_breakdown,
        };
        rescoredById.set(lead.id, patch);
        return { ...lead, ...patch };
      });
      await bulkUpdateLeadScores(leads, (l) => rescoredById.get(l.id));
      setRescoreProgress({ done: leads.length, total: leads.length });
      setLeads(updated);
      setRescoreStatus(`Re-scored ${updated.length} lead${updated.length === 1 ? '' : 's'} with your current preferred regions.`);
    } catch (e) {
      setRescoreStatus('Re-score failed: ' + e.message);
    } finally {
      setRescoring(false);
    }
  };

  // ---- setup problems (admins only get pointed at the Service check) ----------
  const [draftError, setDraftError] = useState('');
  const [setupAlert, setSetupAlert] = useState(false);
  const [serviceCheckSignal, setServiceCheckSignal] = useState(0);
  const flagSetupProblem = (e) => { if (e && e.operator && isAdmin) setSetupAlert(true); };
  const goAdmin = () => { setServiceCheckSignal(n => n + 1); setSetupAlert(false); setTab('admin'); };

  // ---- web presence checks -----------------------------------------------------
  const [enriching, setEnriching] = useState({});
  const [enrichBatchRunning, setEnrichBatchRunning] = useState(false);
  const [enrichBatchN, setEnrichBatchN] = useState(20);
  const [enrichBatchProgress, setEnrichBatchProgress] = useState({ done: 0, total: 0 });
  const [enrichStatus, setEnrichStatus] = useState('');

  // Saves the evidence AND the re-computed score together, then updates the row on
  // screen. Website status feeds the score, so the two are never written separately.
  const applyEnrichment = async (lead, result) => {
    const rescored = scoreLead({ ...lead, ...result }, preferredRegions);
    const patch = {
      website_status: result.website_status, business_listings: result.business_listings, web_findings: result.web_findings,
      web_checked_at: new Date().toISOString(),
      need_score: rescored.need_score, reach_score: rescored.reach_score, region_bonus: rescored.region_bonus,
      priority_score: rescored.priority_score, score_breakdown: rescored.score_breakdown,
    };
    await updateLeadScore(lead.id, patch);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...patch } : l));
  };

  const enrichOneLead = async (lead) => {
    setEnriching(e => ({ ...e, [lead.id]: true }));
    try {
      await applyEnrichment(lead, await enrichLeadWithRetry(lead));
    } catch (e) {
      notify({ tone: 'bad', title: 'Web check failed', text: e.message });
      flagSetupProblem(e);
    } finally {
      setEnriching(e => ({ ...e, [lead.id]: false }));
    }
  };

  // Checks many leads a few at a time, updating each row the moment its result arrives.
  const runWebChecks = async (candidates) => {
    if (!candidates.length) return;
    if (enrichRunningRef.current) {
      setEnrichStatus('A web check is already running — use the button to check anything left once it finishes.');
      return;
    }
    enrichRunningRef.current = true;
    enrichStopRef.current = false;
    setEnrichBatchRunning(true);
    setEnrichStatus('');
    setEnrichBatchProgress({ done: 0, total: candidates.length });
    let next = 0, done = 0, failed = 0, lastError = '', fatalMessage = '', operatorStop = false;
    const worker = async () => {
      while (!enrichStopRef.current) {
        const i = next++;
        if (i >= candidates.length) return;
        try {
          await applyEnrichment(candidates[i], await enrichLeadWithRetry(candidates[i]));
        } catch (e) {
          failed++;
          lastError = e.message;
          // A bad/expired search key or no credits can't be fixed by trying more leads.
          if (e.fatal) { enrichStopRef.current = true; fatalMessage = e.message; operatorStop = operatorStop || !!e.operator; }
        }
        done++;
        setEnrichBatchProgress({ done, total: candidates.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(WEB_CHECK_PARALLEL, candidates.length) }, worker));
    const stopped = enrichStopRef.current && done < candidates.length;
    setEnrichStatus(fatalMessage
      ? `Web check stopped: ${fatalMessage} (${done} of ${candidates.length} were attempted.)`
      : (stopped ? `Stopped — checked ${done} of ${candidates.length}` : `Checked ${done} lead${done === 1 ? '' : 's'}`) +
        (failed ? `; ${failed} could not be checked (last error: ${lastError})` : '') + '.');
    if (operatorStop && isAdmin) setSetupAlert(true);
    enrichRunningRef.current = false;
    setEnrichBatchRunning(false);
  };
  const stopWebChecks = () => { enrichStopRef.current = true; };

  autoCheckRef.current = (toCheck) => {
    if (!autoCheckOnUpload || enrichRunningRef.current) return false;
    runWebChecks(toCheck);
    return true;
  };

  // Leads never checked (and with no hand-entered status). While any exist the
  // button checks them; once everything is checked it becomes a deliberate re-check.
  const uncheckedLeads = useMemo(() => leads.filter(needsWebCheck), [leads]);
  const runWebCheckButton = () => {
    const byScore = [...leads].sort((a, b) => b.priority_score - a.priority_score);
    const pool = uncheckedLeads.length ? byScore.filter(needsWebCheck) : byScore;
    runWebChecks(pool.slice(0, enrichBatchN));
  };

  // ---- drafting ---------------------------------------------------------------
  const [generating, setGenerating] = useState({});
  const [batchN, setBatchN] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  const runDraft = async (lead) => {
    setGenerating(g => ({ ...g, [lead.id]: true }));
    setDraftError('');
    try {
      const draft = await generateDraft(lead, sender);
      await updateLeadDraft(lead.id, draft);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, draft } : l));
      setSelectedId(lead.id);
    } catch (e) {
      console.error(e);
      setDraftError(`Draft failed for "${lead.name}": ${e.message}`);
      flagSetupProblem(e);
    } finally { setGenerating(g => ({ ...g, [lead.id]: false })); }
  };

  // Used for both manual body edits and selective-rewrite splices — keeps
  // subject/evaluation/sources, only replaces body.
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
    setDraftError('');
    // One at a time. Stops at the first SETUP problem (expired key, no credit...) or
    // after 3 failures in a row, instead of failing once per lead. Saved drafts are kept.
    const result = await runSequentially(candidates, async (lead) => {
      const draft = await generateDraft(lead, sender);
      await updateLeadDraft(lead.id, draft);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, draft } : l));
    }, { onProgress: setBatchProgress });
    const message = describeBatchResult(result, 'drafts');
    if (message) setDraftError(message);
    if (result.stopped && result.operator && isAdmin) setSetupAlert(true);
    setBatchRunning(false);
  };

  // ---- sending ------------------------------------------------------------------
  const [sending, setSending] = useState({});
  const [savingDraft, setSavingDraft] = useState({});

  const markSent = async (lead) => {
    const outcome = {
      ...lead.outcome, contacted: true, contacted_date: today(),
      sent_subject: lead.draft?.subject, sent_body: lead.draft?.body, sent_sources: lead.draft?.sources || [],
    };
    await saveOutcome(lead.id, outcome);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, outcome } : l));
  };

  const keepResponse = (lead, result) => {
    const g = result.gmail || {};
    setLiveResponses(r => ({ ...r, [lead.id]: { ok: true, kind: result.kind || (result.draftOnly ? 'draft' : result.testMode ? 'test' : 'send'), at: new Date().toISOString(), messageId: g.messageId, threadId: g.threadId, labelIds: g.labelIds || [] } }));
  };
  const markLeadSent = (lead) => setLeads(prev => prev.map(l => l.id === lead.id
    ? { ...l, outcome: { ...l.outcome, contacted: true, contacted_date: today(), sent_via_gmail: true, sent_subject: lead.draft.subject, sent_body: lead.draft.body, sent_sources: lead.draft.sources || [] } }
    : l));

  const sendNow = async (lead, opts = {}) => {
    setSending(s => ({ ...s, [lead.id]: true }));
    try {
      const asTest = !!opts.forceTest || testMode;
      const result = await sendViaGmail(lead, { testMode: asTest, testEmailOverride: sender.testEmail, includeSignature: opts.includeSignature !== false });
      keepResponse(lead, result);
      if (result.testMode) {
        notify({ tone: 'ok', title: `Test email sent to ${result.to}`, text: `Gmail accepted it (message ${shortId(result.gmail?.messageId) || 'ID not returned'}). ${lead.name}'s outcome was NOT changed — the lead is still unsent.` });
      } else {
        markLeadSent(lead);
        if (result.counted && result.sendsLast24h != null) setSendStats({ count: result.sendsLast24h, lastSentAt: new Date().toISOString() });
        notify({ tone: 'ok', title: `Sent to ${result.to}`, text: `Gmail accepted it (message ${shortId(result.gmail?.messageId) || 'ID not returned'}).` });
      }
    } catch (e) {
      notify({ tone: 'bad', title: 'Send failed', text: e.message });
      refreshSendStats(); // the server may have refused because the meter was stale — resync it
    } finally {
      setSending(s => ({ ...s, [lead.id]: false }));
      refreshGmail();
    }
  };

  const saveAsGmailDraft = async (lead, opts = {}) => {
    setSavingDraft(s => ({ ...s, [lead.id]: true }));
    try {
      const result = await sendViaGmail(lead, { draftOnly: true, includeSignature: opts.includeSignature !== false });
      keepResponse(lead, result);
      notify({ tone: 'ok', title: 'Saved to your Gmail Drafts', text: `Addressed to ${lead.draft.sendTo}. Nothing has been sent — open Gmail to review and send it yourself.` });
    } catch (e) {
      notify({ tone: 'bad', title: 'Could not save the draft', text: e.message });
    } finally {
      setSavingDraft(s => ({ ...s, [lead.id]: false }));
      refreshGmail();
    }
  };

  const sendSignatureTestEmail = async () => {
    try { return await sendSignatureTest(); }
    finally { refreshGmail(); }
  };

  // Spaced batch send: one at a time with a real delay between each, so outreach
  // never looks like a bulk blast. Runs entirely in this browser tab.
  const [batchSendRunning, setBatchSendRunning] = useState(false);
  const [batchSendN, setBatchSendN] = useState(10);
  const [batchSendDelayMin, setBatchSendDelayMin] = useState(5);
  const [batchSendProgress, setBatchSendProgress] = useState({ done: 0, total: 0, nextInSeconds: 0 });
  const [batchSendNote, setBatchSendNote] = useState('');
  const batchSendStopRef = useRef(false);
  const stopBatchSend = () => { batchSendStopRef.current = true; };

  const runBatchSend = async () => {
    // Real sends are capped by what's left of the rolling-24h allowance; test-mode
    // sends (to yourself) don't count against it.
    const remaining = testMode ? Infinity : Math.max(0, dailyCap - sendStats.count);
    setBatchSendNote('');
    setDraftError('');
    if (remaining === 0) {
      setDraftError(`Daily safe-send limit reached (${sendStats.count} of ${dailyCap} real sends in the last 24 hours). Nothing was sent — try again once older sends age out of the 24-hour window.`);
      return;
    }
    const candidates = [...leads]
      .filter(l => l.draft && !l.outcome?.contacted)
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, Math.min(batchSendN, remaining));
    if (!candidates.length) return;
    if (!testMode && candidates.length < batchSendN) {
      setBatchSendNote(`Only ${candidates.length} send${candidates.length === 1 ? '' : 's'} left in today's safe limit, so the batch was trimmed to ${candidates.length}.`);
    }
    batchSendStopRef.current = false;
    setBatchSendRunning(true);
    setBatchSendProgress({ done: 0, total: candidates.length, nextInSeconds: 0 });

    const gapMs = Math.max(MIN_BATCH_GAP_MIN, batchSendDelayMin) * 60 * 1000;
    let lastSendAt = null; // spacing is measured from the last email that actually went out
    let skipped = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (batchSendStopRef.current) break;
      const lead = candidates[i];
      if (lastSendAt !== null) {
        while (!batchSendStopRef.current) {
          const remainingMs = gapMs - (Date.now() - lastSendAt);
          if (remainingMs <= 0) break;
          setBatchSendProgress({ done: i, total: candidates.length, nextInSeconds: Math.ceil(remainingMs / 1000) });
          await new Promise(r => setTimeout(r, 1000));
        }
        if (batchSendStopRef.current) break;
      }
      try {
        const result = await sendViaGmail(lead, { testMode, testEmailOverride: sender.testEmail, includeSignature: signatureDefault(lead, sender.signatureHtml) });
        lastSendAt = Date.now();
        keepResponse(lead, result);
        if (!result.testMode) {
          markLeadSent(lead);
          if (result.counted && result.sendsLast24h != null) setSendStats({ count: result.sendsLast24h, lastSentAt: new Date().toISOString() });
        }
      } catch (e) {
        if (e.code === 'duplicate_recipient') {
          // Not a systemic failure — this recipient was already emailed recently. Skip it
          // and carry on; nothing went out, so the spacing clock keeps running.
          skipped++;
          setBatchSendProgress({ done: i + 1, total: candidates.length, nextInSeconds: 0 });
          continue;
        }
        console.error(e);
        setDraftError(`Batch send stopped at "${lead.name}": ${e.message}`);
        refreshSendStats();
        break; // cap reached, session problem, Gmail error… don't push on unattended
      }
      setBatchSendProgress({ done: i + 1, total: candidates.length, nextInSeconds: 0 });
    }
    if (skipped) setBatchSendNote(prev => `${prev ? prev + ' ' : ''}Skipped ${skipped} recipient${skipped === 1 ? '' : 's'} already emailed in the last 30 days.`);
    setBatchSendRunning(false);
    refreshGmail();
  };

  // ---- outcomes -------------------------------------------------------------------
  const [outcomeSearch, setOutcomeSearch] = useState('');
  const [outcomeStatusFilter, setOutcomeStatusFilter] = useState('');
  const [outcomePage, setOutcomePage] = useState(0);
  const [outcomeDraft, setOutcomeDraft] = useState({});
  const [savingOutcome, setSavingOutcome] = useState(false);

  const saveOutcomeRow = async (lead, outcome) => {
    // A lead is "contacted" if it was sent through the tool, OR if you're recording that it
    // replied / progressed / paid — there can't be a reply or a conversion without having
    // reached out first. A bare note or a quoted price alone still does NOT imply contact.
    const impliedContacted = !!(outcome.replied || outcome.proposal_sent || outcome.materialized || outcome.payment_received);
    const merged = { ...outcome, contacted: lead.outcome?.contacted || impliedContacted };
    setSavingOutcome(true);
    try {
      await saveOutcome(lead.id, merged);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, outcome: merged } : l));
      notify({ tone: 'ok', title: 'Outcome saved', text: lead.name });
    } catch (e) {
      notify({ tone: 'bad', title: 'Could not save the outcome', text: e.message });
    } finally {
      setSavingOutcome(false);
    }
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
  useEffect(() => { if (selectedLead) setOutcomeDraft(selectedLead.outcome || {}); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const outcomeTabLeads = useMemo(() => [...leads]
    .filter(l => {
      if (outcomeSearch && !l.name.toLowerCase().includes(outcomeSearch.toLowerCase())) return false;
      if (outcomeStatusFilter && computeStatus(l).tone !== outcomeStatusFilter) return false;
      return true;
    })
    .sort((a, b) => b.priority_score - a.priority_score), [leads, outcomeSearch, outcomeStatusFilter]);
  useEffect(() => { setOutcomePage(0); }, [outcomeSearch, outcomeStatusFilter]);

  const openDraft = (lead) => { setSelectedId(lead.id); setTab('drafts'); };

  // ---- exports ----------------------------------------------------------------------
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
    a.download = `prioritized-leads-${today()}.csv`;
    a.click();
  };

  // Excel export — richer than CSV (a second sheet for pipeline/outcome status).
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
    // Every lead, with an Entity ID column — this sheet is designed to be edited in Excel
    // and re-uploaded via "Import outcomes" on Track Outcomes, so blank rows are intentional.
    const outcomeRows = leads.map(l => ({
      'Entity ID': l.entity_id, 'Business Name': l.name, 'Status': computeStatus(l).label,
      'Contacted': l.outcome?.contacted ? 'Yes' : '', 'Contacted Date': l.outcome?.contacted_date || '',
      'Replied': l.outcome?.replied ? 'Yes' : '', 'Response Type': l.outcome?.response_type || '',
      'Proposal Sent': l.outcome?.proposal_sent ? 'Yes' : '', 'Quoted Price': l.outcome?.quoted_price || '',
      'Materialized (Client)': l.outcome?.materialized ? 'Yes' : '', 'Reason Not Proceeded': l.outcome?.not_proceeded_reason || '',
      'Payment Received': l.outcome?.payment_received ? 'Yes' : '', 'Final Amount': l.outcome?.final_amount || '',
      'Notes': l.outcome?.notes || '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leadRows), 'Leads');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outcomeRows), 'Outcomes');
    XLSX.writeFile(wb, `outreach-report-${today()}.xlsx`);
  };

  // Import outcomes back in from an edited export.
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
          setImportStatus('No "Outcomes" sheet found — use a file exported from this tool (Export Excel on the Upload & Prioritize page).');
          setImporting(false);
          return;
        }
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
        const byEntityId = new Map(leads.map(l => [String(l.entity_id), l]));
        let updated = 0, noMatch = 0;
        for (const row of rows) {
          const lead = byEntityId.get(String(row['Entity ID'] || '').trim());
          if (!lead) { noMatch++; continue; }
          if (!OUTCOME_COLS.some(k => String(row[k] ?? '').trim() !== '')) continue;
          const replied = truthy(row['Replied']);
          const proposalSent = truthy(row['Proposal Sent']);
          const materialized = truthy(row['Materialized (Client)']);
          const paymentReceived = truthy(row['Payment Received']);
          const impliedContacted = replied || proposalSent || materialized || paymentReceived;
          const outcome = {
            contacted: truthy(row['Contacted']) || !!lead.outcome?.contacted || impliedContacted,
            contacted_date: row['Contacted Date'] || lead.outcome?.contacted_date || null,
            replied, response_type: row['Response Type'] || null, proposal_sent: proposalSent,
            quoted_price: row['Quoted Price'] || null, materialized,
            not_proceeded_reason: row['Reason Not Proceeded'] || null,
            payment_received: paymentReceived, final_amount: row['Final Amount'] || null, notes: row['Notes'] || '',
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
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ---- insights -----------------------------------------------------------------------
  const withOutcomeCount = leads.filter(l => l.outcome && l.outcome.contacted).length;
  const insightsReady = withOutcomeCount >= 3;
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
      notify({ tone: 'bad', title: 'Export failed', text: e.message });
    } finally {
      setExportingFormat('');
    }
  };

  // ---- hand everything to the pages --------------------------------------------------------
  const ctl = {
    leads, sender, me, isAdmin, notify, copy, setTab, selectedLead, selectedId, setSelectedId, openDraft, profileReady, dailyCap, testMode,
    // upload
    filteredSorted, filters, setFilters, industries, states, uploadPage, setUploadPage, handleFile, uploadStatus,
    preferredRegions, setPreferredRegions, rescoreAllLeads, rescoring, rescoreProgress, rescoreStatus,
    autoCheckOnUpload, setAutoCheckOnUpload, enrichBatchN, setEnrichBatchN, runWebCheckButton, stopWebChecks,
    enrichBatchRunning, enrichBatchProgress, enrichStatus, uncheckedLeads, enriching, enrichOneLead, exportCSV, exportXLSX,
    // drafts
    generating, runDraft, runBatch, batchN, setBatchN, batchRunning, batchProgress, draftError, setupAlert, goAdmin,
    sending, savingDraft, sendNow, saveAsGmailDraft, markSent, updateDraftBody, sendStats, enableTestMode, disableTestMode,
    batchSendN, setBatchSendN, batchSendDelayMin, setBatchSendDelayMin, MIN_BATCH_GAP_MIN, batchSendRunning, batchSendProgress, batchSendNote, runBatchSend, stopBatchSend,
    responseFor, gmailRows, gmailLoading, gmailError, refreshGmail,
    // outcomes
    outcomeTabLeads, outcomeSearch, setOutcomeSearch, outcomeStatusFilter, setOutcomeStatusFilter, outcomePage, setOutcomePage,
    outcomeDraft, setOutcomeDraft, saveOutcomeRow, savingOutcome, handleImportOutcomes, importing, importStatus,
    // insights
    insightsReady, withOutcomeCount, insightsData, insightsFilters, setInsightsFilters, runExport, exportingFormat,
    // profile
    saveProfile, uploadLogo: uploadSignatureLogo, sendSignatureTest: sendSignatureTestEmail,
    // admin
    serviceCheckSignal,
  };

  const counts = { leads: leads.length || null, drafts: leads.filter(l => l.draft).length || null };

  return (
    <div className="app">
      <style>{CSS}</style>
      <Sidebar
        tab={tab} setTab={setTab} counts={counts} sendMeter={{ count: sendStats.count, cap: dailyCap }}
        me={me} profile={sender} isAdmin={isAdmin} onSignOut={() => supabase.auth.signOut()}
        open={menuOpen} close={() => setMenuOpen(false)}
      />
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" aria-label="Open menu" onClick={() => setMenuOpen(o => !o)}><Menu size={18} /></button>
          <div className="crumb">Workspace<span>/</span><b>{TITLES[tab]}</b></div>
          <div className="grow" />
          <span className="small faint">{sender.company || 'Lead prioritization & outreach'}</span>
        </div>
        <main className="page" id="main">
          {!loaded ? <div className="empty"><Spinner size={18} /> Loading your saved leads…</div> : (
            <>
              {tab === 'upload' && <UploadPage ctl={ctl} />}
              {tab === 'drafts' && <DraftPage ctl={ctl} />}
              {tab === 'outcomes' && <OutcomesPage ctl={ctl} />}
              {tab === 'insights' && <InsightsPage ctl={ctl} />}
              {tab === 'profile' && <ProfilePage ctl={ctl} />}
              {tab === 'admin' && isAdmin && <AdminPage ctl={ctl} />}
            </>
          )}
        </main>
      </div>
      <Toasts items={toasts} dismiss={dismissToast} />
    </div>
  );
}
