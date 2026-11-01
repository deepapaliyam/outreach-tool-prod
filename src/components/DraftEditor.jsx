import React, { useState, useEffect } from 'react';
import { Send, Copy, RefreshCw, FileText, FlaskConical, Eye } from 'lucide-react';
import { ScorePill, Spinner, Notice } from './ui';
import EmailPreview from './EmailPreview';
import { refineSelection } from '../lib/refining';
import { signatureIsEmpty } from '../lib/signature';
import { signatureDefault } from '../lib/sending';
import { KIND_LABEL } from '../lib/gmailResponses';
import { draftIsOlderThanWebCheck } from '../lib/webcheck';

// The middle column of Email Draft. Owns its own local buffer for the body text
// so typing/selecting feels instant, independent of the parent's Supabase
// round-trips. Resets whenever a different lead is selected, or a full
// regenerate produces a new generatedAt timestamp.
export function ResponseBox({ response }) {
  if (!response) return null;
  const when = response.at ? new Date(response.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className={`resp-box ${response.ok ? 'ok' : 'bad'}`} role="status" data-testid="gmail-response">
      <div className="strong">{response.ok ? 'Gmail accepted this email' : 'Gmail did not accept this email'}
        <span className="faint" style={{ fontWeight: 400 }}> · {KIND_LABEL[response.kind] || response.kind}{when ? ` · ${when}` : ''}</span></div>
      {response.ok ? (
        <dl className="kv">
          <dt>Message ID</dt><dd>{response.messageId || '—'}</dd>
          <dt>Thread ID</dt><dd>{response.threadId || '—'}</dd>
          <dt>Labels</dt><dd>{(response.labelIds || []).join(', ') || '—'}</dd>
        </dl>
      ) : (
        <div className="small" style={{ marginTop: 4 }}>{response.error || 'Gmail returned no details.'}</div>
      )}
    </div>
  );
}

export default function DraftEditor({
  lead, sender, me, testMode, generating, sending, savingDraft, response,
  onRegenerate, onSend, onSaveDraft, onMarkSent, onBodyUpdated, copy, notify, goProfile,
}) {
  const [bodyText, setBodyText] = useState(lead.draft.body);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const hasSignature = !signatureIsEmpty(sender.signatureHtml);
  const [includeSig, setIncludeSig] = useState(() => signatureDefault(lead, sender.signatureHtml));

  useEffect(() => {
    setBodyText(lead.draft.body);
    setDirty(false);
    setSelStart(0);
    setSelEnd(0);
    setInstruction('');
    setIncludeSig(signatureDefault(lead, sender.signatureHtml));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.draft?.generatedAt]);

  const handleSelect = (e) => { setSelStart(e.target.selectionStart); setSelEnd(e.target.selectionEnd); };
  const hasSelection = selEnd > selStart;
  const locked = !!lead.outcome?.contacted;
  const expectsSignature = lead.draft.signatureMode === 'auto';
  const missingSignature = expectsSignature && !hasSignature;
  const realBlocked = !testMode && missingSignature;

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
      setDirty(false); setSelStart(0); setSelEnd(0); setInstruction('');
    } catch (e) {
      notify({ tone: 'bad', title: 'Rewrite failed', text: e.message });
    } finally {
      setRefining(false);
    }
  };

  const toAddr = lead.draft.sendTo || '—';
  const toName = lead.stakeholder_name || lead.name;
  const fromName = sender.name || 'You';
  const sendOpts = { includeSignature: includeSig };

  return (
    <div className="card">
      <div className="row between">
        <div>
          <h2 className="card-title" style={{ fontSize: 17 }}>{lead.name}</h2>
          <div className="small dim">Personal draft{lead.draft.generatedAt ? ` · generated ${new Date(lead.draft.generatedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
        </div>
        <span className="row">
          <ScorePill score={lead.priority_score} />
          {locked ? <span className="tag ok">Sent {lead.outcome.contacted_date}{lead.outcome.sent_via_gmail ? ' · Gmail' : ''}</span> : <span className="tag grey">Not sent</span>}
        </span>
      </div>

      {draftIsOlderThanWebCheck(lead) && !locked && (
        <div className="mt12"><Notice tone="warn">The web check is newer than this draft — press Regenerate to write it using the latest findings.</Notice></div>
      )}
      {missingSignature && !locked && (
        <div className="mt12"><Notice tone="warn" action={<button className="btn sm" onClick={goProfile}>Open Profile &amp; Settings</button>}>
          <b>This draft was written for your signature, but none is saved.</b> It ends with only a closing phrase. Add a signature, or regenerate the draft so it signs off with your name.
        </Notice></div>
      )}

      <dl className="mail-meta">
        <dt>To</dt><dd><b>{toName}</b> &lt;{toAddr}&gt;{testMode && !locked && <span className="tag warn" style={{ marginLeft: 8 }}>Test mode → {sender.testEmail || me?.email || 'your address'}</span>}</dd>
        <dt>From</dt><dd><b>{fromName}</b> &lt;{me?.email || ''}&gt;</dd>
      </dl>
      <div className="mail-subject">{lead.draft.subject}</div>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="eyebrow">Body{dirty && <em style={{ color: 'var(--bad)', fontStyle: 'normal' }}> · unsaved edit</em>}</span>
        <button className="btn quiet sm" onClick={() => copy(`Subject: ${lead.draft.subject}\n\n${bodyText}`)}><Copy size={12} /> Copy</button>
      </div>
      <textarea className="body-edit" aria-label="Email body" value={bodyText} disabled={locked}
        onChange={e => { setBodyText(e.target.value); setDirty(true); }}
        onSelect={handleSelect} onMouseUp={handleSelect} onKeyUp={handleSelect} />

      {!locked && (
        <div className="refine">
          <input type="text" aria-label="Rewrite instruction" value={instruction} disabled={!hasSelection} onChange={e => setInstruction(e.target.value)}
            placeholder={hasSelection ? `Optional instruction for: "${bodyText.slice(selStart, selEnd).slice(0, 36)}${selEnd - selStart > 36 ? '…' : ''}"` : 'Select text in the body above to rewrite just that part'} />
          <button className="btn sm" disabled={!hasSelection || refining} onClick={doRewrite}>{refining ? <Spinner size={12} /> : 'Rewrite selection'}</button>
          {dirty && <button className="btn sm primary" disabled={saving} onClick={saveEdit}>{saving ? <Spinner size={12} /> : 'Save edit'}</button>}
        </div>
      )}

      {/* signature --------------------------------------------------- */}
      <div className="card-split mt16" style={{ paddingTop: 12 }}>
        <div className="row between">
          <label className="check" style={{ opacity: hasSignature ? 1 : .55 }}>
            <input type="checkbox" checked={includeSig && hasSignature} disabled={!hasSignature || locked} onChange={e => setIncludeSig(e.target.checked)} />
            <span>Add my signature</span>
          </label>
          <span className="row">
            <button className="btn quiet sm" onClick={() => setShowPreview(v => !v)}><Eye size={13} /> {showPreview ? 'Hide preview' : 'Preview email'}</button>
            <button className="btn link sm" onClick={goProfile}>{hasSignature ? 'Edit signature' : 'Set up signature'}</button>
          </span>
        </div>
        {!hasSignature && <p className="hint">No signature saved yet — emails go out as plain text. Add one in Profile &amp; Settings (logo, links and more).</p>}
        {hasSignature && !expectsSignature && <p className="hint">This draft already signs off with your name, so the signature is off by default to avoid repeating it.</p>}
        {showPreview && <div className="mt8"><EmailPreview body={bodyText} signatureHtml={sender.signatureHtml} withSignature={includeSig && hasSignature} /></div>}
      </div>

      {/* actions ------------------------------------------------------ */}
      <div className="action-bar">
        {!locked ? (
          <>
            <button className="btn primary" disabled={sending || dirty || realBlocked} title={dirty ? 'Save your edit before sending' : realBlocked ? 'Add a signature first' : ''} onClick={() => onSend(lead, sendOpts)}>
              {sending ? <Spinner size={14} /> : <Send size={14} />} Send via Gmail
            </button>
            <button className="btn" disabled={savingDraft || dirty} title={dirty ? 'Save your edit first' : 'Creates a draft in your Gmail — nothing is sent'} onClick={() => onSaveDraft(lead, sendOpts)}>
              {savingDraft ? <Spinner size={13} /> : <FileText size={14} />} Save as Gmail draft
            </button>
            <button className="btn" disabled={sending || dirty} title="Sends this exact email to your own address so you can see it" onClick={() => onSend(lead, { ...sendOpts, forceTest: true })}>
              <FlaskConical size={14} /> Send test to me
            </button>
            <button className="btn quiet" disabled={generating || dirty} title={dirty ? 'Save or discard your edit first' : ''} onClick={() => onRegenerate(lead)}>
              {generating ? <Spinner size={13} /> : <RefreshCw size={14} />} Regenerate
            </button>
            <span className="grow" />
            <button className="btn link sm" disabled={dirty} onClick={() => onMarkSent(lead)}>Sent manually — just mark it</button>
          </>
        ) : <span className="small dim">Locked — this exact wording was sent and is preserved for insights. Regenerating is disabled after send.</span>}
      </div>
      {dirty && !locked && <p className="hint">Save your edit before sending, so the wording that's sent matches what gets recorded for insights.</p>}
      <ResponseBox response={response} />
    </div>
  );
}
