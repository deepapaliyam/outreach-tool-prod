// Supabase Edge Function: checks a lead's real web presence and returns
// the EVIDENCE, not just a verdict.
//
// For each lead, two things run at the same time:
//   1. (custom-domain company emails only) a free direct check of that
//      domain — does it answer, what is its page title/description, or is
//      it just a placeholder/parked page?
//   2. one Google search via Serper.dev for the exact business name
//      (minus "Private Limited" etc.) plus district and state.
// The result is a structured `web_findings` object — the website it
// found and why, matching directory listings, Google Business results,
// other results, and which registration-directory sites were ignored —
// so a person can open every source and validate it.
//
// Lessons from manual research earlier in this project, built in:
//   - Company-registration mirror sites (falconebiz, zaubacorp, ...) are
//     never counted as the business's website.
//   - Common business names collide constantly, so a search hit is only
//     ever a "possible match" unless it comes from the company's OWN
//     email domain. Matching is by distinctive name words in the domain.
//
// Secret needed: supabase secrets set SERPER_API_KEY=...
// Deploy: supabase functions deploy enrich-lead

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// --- PURE START (no Deno APIs — unit-tested separately) ---
const FREEMAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in', 'outlook.com', 'rediffmail.com', 'hotmail.com', 'icloud.com', 'live.com', 'protonmail.com']);

// Sites that just republish company-registration data. They appear for
// almost any newly registered company and are never "the website".
const MIRROR_DOMAINS = ['falconebiz.com', 'indiafilings.com', 'quidconnect.com', 'zaubacorp.com', 'tofler.in', 'instafinancials.com', 'corpseed.com', 'thecompanycheck.com', 'opencorporates.com', 'mca.gov.in', 'probe42.in', 'mycorporateinfo.com', 'companydetails.in'];

const LISTING_DOMAINS: Record<string, string> = {
  'justdial.com': 'Justdial', 'indiamart.com': 'IndiaMART', 'sulekha.com': 'Sulekha',
  'tradeindia.com': 'TradeIndia', 'exportersindia.com': 'ExportersIndia',
  'facebook.com': 'Facebook', 'instagram.com': 'Instagram', 'linkedin.com': 'LinkedIn',
  'youtube.com': 'YouTube', 'twitter.com': 'X / Twitter', 'x.com': 'X / Twitter',
};

// A company-email domain that redirects here is a for-sale/parking page.
const PARKING_DOMAINS = ['sedoparking.com', 'hugedomains.com', 'parkingcrew.net', 'bodis.com', 'dan.com', 'afternic.com', 'above.com', 'domainmarket.com', 'uniregistry.com'];

// Words that say "this is a company", not "this is WHICH company".
const LEGAL_WORDS = new Set(['private', 'pvt', 'limited', 'ltd', 'llp', 'opc', 'one', 'person', 'company', 'co', 'and', 'the', 'of', 'inc']);
const QUERY_STRIP = new Set(['private', 'pvt', 'limited', 'ltd', 'llp', 'opc']);
// Industry words that many unrelated businesses share.
const GENERIC_WORDS = new Set(['real', 'estate', 'estates', 'realty', 'infra', 'infrastructure', 'construction', 'constructions', 'builders', 'developers', 'enterprises', 'enterprise', 'solutions', 'services', 'technologies', 'technology', 'tech', 'trading', 'traders', 'industries', 'entertainment', 'entertainments', 'creative', 'works', 'global', 'international', 'group', 'ventures', 'projects', 'associates', 'consultancy', 'consultants', 'consulting', 'marketing', 'media', 'drugs', 'pharma', 'foods', 'food', 'impex', 'imex', 'exports', 'imports', 'automotive', 'motors', 'india', 'indian', 'systems', 'digital', 'online', 'agro', 'agri', 'labs', 'lab', 'studio', 'studios', 'productions', 'holdings', 'capital', 'finance', 'financial', 'logistics', 'health', 'healthcare', 'care', 'education', 'educational', 'events', 'design', 'designs', 'interiors', 'interior']);

function clip(v: unknown, n: number): string {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function decodeEntities(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, '&');
}
function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}
function domainIs(domain: string, base: string): boolean {
  return domain === base || domain.endsWith('.' + base);
}
function normalize(s: string): string { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

function nameTokens(name: string): { distinct: string[]; all: string[] } {
  const words = String(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).filter((w) => !LEGAL_WORDS.has(w));
  const all = words.filter((w) => w.length >= 3);
  return { all, distinct: all.filter((w) => !GENERIC_WORDS.has(w)) };
}
// Does `text` (a domain, a title...) plausibly refer to this business?
// Uses distinctive words; needs 2 of them when the name has 2 or more.
function nameMatches(name: string, text: string): boolean {
  const hay = normalize(text);
  if (!hay) return false;
  const { distinct, all } = nameTokens(name);
  if (distinct.length) return distinct.filter((t) => hay.includes(t)).length >= (distinct.length >= 2 ? 2 : 1);
  if (all.length) return all.filter((t) => hay.includes(t)).length >= Math.min(2, all.length);
  return false;
}

// Exact business name (legal suffix removed) in quotes + district + state.
function buildQuery(name: string, district?: string, state?: string): string {
  const words = String(name || '').replace(/[^\p{L}\p{N}\s&]/gu, ' ').split(/\s+/).filter(Boolean).filter((w) => !QUERY_STRIP.has(w.toLowerCase()));
  const cleaned = words.join(' ').trim() || String(name || '').trim();
  return [`"${cleaned}"`, district, state].filter(Boolean).join(' ');
}

function getAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2] ?? '') : null;
}
function extractMeta(html: string): { title: string; description: string } {
  try {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let description = '';
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const n = (getAttr(tag, 'name') || getAttr(tag, 'property') || '').toLowerCase();
      if (n === 'description' || n === 'og:description') {
        const c = getAttr(tag, 'content');
        if (c && (n === 'description' || !description)) description = c;
        if (n === 'description' && c) break;
      }
    }
    return { title: t ? clip(decodeEntities(t[1]), 160) : '', description: clip(decodeEntities(description), 300) };
  } catch { return { title: '', description: '' }; }
}

// Conservative: only unmistakable "nothing real here yet" pages.
function detectPlaceholder(title: string, html: string): string | null {
  const t = String(title || '').toLowerCase().trim();
  if (t === 'it works!' || t === 'it works') return 'default web-server test page';
  for (const p of ['welcome to nginx', 'apache2 ', 'apache http server test page', 'index of /', 'iis windows server', 'default web site page', 'domain default page']) {
    if (t.startsWith(p)) return `default server page (“${clip(title, 60)}”)`;
  }
  for (const p of ['coming soon', 'under construction', 'website coming', 'site coming', 'domain is for sale', 'domain for sale', 'buy this domain', 'domain may be for sale', 'domain is parked', 'parked domain', 'parked free', 'future home of', 'account suspended', 'site not found']) {
    if (t.includes(p)) return `page title says “${clip(title, 60)}”`;
  }
  const body = String(html || '').slice(0, 60000).toLowerCase();
  for (const p of ['this domain is for sale', 'buy this domain', 'this domain may be for sale', 'domain is parked', 'parked free, courtesy of', 'sedoparking', 'hugedomains']) {
    if (body.includes(p)) return 'page text says the domain is parked or for sale';
  }
  return null;
}

interface Probe { status: number; finalUrl: string; html: string }
interface Direct { domain: string; state: 'live' | 'placeholder' | 'blocked' | 'unreachable'; url?: string; http_status?: number; title?: string; description?: string; placeholder_reason?: string }

function classifyProbe(domain: string, p: Probe | null): Direct {
  if (!p) return { domain, state: 'unreachable' };
  if (p.status >= 200 && p.status < 400) {
    const { title, description } = extractMeta(p.html);
    const finalDomain = domainOf(p.finalUrl);
    if (finalDomain && !domainIs(finalDomain, domain) && PARKING_DOMAINS.some((d) => domainIs(finalDomain, d))) {
      return { domain, state: 'placeholder', url: p.finalUrl, http_status: p.status, title, description, placeholder_reason: `redirects to a domain-parking service (${finalDomain})` };
    }
    const reason = detectPlaceholder(title, p.html);
    if (reason) return { domain, state: 'placeholder', url: p.finalUrl, http_status: p.status, title, description, placeholder_reason: reason };
    return { domain, state: 'live', url: p.finalUrl, http_status: p.status, title, description };
  }
  if (p.status === 401 || p.status === 403 || p.status === 429) return { domain, state: 'blocked', url: p.finalUrl, http_status: p.status };
  return { domain, state: 'unreachable', http_status: p.status };
}
function pickBestDirect(domain: string, a: Probe | null, b: Probe | null): Direct {
  const rank = { live: 3, placeholder: 2, blocked: 1, unreachable: 0 } as const;
  const ca = classifyProbe(domain, a), cb = classifyProbe(domain, b);
  return rank[cb.state] > rank[ca.state] ? cb : ca;
}

interface Item { title: string; url: string; domain: string; snippet: string }
function analyzeSearch(name: string, data: any) {
  const organic: any[] = Array.isArray(data?.organic) ? data.organic : [];
  const ignored: Array<{ domain: string; url: string }> = [];
  const listings: Array<Item & { platform: string; name_match: boolean }> = [];
  const other: Item[] = [];
  let website: (Item & { confidence: 'possible_match'; source: string }) | null = null;

  for (const r of organic) {
    const url = String(r?.link || '');
    const domain = domainOf(url);
    if (!domain) continue;
    const item: Item = { title: clip(r.title, 160), url, domain, snippet: clip(r.snippet, 240) };
    if (MIRROR_DOMAINS.some((m) => domainIs(domain, m))) { ignored.push({ domain, url }); continue; }
    const listing = Object.entries(LISTING_DOMAINS).find(([d]) => domainIs(domain, d));
    if (listing) { listings.push({ ...item, platform: listing[1], name_match: nameMatches(name, `${item.title} ${item.snippet} ${url}`) }); continue; }
    if (!website && nameMatches(name, domain)) { website = { ...item, confidence: 'possible_match', source: 'Google search result' }; continue; }
    if (other.length < 5) other.push(item);
  }

  const places = (Array.isArray(data?.places) ? data.places : []).slice(0, 5).map((p: any) => ({
    title: clip(p?.title, 120), address: clip(p?.address, 160), category: clip(p?.category, 80),
    rating: typeof p?.rating === 'number' ? p.rating : null,
    rating_count: typeof p?.ratingCount === 'number' ? p.ratingCount : null,
    website: /^https?:\/\//i.test(String(p?.website || '')) ? String(p.website) : null,
    name_match: nameMatches(name, String(p?.title || '')),
  }));
  if (!website) {
    const hit = places.find((p: any) => p.name_match && p.website);
    if (hit) website = { title: hit.title, url: hit.website, domain: domainOf(hit.website), snippet: `Google Business listing${hit.address ? ' — ' + hit.address : ''}`, confidence: 'possible_match', source: 'Google Business result' };
  }

  const kg = data?.knowledgeGraph;
  const knowledge_panel = kg && nameMatches(name, String(kg.title || ''))
    ? { title: clip(kg.title, 120), type: clip(kg.type, 80), description: clip(kg.description, 300), website: /^https?:\/\//i.test(String(kg.website || '')) ? String(kg.website) : null }
    : null;
  if (!website && knowledge_panel?.website) {
    website = { title: knowledge_panel.title, url: knowledge_panel.website, domain: domainOf(knowledge_panel.website), snippet: knowledge_panel.description, confidence: 'possible_match', source: 'Google knowledge panel' };
  }

  return { website, listings, places, knowledge_panel, other, ignored, result_count: organic.length };
}

function assemble(name: string, query: string, direct: Direct | null, s: ReturnType<typeof analyzeSearch>, nowIso: string) {
  let website: any = s.website;
  let status = 'Not found';
  let outcome = 'none_found';

  if (direct?.state === 'live') {
    website = { title: direct.title || '', url: direct.url!, domain: domainOf(direct.url!) || direct.domain, snippet: direct.description || '', confidence: 'confirmed_own_domain', source: 'Company email domain' };
    status = 'Live — own domain'; outcome = 'confirmed_own_domain';
  } else if (website) {
    status = 'Possible website found — verify'; outcome = 'possible_match_unverified';
  } else if (direct?.state === 'placeholder') {
    status = 'Not found — domain is only a placeholder page (verify)'; outcome = 'placeholder_page';
  } else if (direct?.state === 'blocked') {
    status = 'Domain responds but blocks automated checks (verify)'; outcome = 'blocked';
    website = { title: '', url: direct.url || `https://${direct.domain}`, domain: direct.domain, snippet: 'This domain (from the company email) answered with an access-denied reply, so its content could not be read.', confidence: 'possible_match', source: 'Company email domain' };
  }

  const matched = s.listings.filter((l) => l.name_match);
  const unmatched = s.listings.length - matched.length;
  const platforms = [...new Set(matched.map((l) => l.platform))];
  const business_listings = platforms.length ? platforms.join(', ') : (unmatched ? `None matched by name (${unmatched} unverified hit${unmatched === 1 ? '' : 's'})` : 'None found');

  return {
    website_status: status,
    business_listings,
    web_findings: {
      version: 1, checked_at: nowIso, query, outcome, direct, website,
      listings: s.listings, places: s.places, knowledge_panel: s.knowledge_panel,
      other_results: s.other, ignored: s.ignored, result_count: s.result_count,
    },
  };
}
// --- PURE END ---

async function probe(url: string, ms: number): Promise<Probe | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OutreachToolBot/1.0)', Accept: 'text/html,*/*' },
    });
    let html = '';
    if (res.status >= 200 && res.status < 400) html = (await res.text()).slice(0, 200000);
    else { try { await res.body?.cancel(); } catch { /* ignore */ } }
    return { status: res.status, finalUrl: res.url || url, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
// https and http are tried at the same time; the better answer wins.
async function checkDirectDomain(domain: string): Promise<Direct> {
  const [a, b] = await Promise.all([probe('https://' + domain, 4000), probe('http://' + domain, 4000)]);
  return pickBestDirect(domain, a, b);
}

async function serperSearch(apiKey: string, query: string): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST', signal: controller.signal,
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'in', num: 10 }),
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 504, data: null };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authed = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await authed.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401);

    const { name, district, state, companyEmail } = await req.json();
    if (!name) return json({ error: 'Missing business name' }, 400);

    const apiKey = Deno.env.get('SERPER_API_KEY');
    if (!apiKey) return json({ error: 'Missing SERPER_API_KEY secret' }, 500);

    const domain = companyEmail && String(companyEmail).includes('@')
      ? String(companyEmail).split('@').pop()!.toLowerCase().trim() : null;
    const checkDomain = !!domain && !FREEMAIL.has(domain);
    const query = buildQuery(name, district, state);

    // The free domain check and the Google search run at the same time.
    const [direct, search] = await Promise.all([
      checkDomain ? checkDirectDomain(domain!) : Promise.resolve(null),
      serperSearch(apiKey, query),
    ]);

    if (!search.ok) {
      if (search.status === 429) return json({ error: 'Search rate limit reached — retrying shortly.' }, 429);
      if (search.status === 401 || search.status === 403) return json({ error: 'Serper rejected the API key — check the SERPER_API_KEY secret and your Serper credits.' }, 400);
      return json({ error: `Search failed (${search.status}).` }, 502);
    }

    return json(assemble(name, query, direct, analyzeSearch(name, search.data), new Date().toISOString()));
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
