// Helpers around the web-check evidence stored on each lead
// (`web_findings`, written by the enrich-lead function).

// Links come from Google results — untrusted. Only ever render http(s).
export function safeHref(u) {
  return /^https?:\/\//i.test(String(u || '')) ? String(u) : null;
}

// Statuses the automatic check writes. A lead with one of these but no
// web_checked_at was checked by the older version of the feature (no
// evidence saved), so it still counts as needing a check.
const AUTO_STATUS = /^(live — own domain|possible website found — verify|not found)$/i;

// True when this lead has no web check on record and no hand-entered
// website status that we'd be overwriting.
export function needsWebCheck(lead) {
  if (lead.web_checked_at) return false;
  const ws = String(lead.website_status || '').trim();
  return !ws || /^unknown$/i.test(ws) || AUTO_STATUS.test(ws);
}

// What the drafting / rewrite functions are allowed to see. Everything
// is pre-classified HERE so the model never has to guess what is safe to
// say: only `confirmed_own_domain` may be stated as fact, and only
// listings/places whose name matched are offered at all. Unmatched
// results, other results and the candidate-site URL are deliberately not
// passed on.
export function buildWebCheckForDraft(lead) {
  const f = lead && lead.web_findings;
  if (!f) return { checked: false };

  const w = f.website || null;
  const website = w && f.outcome === 'confirmed_own_domain'
    ? { url: w.url, title: w.title || '', description: w.snippet || '' }
    : null;

  return {
    checked: true,
    checked_at: f.checked_at,
    website_outcome: f.outcome, // confirmed_own_domain | possible_match_unverified | placeholder_page | blocked | none_found
    website,                    // only present when it may be stated as fact
    listings_matched_by_name: (f.listings || []).filter(l => l.name_match).map(l => ({ platform: l.platform, url: l.url, title: l.title })),
    google_business_matched_by_name: (f.places || []).filter(p => p.name_match).map(p => ({ title: p.title, address: p.address, category: p.category, rating: p.rating, rating_count: p.rating_count })),
  };
}

// True when the evidence is newer than the draft that was written.
export function draftIsOlderThanWebCheck(lead) {
  const d = lead && lead.draft && lead.draft.generatedAt;
  const w = lead && lead.web_checked_at;
  if (!d || !w) return false;
  return Date.parse(w) > Date.parse(d);
}

// What website_status the draft functions get to see. Once a web check
// exists, the raw status text ("Not found") is a search-based guess, not a
// fact about the business, so it's replaced with a neutral line and the
// rules in web_check take over. Hand-entered statuses (no web check) pass
// through unchanged — those were verified by a person.
export function websiteStatusForDraft(lead) {
  const f = lead && lead.web_findings;
  if (!f) return (lead && lead.website_status) || 'Unknown';
  return f.outcome === 'confirmed_own_domain'
    ? 'Has a website (details in web_check)'
    : 'Not confirmed either way (see web_check)';
}
