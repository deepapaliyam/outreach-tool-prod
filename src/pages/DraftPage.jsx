import React, { useState, useMemo, useEffect } from 'react';
import { Search, Sparkles, UserCog, Send } from 'lucide-react';
import { PageHeader, ScorePill, Empty, Spinner, Notice, Segmented } from '../components/ui';
import GmailConnect from '../components/GmailConnect';
import GmailResponses from '../components/GmailResponses';
import DraftEditor from '../components/DraftEditor';
import { ScoreBreakdown, WebFindings } from '../components/LeadPanel';
import { isSent } from '../lib/sent';

const QUEUE_LIMIT = 150;

export default function DraftPage({ ctl }) {
  const {
    leads, sender, me, setTab, selectedLead, selectedId, setSelectedId,
    generating, runDraft, runBatch, batchN, setBatchN, batchRunning, batchProgress, draftError, setupAlert, goAdmin, isAdmin,
    sending, savingDraft, sendNow, saveAsGmailDraft, markSent, updateDraftBody, enriching, enrichOneLead, copy, notify,
    sendStats, dailyCap, testMode, enableTestMode, disableTestMode, profileReady,
    batchSendN, setBatchSendN, batchSendDelayMin, setBatchSendDelayMin, MIN_BATCH_GAP_MIN, batchSendRunning, batchSendProgress, batchSendNote, runBatchSend, stopBatchSend,
    responseFor, gmailRows, gmailLoading, gmailError, refreshGmail, sentRows,
  } = ctl;

  const [filter, setFilter] = useState('review');
  const [search, setSearch] = useState('');

  // The queue is for emails still to be written, reviewed and sent. Anyone already emailed
  // lives in the Sent tab and never appears here.
  const sorted = useMemo(() => leads.filter(l => !isSent(l)).sort((a, b) => b.priority_score - a.priority_score), [leads]);
  const noDraft = useMemo(() => sorted.filter(l => !l.draft), [sorted]);
  const toReview = useMemo(() => sorted.filter(l => l.draft), [sorted]);
  const sentCount = sentRows.length;
  const shownAll = filter === 'review' ? toReview : filter === 'nodraft' ? noDraft : sorted;
  const queue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? shownAll.filter(l => l.name.toLowerCase().includes(q)) : shownAll).slice(0, QUEUE_LIMIT);
  }, [shownAll, search]);

  // Keep the queue showing the lead that is open: coming here from Upload & Prioritize
  // with a lead that has no draft yet, or finishing a draft, should not leave it hidden
  // behind the wrong filter. Runs when the selection or its draft appears — not on every edit.
  const hasDraft = !!selectedLead?.draft;
  useEffect(() => {
    if (!selectedLead || isSent(selectedLead)) return;      // someone already emailed is not in the queue, so they must not move the filter
    setFilter(f => {
      if (f === 'all') return f;
      if (!hasDraft) return 'nodraft';
      return f === 'nodraft' ? 'review' : f;
    });
  }, [selectedId, hasDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  // First visit with nothing drafted yet: show who still needs a draft instead of an empty list.
  useEffect(() => {
    if (toReview.length === 0 && noDraft.length > 0) setFilter(f => (f === 'review' ? 'nodraft' : f));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const atLimit = sendStats.count >= dailyCap;
  const pct = Math.min(100, Math.round((sendStats.count / dailyCap) * 100));
  const batchCount = Math.min(batchN, noDraft.length);
  const goProfile = () => setTab('profile');
  const draftReady = (l) => !!l.draft;

  return (
    <>
      <PageHeader title="Email Draft" sub="Personal, evidence-led outreach. Every email gets a human review before it leaves.">
        <button className="btn primary" disabled={batchRunning || !profileReady || batchCount === 0} onClick={runBatch}>
          {batchRunning ? <><Spinner size={14} /> {batchProgress.done}/{batchProgress.total}</> : <><Sparkles size={15} /> Generate batch · {batchCount} lead{batchCount === 1 ? '' : 's'}</>}
        </button>
      </PageHeader>

      <div className="stack">
        {!profileReady && (
          <Notice tone="warn" action={<button className="btn sm" onClick={goProfile}><UserCog size={13} /> Open Profile &amp; Settings</button>}>
            <b>Add your name and what you offer first.</b> Your details, writing style and signature now live in Profile &amp; Settings — drafts use them automatically.
          </Notice>
        )}
        {draftError && <Notice tone="bad">{draftError}</Notice>}
        {setupAlert && isAdmin && (
          <Notice tone="warn" action={<button className="btn sm" onClick={goAdmin}>Run service check</button>}>
            <b>A setup problem was detected</b> (an API key, credit or Gmail connection). The Admin tab can test every service and show what to fix.
          </Notice>
        )}

        {/* Gmail card ------------------------------------------------- */}
        <div className="card gmail-card">
          <GmailConnect address={me?.email} />
          <div>
            <Segmented value={testMode ? 'test' : 'real'} onChange={v => (v === 'test' ? enableTestMode() : disableTestMode())}
              options={[{ value: 'real', label: 'Real sending', warn: true }, { value: 'test', label: 'Test mode' }]} />
            <div className="xs" style={{ marginTop: 6, color: testMode ? 'var(--ok)' : 'var(--bad)' }}>
              {testMode
                ? `Test mode: sends go to ${sender.testEmail || me?.email || 'your own address'}, and leads are not marked contacted.`
                : 'Real sending is ON: emails go to the leads\' real addresses.'}
            </div>
          </div>
          <div className="gmail-meter">
            <div className="row between"><span className="strong">{sendStats.count} of {dailyCap} sent today</span><span className="small dim">{Math.max(0, dailyCap - sendStats.count)} remaining</span></div>
            <div className={`bar${atLimit ? ' full' : ''}`}><i style={{ width: `${pct}%` }} /></div>
            <div className="xs faint">{atLimit ? 'Limit reached — the next slot opens as older sends age out. ' : ''}Real sends only · at least 2 minutes apart · same address never twice in 30 days{testMode ? ' · test sends don’t count' : ''}</div>
          </div>
        </div>

        <div className="grid g-draft">
          {/* queue -------------------------------------------------- */}
          <div className="card" style={{ paddingBottom: 0 }}>
            <div className="card-h"><h2 className="card-title">Today's queue</h2><span className="tag grey">{shownAll.length}</span></div>
            <div className="search" style={{ flex: 'none', marginBottom: 10 }}><Search size={15} /><input type="search" placeholder="Search queue…" aria-label="Search queue" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div className="filter-chips" role="group" aria-label="Queue filter" style={{ marginBottom: 12 }}>
              {[['review', 'To review', toReview.length], ['nodraft', 'No draft', noDraft.length], ['all', 'All', sorted.length]].map(([id, label, n]) => (
                <button key={id} className={filter === id ? 'on' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<small>{n}</small></button>
              ))}
            </div>
            {queue.length === 0 ? <Empty title="Nothing here" sub={filter === 'review' ? (sentCount ? 'Nothing waiting to be sent. Generate more drafts, or open the Sent tab to follow up.' : 'Generate drafts to start reviewing.') : 'No leads match.'} /> : (
              <ul className="queue-list" style={{ listStyle: 'none', padding: 0 }}>
                {queue.map(l => (
                  <li key={l.id} className={`q-item${selectedId === l.id ? ' sel' : ''}`}>
                    <button className="q-select" onClick={() => setSelectedId(l.id)} aria-label={`Open ${l.name}`}>
                      <span className="q-top"><span className="q-name">{l.name}</span><ScorePill score={l.priority_score} /></span>
                      <span className="q-sub" style={{ display: 'block' }}>{[l.district, l.nic_label].filter(Boolean).join(' · ')}</span>
                      {l.draft && <span className="q-subj" style={{ display: 'block' }}>{l.draft.subject}</span>}
                      <span className="q-badge">{l.draft ? <span className="tag brand">Ready to review</span> : <span className="tag grey">No draft</span>}</span>
                    </button>
                    {!l.draft && (
                      <button className="btn sm" disabled={generating[l.id] || !profileReady} onClick={() => runDraft(l)}>
                        {generating[l.id] ? <Spinner size={12} /> : 'Draft'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {shownAll.length > QUEUE_LIMIT && !search && <p className="hint" style={{ padding: '8px 0 14px' }}>Showing the top {QUEUE_LIMIT} by score — use search to find others.</p>}
            {sentCount > 0 && (
              <div className="queue-foot">
                <span className="small dim">{sentCount} lead{sentCount === 1 ? ' has' : 's have'} already been emailed and {sentCount === 1 ? 'is' : 'are'} not in this queue.</span>
                <button className="btn link sm" onClick={() => setTab('sent')}>Open Sent</button>
              </div>
            )}
          </div>

          {/* editor ------------------------------------------------- */}
          <div>
            {selectedLead && isSent(selectedLead) ? (
              <div className="card"><Empty
                title={`${selectedLead.name} has already been emailed`}
                sub="The first email can only go out once. Follow-ups, replies and results are handled in the Sent tab.">
                <button className="btn primary" onClick={() => setTab('sent')}><Send size={14} /> Open in Sent</button>
              </Empty></div>
            ) : !selectedLead || !draftReady(selectedLead) ? (
              <div className="card"><Empty
                title={selectedLead ? `No draft for ${selectedLead.name} yet` : 'Select a lead with a draft'}
                sub={selectedLead ? 'Write one now — nothing is sent until you review it and press send yourself.' : 'Pick someone from the queue, or generate a batch.'}>
                {selectedLead && (
                  <button className="btn primary" disabled={generating[selectedLead.id] || !profileReady} onClick={() => runDraft(selectedLead)}>
                    {generating[selectedLead.id] ? <><Spinner size={14} /> Writing…</> : <><Sparkles size={15} /> Write draft for {selectedLead.name}</>}
                  </button>
                )}
              </Empty></div>
            ) : (
              <DraftEditor
                key={selectedLead.id}
                lead={selectedLead} sender={sender} me={me} testMode={testMode}
                generating={generating[selectedLead.id]} sending={sending[selectedLead.id]} savingDraft={savingDraft[selectedLead.id]}
                response={responseFor(selectedLead.id)}
                onRegenerate={runDraft} onSend={sendNow} onSaveDraft={saveAsGmailDraft} onMarkSent={markSent} onBodyUpdated={updateDraftBody}
                copy={copy} notify={notify} goProfile={goProfile}
              />
            )}
          </div>

          {/* context ------------------------------------------------ */}
          <div className="stack">
            {selectedLead && selectedLead.draft && (
              <div className="card">
                <h2 className="card-title">Evidence used in this draft</h2>
                <ul className="evals">{(selectedLead.draft.evaluation || []).map((e, i) => <li key={i}>{e}</li>)}</ul>
                {selectedLead.draft.sources && selectedLead.draft.sources.length > 0 && (
                  <>
                    <div className="sec-h mt12">Sources</div>
                    <ul className="sources">{selectedLead.draft.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </>
                )}
              </div>
            )}
            {selectedLead && (
              <details className="card">
                <summary className="strong" style={{ cursor: 'pointer' }}>Lead score &amp; web check{selectedLead.web_findings ? '' : ' — not checked yet'}</summary>
                <ScoreBreakdown lead={selectedLead} />
                <WebFindings lead={selectedLead} onCheck={enrichOneLead} checking={enriching[selectedLead.id]} />
              </details>
            )}

            <div className="card">
              <h2 className="card-title">Batch tools</h2>
              <div className="field mt12">
                <label>Generate drafts</label>
                <div className="row small">Top <input className="input-sm" type="number" min="1" value={batchN} aria-label="How many drafts to generate" onChange={e => setBatchN(Math.max(1, Number(e.target.value) || 1))} /> without a draft
                </div>
                <p className="hint">Highest priority first, on demand — never all at once. Use the button at the top of the page.</p>
              </div>
              <div className="card-split" style={{ paddingTop: 12 }}>
                <label className="lbl">Send in batch (spaced)</label>
                <p className="hint" style={{ marginTop: 0 }}>One at a time with a real gap, so it never looks like bulk mail. Runs in this browser tab — keep it open. {toReview.length} draft{toReview.length === 1 ? ' is' : 's are'} ready; anyone already sent is never included.</p>
                <div className="row small mt8">
                  Top <input className="input-sm" type="number" min="1" value={batchSendN} disabled={batchSendRunning} aria-label="How many drafts to send" onChange={e => setBatchSendN(Math.max(1, Number(e.target.value) || 1))} />
                  every <input className="input-sm" type="number" min={MIN_BATCH_GAP_MIN} value={batchSendDelayMin} disabled={batchSendRunning} aria-label="Minutes between sends" onChange={e => setBatchSendDelayMin(Math.max(MIN_BATCH_GAP_MIN, Number(e.target.value) || MIN_BATCH_GAP_MIN))} /> min
                </div>
                <div className="row mt8">
                  {!batchSendRunning ? (
                    <button className="btn primary sm" onClick={runBatchSend}>Start spaced send</button>
                  ) : (
                    <>
                      <span className="small" role="status">Sent {batchSendProgress.done}/{batchSendProgress.total}
                        {batchSendProgress.nextInSeconds > 0 && ` — next in ${Math.floor(batchSendProgress.nextInSeconds / 60)}:${String(batchSendProgress.nextInSeconds % 60).padStart(2, '0')}`}</span>
                      <button className="btn sm" onClick={stopBatchSend}>Stop</button>
                    </>
                  )}
                </div>
                {batchSendNote && <p className="hint" role="status">{batchSendNote}</p>}
              </div>
            </div>

            <Notice tone="warn"><b>You're always in control.</b> Generating a draft never sends anything. You choose the contact, review the facts and press send yourself.</Notice>
          </div>
        </div>

        <GmailResponses rows={gmailRows} loading={gmailLoading} error={gmailError} onRefresh={refreshGmail} onCopy={copy} />
      </div>
    </>
  );
}
