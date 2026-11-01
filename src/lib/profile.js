import { normalizeUrl } from './signature';

// The profile as the app uses it (camelCase) <-> the sender_profiles row
// (snake_case). Keeping the mapping in one place means the Profile & Settings
// page, drafting, sending and the sidebar can never disagree about a field.

export const TONES = [
  'Warm and casual',
  'Professional and polished',
  'Direct and to the point',
  'Friendly and enthusiastic',
  'Formal',
];

const cleanLinks = (v) => (Array.isArray(v) ? v : [])
  .map(l => ({ label: String((l && l.label) || '').trim(), url: String((l && l.url) || '').trim() }))
  .filter(l => l.url);

export function profileFromRow(row) {
  const r = row || {};
  return {
    name: r.name || '',
    title: r.title || '',
    phone: r.phone || '',
    contactEmail: r.contact_email || '',
    company: r.company_name || '',
    website: r.website || '',
    businessInfo: r.business_info || '',
    offer: r.offer || '',
    tone: r.tone || '',
    voiceSample: r.voice_sample || '',
    socialLinks: cleanLinks(r.social_links),
    portfolioLinks: cleanLinks(r.portfolio_links),
    signatureHtml: r.signature_html || '',
    referenceNotes: r.reference_notes || [],
    testMode: r.test_mode !== false,
    testEmail: r.test_email || '',
    dailySendCap: r.daily_send_cap || 30,
  };
}

export function clampCap(n) {
  return Math.min(100, Math.max(1, Number(n) || 30));
}

// Only the fields the Profile & Settings page edits. (Test mode is saved on
// its own, from the Email Draft page, so saving the profile never flips it.)
export function rowFromProfile(p, extra = {}) {
  const portfolio = cleanLinks(p.portfolioLinks);
  return {
    name: (p.name || '').trim(),
    title: (p.title || '').trim(),
    phone: (p.phone || '').trim(),
    contact_email: (p.contactEmail || '').trim(),
    company_name: (p.company || '').trim(),
    website: (p.website || '').trim(),
    business_info: (p.businessInfo || '').trim(),
    offer: (p.offer || '').trim(),
    tone: p.tone || '',
    voice_sample: p.voiceSample || '',
    social_links: cleanLinks(p.socialLinks),
    portfolio_links: portfolio,
    // The first five portfolio links are also read by the AI (see fetch-references),
    // so drafts can mention real work.
    reference_urls: portfolio.map(l => l.url).slice(0, 5),
    signature_html: p.signatureHtml || '',
    signature_updated_at: new Date().toISOString(),
    test_email: (p.testEmail || '').trim(),
    daily_send_cap: clampCap(p.dailySendCap),
    ...extra,
  };
}

// Enough to start drafting: who is writing, and what they offer.
export function profileIsReady(p) {
  return !!(p && p.name && p.offer);
}

// Initials for the sidebar avatar: "Deepa Paliyam" -> "DP", "me@x.com" -> "M".
export function initialsOf(nameOrEmail) {
  const base = String(nameOrEmail || '').split('@')[0].replace(/[^\p{L}\p{N}\s._-]/gu, ' ');
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// A stable summary of everything the Profile & Settings page edits, to tell
// whether there are unsaved changes.
export function profileFingerprint(p) {
  const row = rowFromProfile(p);
  delete row.signature_updated_at; // changes on every call, so it must not count as an edit
  return JSON.stringify(row);
}

// Tidies what was typed before it is saved: web addresses get https:// added,
// anything that isn't a web address is dropped (and counted so the page can say so).
export function cleanProfileForSave(p) {
  let skipped = 0;
  const links = (list) => (list || []).map(l => {
    const url = normalizeUrl(l.url);
    if (!String(l.url || '').trim()) return null;
    if (!url) { skipped++; return null; }
    return { label: String(l.label || '').trim(), url };
  }).filter(Boolean);
  const website = p.website && p.website.trim() ? normalizeUrl(p.website) : '';
  if (p.website && p.website.trim() && !website) skipped++;
  return {
    profile: { ...p, website, portfolioLinks: links(p.portfolioLinks), socialLinks: links(p.socialLinks) },
    skipped,
  };
}
