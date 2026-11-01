import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Check, Circle, Send, Save } from 'lucide-react';
import { PageHeader, Spinner, Notice } from '../components/ui';
import SignatureEditor from '../components/SignatureEditor';
import { TONES, profileFingerprint } from '../lib/profile';
import { buildStarterSignature, signatureIsEmpty, normalizeUrl } from '../lib/signature';

function LinkRows({ rows, setRows, labelPh, urlPh, addLabel }) {
  const update = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      {rows.map((r, i) => (
        <div className="link-row" key={i}>
          <input type="text" aria-label={`${addLabel} name ${i + 1}`} placeholder={labelPh} value={r.label} onChange={e => update(i, { label: e.target.value })} />
          <input type="text" aria-label={`${addLabel} address ${i + 1}`} placeholder={urlPh} value={r.url} onChange={e => update(i, { url: e.target.value })} />
          <button className="icon-btn" aria-label={`Remove ${addLabel.toLowerCase()} ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setRows([...rows, { label: '', url: '' }])}><Plus size={13} /> {addLabel}</button>
    </div>
  );
}

function Section({ n, title, sub, children }) {
  return (
    <div className="card">
      <h2 className="card-title"><span className="sec-num">{n}</span>{title}</h2>
      {sub && <p className="card-sub">{sub}</p>}
      <div className={sub ? '' : 'mt12'}>{children}</div>
    </div>
  );
}

export default function ProfilePage({ ctl }) {
  const { sender, saveProfile, uploadLogo, notify, me, sendSignatureTest } = ctl;
  const [form, setForm] = useState(sender);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setStatus(null); };

  const saved = useMemo(() => profileFingerprint(sender), [sender]);
  const dirty = useMemo(() => profileFingerprint(form) !== saved, [form, saved]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const result = await saveProfile(form);
      setStatus({ tone: 'ok', text: result.message });
      // Show what was really stored (links tidied, e.g. https:// added), so nothing looks unsaved afterwards.
      if (result.profile) setForm(result.profile);
      else if (result.referenceNotes) setForm(f => ({ ...f, referenceNotes: result.referenceNotes }));
    } catch (e) {
      setStatus({ tone: 'bad', text: 'Save failed: ' + e.message });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await sendSignatureTest();
      notify({ tone: 'ok', title: `Test email sent to ${r.to}`, text: `Gmail accepted it (message ${r.gmail?.messageId || 'ID not returned'}). Check your inbox to see the signature.` });
    } catch (e) {
      notify({ tone: 'bad', title: 'Test email failed', text: e.message });
    } finally {
      setTesting(false);
    }
  };

  const hasSig = !signatureIsEmpty(form.signatureHtml);
  const emailBad = form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim());
  const siteBad = form.website && !normalizeUrl(form.website);
  const checklist = [
    ['Your name', !!form.name, true],
    ['What you offer', !!form.offer, true],
    ['Business information', !!form.businessInfo.trim(), false],
    ['Preferred tone', !!form.tone, false],
    ['Email signature', hasSig, false],
    ['Portfolio links', form.portfolioLinks.some(l => l.url), false],
  ];
  const doneCount = checklist.filter(c => c[1]).length;

  return (
    <>
      <PageHeader title="Profile & Settings" sub="Who you are, how you write and how your emails are signed. Set it once — every draft and every send uses it." />

      <div className="grid g-profile">
        <div className="stack">
          <Section n={1} title="Your details" sub="Used in drafts and to build your signature.">
            <div className="g-fields">
              <div className="field"><label htmlFor="p-name">Full name <span className="opt">— required</span></label><input id="p-name" type="text" value={form.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Riya Mehta" /></div>
              <div className="field"><label htmlFor="p-title">Job title</label><input id="p-title" type="text" value={form.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Founder & web designer" /></div>
              <div className="field"><label htmlFor="p-phone">Phone</label><input id="p-phone" type="tel" value={form.phone} onChange={e => set({ phone: e.target.value })} placeholder="+91 98765 43210" /></div>
              <div className="field"><label htmlFor="p-email">Contact email</label>
                <input id="p-email" type="email" value={form.contactEmail} onChange={e => set({ contactEmail: e.target.value })} placeholder={me?.email || 'you@yourbusiness.com'} aria-invalid={!!emailBad} />
                {emailBad && <p className="hint" style={{ color: 'var(--bad)' }}>That doesn't look like an email address.</p>}
              </div>
              <div className="field"><label htmlFor="p-company">Business name</label><input id="p-company" type="text" value={form.company} onChange={e => set({ company: e.target.value })} placeholder="e.g. Northstar Studio" /></div>
              <div className="field"><label htmlFor="p-site">Business website</label>
                <input id="p-site" type="text" value={form.website} onChange={e => set({ website: e.target.value })} placeholder="northstar.studio" aria-invalid={!!siteBad} />
                {siteBad && <p className="hint" style={{ color: 'var(--bad)' }}>Use a web address like northstar.studio.</p>}
              </div>
            </div>
          </Section>

          <Section n={2} title="About your business" sub="The AI reads this to describe what you do accurately — it never invents details beyond it.">
            <div className="field"><label htmlFor="p-offer">What you offer <span className="opt">— required</span></label>
              <textarea id="p-offer" value={form.offer} onChange={e => set({ offer: e.target.value })} placeholder="e.g. Mobile-first websites for local businesses. Clinic sites from ₹24,000, with enquiry forms and a 2-week launch." /></div>
            <div className="field"><label htmlFor="p-info">Business information <span className="opt">— optional: your story, services, pricing, location, anything a client should know</span></label>
              <textarea id="p-info" style={{ minHeight: 110 }} value={form.businessInfo} onChange={e => set({ businessInfo: e.target.value })} placeholder="e.g. Based in Bengaluru. We've built 40+ sites for clinics, cafés and interior studios. We handle design, copy and hosting." /></div>
          </Section>

          <Section n={3} title="Writing style" sub="So drafts sound like you, not like a template.">
            <div className="field"><label htmlFor="p-tone">Preferred email tone</label>
              <select id="p-tone" value={form.tone} onChange={e => set({ tone: e.target.value })}>
                <option value="">Warm, professional default</option>
                {TONES.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="field"><label htmlFor="p-sample">Sample of your own writing <span className="opt">— optional: paste an email you've actually sent</span></label>
              <textarea id="p-sample" style={{ minHeight: 120 }} value={form.voiceSample} onChange={e => set({ voiceSample: e.target.value })} placeholder="Hi Neha, I loved the seasonal menu you shared…" /></div>
          </Section>

          <Section n={4} title="Links" sub="Used to build your signature. Portfolio links are also read by the AI, so drafts can mention your real work.">
            <label className="lbl">Portfolio &amp; case studies <span className="opt">— the first 5 are read by the AI</span></label>
            <LinkRows rows={form.portfolioLinks} setRows={r => set({ portfolioLinks: r })} labelPh="Name (e.g. Clinic case study)" urlPh="https://your-portfolio.com/work" addLabel="Portfolio link" />
            <label className="lbl mt16">Social profiles</label>
            <LinkRows rows={form.socialLinks} setRows={r => set({ socialLinks: r })} labelPh="Name (e.g. LinkedIn)" urlPh="https://linkedin.com/in/you" addLabel="Social link" />
            {form.referenceNotes && form.referenceNotes.length > 0 && (
              <div className="note info mt12"><div className="grow small">
                <b>Read by the AI at your last save:</b>
                <ul className="sources">{form.referenceNotes.map((r, i) => <li key={i}>{r.url}{r.error ? ' — could not be fetched' : r.text ? ` — “${r.text.slice(0, 60)}…”` : ' — page had no readable text'}</li>)}</ul>
              </div></div>
            )}
          </Section>

          <Section n={5} title="Email signature" sub="Added automatically to the end of every email you send. Style it, add your logo and links — what you see below is how it is sent.">
            <SignatureEditor
              key={`sig-${me?.id || 'me'}`}
              value={form.signatureHtml}
              onChange={html => set({ signatureHtml: html })}
              getStarter={() => buildStarterSignature(form)}
              uploadLogo={uploadLogo}
              notify={notify}
            />
            <div className="row between mt12">
              <span className="small dim">{hasSig ? 'Drafts will end with just a closing phrase — your signature adds the rest.' : 'No signature yet: drafts will sign off with your name and emails go out as plain text.'}</span>
              <span className="row">
                {hasSig && <button className="btn sm danger" onClick={() => { if (window.confirm('Remove your signature?')) set({ signatureHtml: '' }); }}>Remove signature</button>}
                <button className="btn sm" disabled={testing || dirty || !hasSig} onClick={sendTest}
                  title={dirty ? 'Save your changes first — the test uses the saved signature' : 'Sends a test email to your own address'}>
                  {testing ? <Spinner size={12} /> : <Send size={13} />} Send me a test email
                </button>
              </span>
            </div>
            {dirty && hasSig && <p className="hint">Save your changes to test the signature in a real inbox.</p>}
          </Section>

          <Section n={6} title="Sending safety" sub="Protects your Gmail account's reputation. Enforced on the server, so a second tab or a refresh can't get around it.">
            <div className="g-fields">
              <div className="field"><label htmlFor="p-cap">Daily safe-send limit <span className="opt">— real sends per rolling 24 hours (1–100)</span></label>
                <input id="p-cap" type="number" min="1" max="100" style={{ maxWidth: 110 }} value={form.dailySendCap} onChange={e => set({ dailySendCap: e.target.value })} />
                <p className="hint">Gmail allows far more, but cold outreach beyond roughly 30–50 a day from one mailbox risks the account being flagged.</p></div>
              <div className="field"><label htmlFor="p-test">Test-mode email <span className="opt">— where test sends go</span></label>
                <input id="p-test" type="email" value={form.testEmail} onChange={e => set({ testEmail: e.target.value })} placeholder={`defaults to ${me?.email || 'your login email'}`} /></div>
            </div>
          </Section>

          <div className="sticky-save">
            <div className="card">
              <button className="btn primary" disabled={saving || !dirty || emailBad || siteBad} onClick={save}>
                {saving ? <><Spinner size={14} /> Saving…</> : <><Save size={14} /> Save changes</>}
              </button>
              <span className="small" role="status" style={{ color: status?.tone === 'bad' ? 'var(--bad)' : status?.tone === 'ok' ? 'var(--ok)' : 'var(--ink-2)' }}>
                {status ? status.text : dirty ? 'You have unsaved changes.' : 'All changes saved.'}
              </span>
            </div>
          </div>
        </div>

        <div className="stack" style={{ position: 'sticky', top: 66 }}>
          <div className="card">
            <h2 className="card-title">Profile checklist</h2>
            <p className="card-sub">{doneCount} of {checklist.length} done</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {checklist.map(([label, ok, required]) => (
                <li key={label} className="row" style={{ gap: 9, padding: '5px 0', fontSize: 13 }}>
                  {ok ? <Check size={15} style={{ color: 'var(--ok)' }} /> : <Circle size={15} style={{ color: 'var(--ink-3)' }} />}
                  <span style={{ color: ok ? 'var(--ink)' : 'var(--ink-2)' }}>{label}</span>
                  {required && !ok && <span className="tag warn">Needed to draft</span>}
                </li>
              ))}
            </ul>
          </div>
          <Notice tone="info"><b>Where this is used.</b> Name, title, business information and tone shape every draft. The signature is added when an email is sent. Nothing here is shown to other users.</Notice>
        </div>
      </div>
    </>
  );
}
