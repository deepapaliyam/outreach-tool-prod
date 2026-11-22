import { isSent } from './sent';

// Everything the Upload & Prioritize screen needs to know about WHEN a lead
// was added and WHETHER it has been acted on, as plain functions so the rules
// are written once and can be tested without a screen.
//
// "Day", "week" and "month" are the calendar ones in the browser's own time
// zone (a week starts on Monday), so "added today" means since midnight where
// the person is sitting — not the last 24 hours.

export const ADDED_RANGES = [
  { id: 'all', label: 'Any date' },
  { id: 'today', label: 'Added today' },
  { id: 'week', label: 'Added this week' },
  { id: 'month', label: 'Added this month' },
];

export const STATUS_CHOICES = [
  { id: 'all', label: 'All leads' },
  { id: 'pending', label: 'Pending action' },
  { id: 'actioned', label: 'Actioned' },
];

export const SORT_CHOICES = [
  { id: 'newest', label: 'Newest added, then best score' },
  { id: 'score', label: 'Best score only' },
];

export const DEFAULT_FILTERS = { search: '', industry: '', state: '', minScore: 0, added: 'all', status: 'all', sort: 'newest' };

const num = (v) => { const n = Date.parse(v); return Number.isFinite(n) ? n : null; };

// When the lead was saved (milliseconds), or null if the row has no date.
export function addedAt(lead) {
  return lead ? num(lead.created_at) : null;
}

export function startOfDay(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Monday 00:00 of the week that contains `now`.
export function startOfWeek(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function startOfMonth(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

const STARTS = { today: startOfDay, week: startOfWeek, month: startOfMonth };

export function inAddedRange(lead, range, now = Date.now()) {
  if (!range || range === 'all') return true;
  const at = addedAt(lead);
  const start = STARTS[range];
  if (at == null || !start) return false;
  return at >= start(now) && at <= now + 60 * 1000;   // a minute of slack for clocks that disagree slightly
}

// Which calendar day a lead was added on (the start of that day, milliseconds), or null.
export function addedDay(lead) {
  const at = addedAt(lead);
  return at == null ? null : startOfDay(at);
}

// "Today", "Yesterday", "20 Nov", or "20 Nov 2025" for another year.
export function dayLabel(dayStart, now = Date.now()) {
  if (dayStart == null) return 'Date unknown';
  const today = startOfDay(now);
  const prev = new Date(today); prev.setDate(prev.getDate() - 1);
  if (dayStart === today) return 'Today';
  if (dayStart === prev.getTime()) return 'Yesterday';
  const d = new Date(dayStart);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// Actioned = has been emailed (by the tool, marked as sent by hand, or imported as contacted) — the same
// rule the Sent tab uses. Pending = everything else.
export const isActioned = isSent;

// Newest day first, and inside one day the best score first. Several uploads on the same day sit together
// ranked by score, so the order inside a day is about the business, not about which file it came from.
export function compareNewestThenScore(a, b) {
  const da = addedDay(a); const db = addedDay(b);
  if (da !== db) {
    if (da == null) return 1;      // no date at all: after every dated lead
    if (db == null) return -1;
    return db - da;
  }
  return compareByScore(a, b);
}

export function compareByScore(a, b) {
  return (b.priority_score || 0) - (a.priority_score || 0) || String(a.name || '').localeCompare(String(b.name || ''));
}

export function applyLeadFilters(leads, filters = DEFAULT_FILTERS, now = Date.now()) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const q = String(f.search || '').toLowerCase();
  return (leads || [])
    .filter(l => {
      if (q && !String(l.name || '').toLowerCase().includes(q)) return false;
      if (f.industry && l.nic_label !== f.industry) return false;
      if (f.state && l.state !== f.state) return false;
      if ((l.priority_score || 0) < f.minScore) return false;
      if (!inAddedRange(l, f.added, now)) return false;
      if (f.status === 'pending' && isActioned(l)) return false;
      if (f.status === 'actioned' && !isActioned(l)) return false;
      return true;
    })
    .sort(f.sort === 'score' ? compareByScore : compareNewestThenScore);
}

// The numbers in the stat bar. They always describe ALL saved leads, whatever the filters say.
export function homeStats(leads, now = Date.now()) {
  const all = leads || [];
  const actioned = all.filter(isActioned).length;
  const count = (range) => all.filter(l => inAddedRange(l, range, now)).length;
  const pendingIn = (range) => all.filter(l => inAddedRange(l, range, now) && !isActioned(l)).length;
  return {
    total: all.length,
    today: count('today'), week: count('week'), month: count('month'),
    todayPending: pendingIn('today'), weekPending: pendingIn('week'), monthPending: pendingIn('month'),
    actioned, pending: all.length - actioned,
  };
}

// For the day-heading rows in the table: how many leads each day has in the current (filtered) list.
export function countByDay(sortedLeads) {
  const m = new Map();
  for (const l of sortedLeads || []) {
    const k = addedDay(l);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
