import React from 'react';
import { Sparkles } from 'lucide-react';
import { ScorePill, SafeLink, Spinner } from './ui';
import { draftIsOlderThanWebCheck } from '../lib/webcheck';

// "Why this lead?" — the score and exactly where it came from, plus what the
// web check found. Used beside the ranked list and on the Email Draft page.

const MAX = { Need: 57, Reach: 26, Region: 10 };   // the most each group can add today

export function websiteTone(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('live')) return 'live';
  if (s.includes('not found')) return 'none';
  if (s.includes('possible') || s.includes('outdated') || s.includes('social')) return 'weak';
  return 'unk';
}

export function scoreHeadline(score) {
  if (score >= 60) return 'Strong website opportunity';
  if (score >= 35) return 'Worth a look';
  return 'Lower priority';
}

export function ScoreBreakdown({ lead }) {
  const groups = { Need: [], Reach: [], Region: [] };
  (lead.score_breakdown || []).forEach(b => { (groups[b.group] || (groups[b.group] = [])).push(b); });
  const total = { Need: lead.need_score || 0, Reach: lead.reach_score || 0, Region: lead.region_bonus || 0 };
  return (
    <div>
      {['Need', 'Reach', 'Region'].map(g => {
        const lines = groups[g] || [];
        if (g === 'Region' && !lines.length) return null;
        const pct = Math.max(0, Math.min(100, Math.round((total[g] / MAX[g]) * 100)));
        return (
          <div className="meter" key={g}>
            <div className="meter-h">{g}<span>{total[g]}</span></div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            {lines.map((b, i) => (
              <div className="reason" key={i}>
                <b className={b.points < 0 ? 'neg' : ''}>{b.points > 0 ? '+' : ''}{b.points}</b>
                <span>{b.why}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Shows exactly what the web check found and where — every item links to
// its source so it can be validated — and is the same evidence the email
// drafts are grounded in.
export function WebFindings({ lead, onCheck, checking }) {
  const f = lead.web_findings;
  const header = (
    <div className="row between">
      <div className="web-h">Web check{lead.web_checked_at && <span className="faint"> · {new Date(lead.web_checked_at).toLocaleString()}</span>}</div>
      {onCheck && (
        <button className="btn sm" disabled={checking} onClick={() => onCheck(lead)}>
          {checking ? <Spinner size={11} /> : (f ? 'Re-check' : 'Check now')}
        </button>
      )}
    </div>
  );
  if (!f) {
    const ws = lead.website_status && lead.website_status !== 'Unknown' ? lead.website_status : '';
    return (
      <div className="web-block">
        {header}
        <p className="hint">Not checked yet.{ws ? ` Current website status is “${ws}”, but no sources were saved for it — check now to see them.` : ''}</p>
      </div>
    );
  }
  const w = f.website;
  const confirmed = w && w.confidence === 'confirmed_own_domain';
  const matched = (f.listings || []).filter(l => l.name_match);
  const unmatched = (f.listings || []).filter(l => !l.name_match);
  const d = f.direct;
  return (
    <div className="web-block">
      {header}
      <div className="web-q small faint">Searched Google for <code>{f.query}</code> · {f.result_count} result{f.result_count === 1 ? '' : 's'}</div>

      <div className="web-sec">Website</div>
      {d && (
        <div className="web-line">
          Company email domain <b>{d.domain}</b>:{' '}
          {d.state === 'live' && 'responds ✓'}
          {d.state === 'placeholder' && `answers, but looks like a placeholder page (${d.placeholder_reason})`}
          {d.state === 'blocked' && `replied “access denied” (HTTP ${d.http_status}), so it couldn't be read`}
          {d.state === 'unreachable' && "didn't respond"}
        </div>
      )}
      {w ? (
        <div className={`web-card ${confirmed ? 'ok' : 'warn'}`}>
          <div>
            <span className="web-tag">{confirmed ? 'Confirmed — their own email domain' : 'Possible match — not verified'}</span>{' '}
            <span className="faint small">{w.source}</span>
          </div>
          <div className="web-title"><SafeLink url={w.url}>{w.title || w.domain}</SafeLink></div>
          <div className="web-url">{w.url}</div>
          {w.snippet && <div className="web-snip">{w.snippet}</div>}
          {!confirmed && <div className="hint">Business names collide often — open it and check it's really them. Emails never state this as a fact.</div>}
        </div>
      ) : (
        <div className="web-line faint">No search result looked like this business's own website.</div>
      )}

      <div className="web-sec">Listings &amp; directories</div>
      {matched.length === 0 && unmatched.length === 0 && <div className="web-line faint">None found.</div>}
      {matched.map((l, i) => (
        <div className="web-line" key={'m' + i}>
          <span className="web-tag ok">{l.platform}</span> <SafeLink url={l.url}>{l.title || l.domain}</SafeLink>
          {l.snippet && <div className="web-snip">{l.snippet}</div>}
        </div>
      ))}
      {unmatched.length > 0 && (
        <div className="web-line faint">
          Unmatched — name doesn't match, may be other businesses (not used):{' '}
          {unmatched.map((l, i) => <span key={'u' + i}>{i > 0 && ', '}<SafeLink url={l.url}>{l.platform}</SafeLink></span>)}
        </div>
      )}

      {(f.places || []).length > 0 && (
        <>
          <div className="web-sec">Google Business results</div>
          {f.places.map((p, i) => (
            <div className="web-line" key={'p' + i}>
              <span className={`web-tag ${p.name_match ? 'ok' : ''}`}>{p.name_match ? 'Name matches' : 'Name differs'}</span>{' '}
              <b>{p.title}</b>{p.category ? ` · ${p.category}` : ''}{p.address ? ` · ${p.address}` : ''}
              {p.rating != null ? ` · ★ ${p.rating}${p.rating_count != null ? ` (${p.rating_count})` : ''}` : ''}
              {p.website && <> · <SafeLink url={p.website}>website</SafeLink></>}
            </div>
          ))}
        </>
      )}

      {f.knowledge_panel && (
        <>
          <div className="web-sec">Google knowledge panel</div>
          <div className="web-line"><b>{f.knowledge_panel.title}</b>{f.knowledge_panel.type ? ` · ${f.knowledge_panel.type}` : ''}
            {f.knowledge_panel.description && <div className="web-snip">{f.knowledge_panel.description}</div>}</div>
        </>
      )}

      {(f.other_results || []).length > 0 && (
        <>
          <div className="web-sec">Other results <span className="faint">(context only — not used as facts)</span></div>
          {f.other_results.map((r, i) => (
            <div className="web-line" key={'o' + i}>
              <SafeLink url={r.url}>{r.title || r.domain}</SafeLink> <span className="faint small">{r.domain}</span>
              {r.snippet && <div className="web-snip">{r.snippet}</div>}
            </div>
          ))}
        </>
      )}

      {(f.ignored || []).length > 0 && (
        <div className="web-line faint" style={{ marginTop: 8 }}>
          Ignored — company-registration directories, not the business's own site:{' '}
          {[...new Set(f.ignored.map(x => x.domain))].join(', ')}
        </div>
      )}
      <p className="hint">Email drafts use only confirmed facts and name-matched listings from this check — never “possible” or unmatched items.</p>
    </div>
  );
}

// The right-hand panel on Upload & Prioritize.
export default function WhyPanel({ lead, onCheck, checking, onDraft }) {
  const stale = draftIsOlderThanWebCheck(lead);
  return (
    <div className="card" aria-label="Why this lead">
      <div className="eyebrow">Why this lead?</div>
      <h3 className="card-title" style={{ fontSize: 18, marginTop: 6 }}>{lead.name}</h3>
      <div className="dim small">{[lead.nic_label, [lead.district, lead.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>

      <div className="why-score">
        <div className="big">{lead.priority_score}</div>
        <div>
          <div className="t">{scoreHeadline(lead.priority_score)}</div>
          <div className="small dim">Priority score · Need {lead.need_score} + Reach {lead.reach_score}{lead.region_bonus ? ` + Region ${lead.region_bonus}` : ''}</div>
        </div>
      </div>

      <ScoreBreakdown lead={lead} />
      <WebFindings lead={lead} onCheck={onCheck} checking={checking} />
      {stale && <div className="note warn mt12">The web check is newer than this lead's draft — regenerate it to use the latest findings.</div>}

      <button className="btn primary mt16" style={{ width: '100%' }} onClick={() => onDraft(lead)}>
        <Sparkles size={15} /> {lead.draft ? 'Open the draft' : `Draft outreach for ${lead.name.split(' ')[0]}`}
      </button>
    </div>
  );
}

export { ScorePill };
