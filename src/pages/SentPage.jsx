import React, { useMemo, useState, useEffect } from 'react';
import { Search, Send, FileText, FlaskConical, Eye, RotateCcw, Globe, Reply, XCircle, Archive } from 'lucide-react';
import { PageHeader, StatCard, ScorePill, Empty, Spinner, Notice, Segmented } from '../components/ui';
import EmailPreview from '../components/EmailPreview';
import { signatureIsEmpty } from '../lib/signature';
import { signatureDefault } from '../lib/sending';
import { ResponseBox } from '../components/DraftEditor';
import {
  RANGES, GROUPS, NO_RESPONSE_CHOICES, MAX_FOLLOW_UPS,
  filterByRange, countByGroup, daysAgoLabel, followUpState, followUpAddress,
} from '../lib/sent';

const LATEST_ROWS = 8;
const DECLINE_REASONS = ['Price too high', 'Chose competitor', 'Timing / not ready', 'Other'];
const GROUP_TAG = { awaiting: 'warn', replied: 'ok', noresponse: 'grey', declined: 'bad' };
const GROUP_LABEL = Object.fromEntries(GROUPS.map(g => [g.id, g.label]));

const when = (ms) => (ms == null ? '—' : new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
const whenDay = (ms) => (ms == null ? '—' : new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' }));

function GroupTag({ group }) {
  return <span className={`tag ${GROUP_TAG[group]}`}>{GROUP_LABEL[group]}</span>;
}

// What to do next, in a few words, for the lists.
function nextStep(facts, now) {
  const st = followUpState(facts, now);
  if (facts.group === 'declined') return 'Closed';
  if (facts.group === 'replied') return 'Log progress';
  if (st.ok) return facts.group === 'noresponse' ? 'Suggest a follow-up' : 'Follow-up available';
  if (st.code === 'too_soon') return `Follow up in ${st.waitDays} day${st.waitDays === 1 ? '' : 's'}`;
  if (st.code === 'limit') return 'Follow-ups used up';
  return '—';
}

export default function SentPage({ ctl }) {
  const {
    sentRows, sentRange, setSentRange, noResponseDays, setNoResponseDays, selectedLead, setSelectedId, setTab,
  } = ctl;
  const now = Date.now();

  const [group, setGroup] = useState('awaiting');
  const [search, setSearch] = useState('');

  const inRange = useMemo(() => filterByRange(sentRows, sentRange, now), [sentRows, sentRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => countByGroup(inRange), [inRange]);
  const latest = inRange.slice(0, LATEST_ROWS);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inRange.filter(r => r.group === group && (!q || r.lead.name.toLowerCase().includes(q)));
  }, [inRange, group, search]);

  const selected = selectedLead ? sentRows.find(r => r.lead.id === selectedLead.id) || null : null;
  // Arriving with a lead already chosen (from another tab): show the section it belongs to.
  useEffect(() => { if (selected) setGroup(selected.group); }, [selectedLead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const replyRate = inRange.length ? Math.round((counts.replied / inRange.length) * 100) : 0;
  const groupInfo = GROUPS.find(g => g.id === group);

  return (
    <>
      <PageHeader title="Sent" sub="Everyone you have emailed, in one place. Follow up, log replies, and see who has gone quiet.">
        <Segmented value={sentRange} onChange={setSentRange} options={RANGES.map(r => ({ value: r.id, label: r.label }))} />
      </PageHeader>

      {sentRows.length === 0 ? (
        <div className="card"><Empty title="Nothing sent yet" sub="Emails you send from Email Draft appear here, with follow-ups, replies and results. Test emails to yourself do not count.">
          <button className="btn primary" onClick={() => setTab('drafts')}><Send size={14} /> Go to Email Draft</button>
        </Empty></div>
      ) : (
        <div className="stack">
          <div className="grid g-4">
            <StatCard label="Emailed" value={inRange.length} sub={sentRange === 'all' ? 'Across all time' : (RANGES.find(r => r.id === sentRange) || RANGES[1]).label} />
            <StatCard label="Replied & in progress" value={counts.replied} sub={`${replyRate}% of those emailed`} />
            <StatCard label="No response" value={counts.noresponse} sub={`Quiet for ${noResponseDays}+ days`} />
            <StatCard label="Declined" value={counts.declined} sub="Said no — kept off your lists" />
          </div>

          {/* latest reached out ------------------------------------------------ */}
          <div className="card flush">
            <div className="card-pad">
              <div className="row between">
                <div>
                  <h2 className="card-title">Latest reached out</h2>
                  <p className="card-sub" style={{ marginBottom: 0 }}>The most recent emails in this range — click one to see the email and what you can do next.</p>
                </div>
                <span className="tag grey">{inRange.length}</span>
              </div>
            </div>
            {latest.length === 0 ? (
              <Empty title="No emails in this range" sub="Nothing was sent in this period.">
                <button className="btn sm" onClick={() => setSentRange('all')}>Show all time</button>
              </Empty>
            ) : (
              <div className="table-wrap">
                <table aria-label="Latest reached out">
                  <thead><tr><th>Business</th><th>Last emailed</th><th className="hide-narrow">Subject</th><th>Status</th><th>Follow-ups</th></tr></thead>
                  <tbody>
                    {latest.map(r => (
                      <tr key={r.lead.id} className={`click${selected && selected.lead.id === r.lead.id ? ' sel' : ''}`} onClick={() => setSelectedId(r.lead.id)}>
                        <td><div className="biz">{r.lead.name}</div><div className="sub">{[r.lead.district, r.lead.nic_label].filter(Boolean).join(' · ')}</div></td>
                        <td className="small"><div>{daysAgoLabel(r.lastAt, now)}</div><div className="faint xs">{when(r.lastAt)}</div></td>
                        <td className="small dim hide-narrow" style={{ maxWidth: 280 }}><div className="trunc">{r.subject || '—'}</div></td>
                        <td><GroupTag group={r.group} /></td>
                        <td className="small num">{r.followUpCount ? `${r.followUpCount} of ${MAX_FOLLOW_UPS}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* sections + detail ---------------------------------------------------- */}
          <div className="grid g-wide-side">
            <div className="card flush">
              <div className="card-pad">
                <div className="filter-chips" role="group" aria-label="Sent sections">
                  {GROUPS.map(g => (
                    <button key={g.id} className={group === g.id ? 'on' : ''} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}<small>{counts[g.id]}</small></button>
                  ))}
                </div>
                <p className="hint">{groupInfo.hint}</p>
                <div className="row mt12">
                  <div className="search"><Search size={15} /><input type="search" placeholder="Search emailed businesses…" aria-label="Search sent" value={search} onChange={e => setSearch(e.target.value)} /></div>
                  <label className="small dim row" style={{ gap: 6 }}>
                    No response after
                    <select aria-label="Days before a lead counts as no response" style={{ width: 96, minHeight: 30, padding: '3px 8px' }} value={noResponseDays} onChange={e => setNoResponseDays(Number(e.target.value))}>
                      {NO_RESPONSE_CHOICES.map(d => <option key={d} value={d}>{d} days</option>)}
                    </select>
                  </label>
                </div>
              </div>
              {shown.length === 0 ? (
                <Empty
                  title={`No one in “${groupInfo.label}”`}
                  sub={group === 'noresponse' && sentRange !== 'all' && sentRange !== '1m' ? `Someone only counts as no response after ${noResponseDays} quiet days, so a short range may be empty. Try a longer range.` : 'Nothing here for this range.'} />
              ) : (
                <div className="table-wrap">
                  <table aria-label={groupInfo.label}>
                    <thead><tr><th>Business</th><th className="hide-narrow">First emailed</th><th>Last contact</th><th className="hide-narrow">Follow-ups</th><th>Next step</th></tr></thead>
                    <tbody>
                      {shown.map(r => (
                        <tr key={r.lead.id} className={`click${selected && selected.lead.id === r.lead.id ? ' sel' : ''}`} onClick={() => setSelectedId(r.lead.id)}>
                          <td><div className="biz">{r.lead.name}</div><div className="sub">{followUpAddress(r.lead) || 'No address on record'}</div></td>
                          <td className="small dim hide-narrow">{whenDay(r.firstAt)}</td>
                          <td className="small dim">{daysAgoLabel(r.lastAt, now)}</td>
                          <td className="small num hide-narrow">{r.followUpCount ? `${r.followUpCount} of ${MAX_FOLLOW_UPS}` : '—'}</td>
                          <td className="small dim">{nextStep(r, now)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="sticky-panel">
              {selected ? <SentDetail key={selected.lead.id} facts={selected} ctl={ctl} /> : (
                <div className="card"><Empty title="Select someone" sub="Click a business to read the email you sent and decide what to do next." /></div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function SentDetail({ facts, ctl }) {
  const { lead } = facts;
  const { followUps, startFollowUp, quickOutcome, setTab, responseFor, copy } = ctl;
  const [showFirst, setShowFirst] = useState(false);
  const [recheck, setRecheck] = useState(true);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const o = lead.outcome || {};
  const now = Date.now();
  const state = followUpState(facts, now);
  const fu = followUps[lead.id] || {};
  const busy = fu.stage === 'checking' || fu.stage === 'writing';
  const closed = !!(o.not_proceeded_reason || o.response_type === 'Negative');
  const resp = responseFor(lead.id);

  return (
    <div className="card" data-testid="sent-detail">
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <h2 className="card-title" style={{ fontSize: 17 }}>{lead.name}</h2>
          <div className="small dim">{[lead.stakeholder_name, [lead.district, lead.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="row"><ScorePill score={lead.priority_score} /><GroupTag group={facts.group} /></span>
      </div>
      <dl className="mail-meta" style={{ borderBottom: 0, paddingBottom: 4 }}>
        <dt>To</dt><dd>{followUpAddress(lead) || '—'}</dd>
        <dt>Sent</dt><dd>{when(facts.firstAt)}{facts.viaGmail ? ' · via Gmail' : ' · marked as sent by hand'}</dd>
        <dt>Last</dt><dd>{daysAgoLabel(facts.lastAt, now)}{facts.followUpCount ? ` · ${facts.followUpCount} follow-up${facts.followUpCount === 1 ? '' : 's'} sent` : ''}</dd>
      </dl>

      {/* the first email -------------------------------------------------------- */}
      <div className="card-split" style={{ paddingTop: 12 }}>
        <div className="row between">
          <span className="eyebrow">First email</span>
          <button className="btn quiet sm" onClick={() => setShowFirst(v => !v)} aria-expanded={showFirst}>{showFirst ? 'Hide' : 'Read it'}</button>
        </div>
        <div className="strong" style={{ marginTop: 4 }}>{facts.subject || '(subject not saved)'}</div>
        {showFirst && (
          <pre className="sent-body">{facts.body || 'No copy of this email was saved.'}</pre>
        )}
        {facts.followUps.map((f, i) => (
          <details key={i} className="fu-item">
            <summary><b>Follow-up {i + 1}</b> · {whenDay(Date.parse(f.sent_at))} · {f.subject}</summary>
            <pre className="sent-body">{f.body}</pre>
          </details>
        ))}
        {resp && resp.kind !== 'test' && <ResponseBox response={resp} />}
      </div>

      {/* follow-up --------------------------------------------------------------- */}
      <div className="card-split mt16" style={{ paddingTop: 12 }}>
        <div className="row between"><span className="eyebrow">Follow-up</span>{state.ok && <span className="tag brand">Follow-up {state.number} of {MAX_FOLLOW_UPS}</span>}</div>

        {fu.error && <div className="mt8"><Notice tone="bad">{fu.error}</Notice></div>}

        {fu.stage === 'ready' && fu.draft ? (
          <FollowUpComposer facts={facts} ctl={ctl} fu={fu} />
        ) : busy ? (
          <div className="row mt8" role="status"><Spinner size={15} /> <span className="small">{fu.stage === 'checking' ? 'Checking their website and listings right now…' : 'Writing the follow-up…'}</span></div>
        ) : state.ok ? (
          <>
            <p className="hint">A short, polite nudge written from your first email{recheck ? ' and a fresh look at their website' : ''}. You read and edit it first — nothing is sent until you press Send.</p>
            <label className="check mt8">
              <input type="checkbox" checked={recheck} onChange={e => setRecheck(e.target.checked)} />
              <span>Check their website &amp; listings first <span className="faint">(live, uses one search)</span></span>
            </label>
            <button className="btn primary mt12" onClick={() => startFollowUp(facts, { recheck })}><Globe size={14} /> Suggest a follow-up</button>
          </>
        ) : (
          <div className="mt8"><Notice tone={state.code === 'too_soon' ? 'info' : 'warn'}>{state.reason}</Notice></div>
        )}
      </div>

      {/* what happened ------------------------------------------------------------ */}
      <div className="card-split mt16" style={{ paddingTop: 12 }}>
        <span className="eyebrow">What happened?</span>
        <div className="row mt8">
          {!o.replied && <button className="btn sm" onClick={() => quickOutcome(lead, { replied: true }, 'Marked as replied')}><Reply size={13} /> They replied</button>}
          {!closed && o.not_proceeded_reason !== 'No response' && (
            <button className="btn sm" onClick={() => quickOutcome(lead, { response_type: 'No response', not_proceeded_reason: 'No response' }, 'Closed as no response')}><Archive size={13} /> Give up — no response</button>
          )}
          {(closed || o.not_proceeded_reason) && (
            <button className="btn sm" onClick={() => quickOutcome(lead, { response_type: null, not_proceeded_reason: null }, 'Reopened')}><RotateCcw size={13} /> Reopen</button>
          )}
        </div>
        {!closed && (
          <div className="row mt8">
            <select aria-label="Reason they said no" value={reason} onChange={e => setReason(e.target.value)} style={{ flex: '1 1 150px', minHeight: 32, padding: '4px 8px' }}>
              {DECLINE_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
            <button className="btn sm danger" onClick={() => quickOutcome(lead, { replied: true, response_type: 'Negative', not_proceeded_reason: reason }, 'Marked as declined')}><XCircle size={13} /> Not interested</button>
          </div>
        )}
        <p className="hint">Proposals, quotes, payments and notes are logged in <button className="btn link sm" style={{ padding: 0 }} onClick={() => setTab('outcomes')}>Track Outcomes</button>.</p>
      </div>
      {copy && facts.body && <div className="mt8"><button className="btn quiet sm" onClick={() => copy(`Subject: ${facts.subject}\n\n${facts.body}`)}>Copy first email</button></div>}
    </div>
  );
}

// The follow-up, ready to read, edit and send.
function FollowUpComposer({ facts, ctl, fu }) {
  const { lead } = facts;
  const { sender, me, testMode, editFollowUp, discardFollowUp, sendFollowUp, saveFollowUpAsGmailDraft, sending, savingDraft, startFollowUp } = ctl;
  const draft = fu.draft;
  const hasSignature = !signatureIsEmpty(sender.signatureHtml);
  const [includeSig, setIncludeSig] = useState(() => signatureDefault({ draft }, sender.signatureHtml));
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => { setIncludeSig(signatureDefault({ draft }, sender.signatureHtml)); }, [draft.generatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const expectsSignature = draft.signatureMode === 'auto';
  const missingSignature = expectsSignature && !hasSignature;
  const realBlocked = !testMode && missingSignature;
  const opts = { includeSignature: includeSig && hasSignature };
  const isSending = !!sending[lead.id];
  const target = sender.testEmail || me?.email || 'your own address';

  return (
    <div className="mt8">
      {fu.recheck && (
        <div className={`resp-box ${fu.recheck.changed ? 'ok' : ''}`} style={{ marginTop: 0, marginBottom: 12 }} data-testid="recheck-summary">
          <div className="strong">Live website check{fu.recheck.changed ? ' — something changed' : ''}</div>
          <ul className="sources" style={{ marginTop: 4 }}>{fu.recheck.ui.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}
      {missingSignature && <div style={{ marginBottom: 10 }}><Notice tone="warn">This follow-up ends with only a closing phrase, but no signature is saved. Add one in Profile &amp; Settings, or regenerate it.</Notice></div>}

      <div className="mail-subject" style={{ fontSize: 15, marginTop: 4 }}>{draft.subject}</div>
      <textarea className="body-edit" style={{ minHeight: 190 }} aria-label="Follow-up body" value={draft.body} onChange={e => editFollowUp(lead.id, { body: e.target.value })} />

      <div className="row between mt8">
        <label className="check" style={{ opacity: hasSignature ? 1 : .55 }}>
          <input type="checkbox" checked={includeSig && hasSignature} disabled={!hasSignature} onChange={e => setIncludeSig(e.target.checked)} />
          <span>Add my signature</span>
        </label>
        <button className="btn quiet sm" onClick={() => setShowPreview(v => !v)}><Eye size={13} /> {showPreview ? 'Hide preview' : 'Preview'}</button>
      </div>
      {showPreview && <div className="mt8"><EmailPreview body={draft.body} signatureHtml={sender.signatureHtml} withSignature={includeSig && hasSignature} /></div>}

      {testMode && <p className="hint" style={{ color: 'var(--ok)' }}>Test mode is on: Send goes to {target}, and no follow-up is recorded for {lead.name}.</p>}

      <div className="action-bar" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={isSending || realBlocked || !draft.body.trim()} title={realBlocked ? 'Add a signature first' : ''} onClick={() => sendFollowUp(facts, opts)}>
          {isSending ? <Spinner size={14} /> : <Send size={14} />} Send follow-up
        </button>
        <button className="btn" disabled={!!savingDraft[lead.id]} title="Creates a draft in your Gmail — nothing is sent" onClick={() => saveFollowUpAsGmailDraft(facts, opts)}>
          {savingDraft[lead.id] ? <Spinner size={13} /> : <FileText size={14} />} Save as Gmail draft
        </button>
        <button className="btn" disabled={isSending} title="Sends this exact email to your own address" onClick={() => sendFollowUp(facts, { ...opts, forceTest: true })}>
          <FlaskConical size={14} /> Send test to me
        </button>
        <button className="btn quiet" disabled={isSending} title="Write a different version from the same findings" onClick={() => startFollowUp(facts, { recheck: false, rewrite: true })}>Rewrite</button>
        <button className="btn link sm" onClick={() => discardFollowUp(lead.id)}>Discard</button>
      </div>
      <p className="hint">It goes into the same Gmail conversation as your first email, so you see them together in your own Gmail. Whether the recipient's mail app also joins them depends on that app.</p>
    </div>
  );
}
