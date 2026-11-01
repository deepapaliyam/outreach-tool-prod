import { recommendContact } from './scoring';

// Everything the Sent tab, the Email Draft queue and the batch sender need to
// know about "has this lead been emailed?" lives here, as plain functions, so
// the rules are written once and can be tested without a screen.

export const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors the limits enforced by the send-email function. The server is the
// one that actually refuses; these let the screen explain *before* a click.
export const FOLLOWUP_MIN_DAYS = 3;
export const MAX_FOLLOW_UPS = 2;

export const RANGES = [
  { id: '1d', label: 'Last 1 day', days: 1 },
  { id: '1w', label: 'Last 1 week', days: 7 },
  { id: '1m', label: 'Last 1 month', days: 30 },
  { id: 'all', label: 'All time', days: null },
];
export const DEFAULT_RANGE = '1w';

export const NO_RESPONSE_CHOICES = [3, 5, 7, 10, 14];
export const DEFAULT_NO_RESPONSE_DAYS = 7;

export const GROUPS = [
  { id: 'awaiting', label: 'Awaiting reply', hint: 'Emailed recently — give them time to answer.' },
  { id: 'replied', label: 'Replied & in progress', hint: 'They answered, got a proposal, or became a client.' },
  { id: 'noresponse', label: 'No response', hint: 'Quiet for a while. A follow-up may be worth it.' },
  { id: 'declined', label: 'Declined', hint: 'They said no. Kept here so you never chase them by mistake.' },
];

// A lead counts as sent once its outcome says contacted. The server sets that
// when a real email goes out; "Sent manually" and Excel import set it too.
export function isSent(lead) {
  return !!(lead && lead.outcome && lead.outcome.contacted);
}

const t = (v) => { const n = Date.parse(v); return Number.isFinite(n) ? n : null; };

// What Gmail confirmed, per lead: real sends (first emails and follow-ups, oldest
// first) and the set of leads that have had a test send to yourself.
export function indexHistory(rows) {
  const sends = new Map();
  const tests = new Set();
  for (const r of rows || []) {
    if (!r || !r.ok || !r.lead_id) continue;
    if (r.kind === 'send') {
      if (!sends.has(r.lead_id)) sends.set(r.lead_id, []);
      sends.get(r.lead_id).push(r);
    } else if (r.kind === 'test') {
      tests.add(r.lead_id);
    }
  }
  for (const list of sends.values()) list.sort((a, b) => (t(a.created_at) ?? 0) - (t(b.created_at) ?? 0));
  return { sends, tests };
}

// Gmail's answers are saved a moment after a send. Until the next refresh brings them in,
// the answer already held in memory stands in, so a lead that was JUST sent is sorted and
// excluded correctly straight away. `live` is { [leadId]: { ok, kind, at, messageId, threadId, purpose } }.
export function mergeLiveSends(rows, live) {
  const known = new Set((rows || []).map(r => r.gmail_message_id).filter(Boolean));
  const extra = [];
  for (const [leadId, r] of Object.entries(live || {})) {
    if (!r || !r.ok || (r.kind !== 'send' && r.kind !== 'test')) continue;
    if (r.messageId && known.has(r.messageId)) continue;
    extra.push({
      lead_id: leadId, kind: r.kind, ok: true, created_at: r.at, purpose: r.purpose || 'first',
      gmail_message_id: r.messageId || null, gmail_thread_id: r.threadId || null, subject: '',
    });
  }
  return extra.length ? [...extra, ...(rows || [])] : (rows || []);
}

// Where the lead stands now.
export function sentGroup(lead, { lastAt, now, noResponseDays }) {
  const o = (lead && lead.outcome) || {};
  if (o.materialized || o.payment_received) return 'replied';           // became a client
  const reason = String(o.not_proceeded_reason || '');
  if (o.response_type === 'Negative' || (reason && reason !== 'No response')) return 'declined';
  if (o.proposal_sent || o.replied) return 'replied';
  if (reason === 'No response' || o.response_type === 'No response') return 'noresponse';
  if (lastAt != null && now - lastAt >= noResponseDays * DAY_MS) return 'noresponse';
  return 'awaiting';
}

// The address a follow-up would go to: the one the first email used.
export function followUpAddress(lead) {
  if (lead && lead.draft && lead.draft.sendTo) return lead.draft.sendTo;
  const c = recommendContact(lead || {});
  return c.primary ? c.primary.addr : (c.fallback ? c.fallback.addr : '');
}

// The facts about one sent lead. `history` comes from indexHistory().
export function sentFacts(lead, history, { now = Date.now(), noResponseDays = DEFAULT_NO_RESPONSE_DAYS } = {}) {
  const o = lead.outcome || {};
  const rows = (history && history.sends.get(lead.id)) || [];
  const firstRow = rows.find(r => r.purpose !== 'followup') || null;
  // contacted_date has no time of day: noon is the fairest guess for "which day".
  const dateGuess = o.contacted_date ? t(`${String(o.contacted_date).slice(0, 10)}T12:00:00Z`) : null;
  const firstAt = firstRow ? t(firstRow.created_at) : dateGuess;
  const followUps = Array.isArray(o.follow_ups) ? o.follow_ups : [];
  const touches = [firstAt, ...followUps.map(f => t(f.sent_at)), ...rows.map(r => t(r.created_at))].filter(v => v != null);
  const lastAt = touches.length ? Math.max(...touches) : null;
  const facts = {
    lead, firstAt, lastAt,
    followUps, followUpCount: followUps.length,
    subject: o.sent_subject || (firstRow && firstRow.subject) || (lead.draft && lead.draft.subject) || '',
    body: o.sent_body || '',
    threadId: (firstRow && firstRow.gmail_thread_id) || null,
    messageId: (firstRow && firstRow.gmail_message_id) || null,
    viaGmail: !!o.sent_via_gmail || !!firstRow,
  };
  facts.group = sentGroup(lead, { lastAt, now, noResponseDays });
  return facts;
}

// Every sent lead, most recently emailed first.
export function buildSentRows(leads, history, opts = {}) {
  const now = opts.now ?? Date.now();
  return (leads || [])
    .filter(isSent)
    .map(l => sentFacts(l, history, { ...opts, now }))
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0));
}

export function filterByRange(rows, rangeId, now = Date.now()) {
  const r = RANGES.find(x => x.id === rangeId) || RANGES.find(x => x.id === DEFAULT_RANGE);
  if (r.days == null) return rows;
  return rows.filter(x => x.lastAt != null && now - x.lastAt <= r.days * DAY_MS);
}

export function countByGroup(rows) {
  const c = { awaiting: 0, replied: 0, noresponse: 0, declined: 0 };
  rows.forEach(r => { c[r.group] += 1; });
  return c;
}

// "today", "yesterday", "3 days ago"
export function daysAgoLabel(ms, now = Date.now()) {
  if (ms == null) return '—';
  const days = Math.floor((now - ms) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

// Can a follow-up be suggested for this lead right now — and if not, why not,
// in words the user can act on? Mirrors the server's rules.
export function followUpState(facts, now = Date.now()) {
  const { lead, group, followUpCount, lastAt } = facts;
  if (group === 'replied') return { ok: false, code: 'replied', reason: 'They have replied or moved forward. Carry on the conversation in Gmail and log progress in Track Outcomes.' };
  if (group === 'declined') return { ok: false, code: 'declined', reason: 'They said no, so no follow-up is suggested. If that changes, choose Reopen below.' };
  if (followUpCount >= MAX_FOLLOW_UPS) {
    return { ok: false, code: 'limit', reason: `You have already sent ${followUpCount} follow-ups — the limit. A third nudge usually does more harm than good; try a phone call or come back in a few months with something new.` };
  }
  if (!facts.subject || !facts.body) {
    return { ok: false, code: 'no_original', reason: 'There is no saved copy of the first email (it was marked as sent by hand), so a follow-up cannot be written from it.' };
  }
  if (!followUpAddress(lead)) return { ok: false, code: 'no_address', reason: 'This lead has no email address on record.' };
  if (lastAt != null) {
    const waitMs = lastAt + FOLLOWUP_MIN_DAYS * DAY_MS - now;
    if (waitMs > 0) {
      const days = Math.ceil(waitMs / DAY_MS);
      return { ok: false, code: 'too_soon', waitDays: days, reason: `Too soon — available in ${days} day${days === 1 ? '' : 's'}. A follow-up needs at least ${FOLLOWUP_MIN_DAYS} days after your last email.` };
    }
  }
  return { ok: true, number: followUpCount + 1 };
}

// What the live website re-check changed, in plain sentences.
//   ui       - everything, for the person looking at the screen
//   findings - only positive, citable additions, for the follow-up writer
export function summariseRecheck(before, after) {
  const bf = before && before.web_findings;
  const af = after && after.web_findings;
  const ui = [];
  const findings = [];
  const name = (o) => ({
    confirmed_own_domain: 'a live website on their own domain',
    possible_match_unverified: 'a possible website that could not be verified',
    placeholder_page: 'a placeholder page',
    blocked: 'a site that blocked the check',
    none_found: 'no website found',
  }[o] || 'no earlier check');
  const was = bf ? bf.outcome : null;
  const now = af ? af.outcome : null;
  if (!af) return { checked: false, changed: false, ui: ['The check returned nothing.'], findings: [] };

  if (was !== now) {
    ui.push(`Website: ${name(was)} → ${name(now)}.`);
    if (now === 'confirmed_own_domain' && was) findings.push('Their own website (on their company email domain) is now confirmed to respond.');
  } else {
    ui.push(`Website: unchanged — ${name(now)}.`);
  }
  const matched = (f) => new Set(((f && f.listings) || []).filter(l => l.name_match).map(l => l.platform));
  const newListings = [...matched(af)].filter(p => !matched(bf).has(p));
  if (newListings.length) {
    ui.push(`New listing${newListings.length === 1 ? '' : 's'} matching their name: ${newListings.join(', ')}.`);
    if (bf) findings.push(`They now appear on ${newListings.join(' and ')}.`);
  }
  const placeMatch = (f) => ((f && f.places) || []).some(p => p.name_match);
  if (placeMatch(af) && !placeMatch(bf)) {
    ui.push('A Google Business result now matches their name.');
    if (bf) findings.push('A Google Business listing now matches their name.');
  }
  if (!bf) ui.push('This lead had not been checked before, so there is nothing to compare with.');
  const changed = was !== now || newListings.length > 0 || (placeMatch(af) && !placeMatch(bf));
  return { checked: true, changed: !!bf && changed, ui, findings: bf ? findings : [] };
}

// ---- batch sending ---------------------------------------------------------------------------
// Who the spaced batch sender may pick. A lead is left out when
//   - it has no draft,
//   - it was already sent (outcome says contacted, or Gmail confirmed a real send),
//   - in test mode, it already had a test email (so test batches move down the list
//     instead of repeating the same leads).
export function pickBatchSendCandidates(leads, history, { testMode, limit }) {
  const tested = new Set(history ? history.tests : []);
  let skippedSent = 0;
  let skippedTested = 0;
  const pool = [];
  for (const l of leads || []) {
    if (!l.draft) continue;
    if (isSent(l) || (history && history.sends.has(l.id))) { skippedSent++; continue; }
    if (testMode && tested.has(l.id)) { skippedTested++; continue; }
    pool.push(l);
  }
  pool.sort((a, b) => b.priority_score - a.priority_score);
  return { candidates: pool.slice(0, Math.max(0, limit)), skippedSent, skippedTested, available: pool.length };
}
