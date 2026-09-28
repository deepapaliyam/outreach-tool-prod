// Supabase Edge Function: checks a lead's real web presence.
// - Custom-domain company emails get a free, direct HTTP check first (no
//   search API call needed at all for this ~20% of leads).
// - Everyone else (and anyone whose direct check fails) gets one Serper.dev
//   search, filtered against two hard-won lessons from manual research
//   earlier in this project:
//     1. Common business names collide constantly — a search "hit" is
//        reported as "verify this," never asserted as a confirmed match.
//     2. MCA/company-registration mirror sites (falconebiz.com,
//        indiafilings.com, etc.) show up in results for almost any
//        freshly-registered company and must never be counted as "the
//        business has a website."
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

const FREEMAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'rediffmail.com', 'hotmail.com', 'icloud.com', 'live.com']);

const MIRROR_DOMAINS = ['falconebiz.com', 'indiafilings.com', 'quidconnect.com', 'zaubacorp.com', 'tofler.in', 'instafinancials.com', 'corpseed.com'];

const LISTING_DOMAINS: Record<string, string> = {
  'justdial.com': 'Justdial',
  'indiamart.com': 'IndiaMART',
  'sulekha.com': 'Sulekha',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn',
};

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function checkDirectDomain(domain: string): Promise<boolean> {
  for (const scheme of ['https://', 'http://']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(scheme + domain, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      if (res.status >= 200 && res.status < 400) return true;
    } catch {
      clearTimeout(timeout);
    }
  }
  return false;
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
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: cors });
    }

    const { name, district, state, companyEmail } = await req.json();
    if (!name) return new Response(JSON.stringify({ error: 'Missing business name' }), { status: 400, headers: cors });

    const domain = companyEmail && String(companyEmail).includes('@')
      ? String(companyEmail).split('@').pop()!.toLowerCase().trim()
      : null;
    const isFreemail = domain ? FREEMAIL.has(domain) : true;

    let websiteStatus = 'Not found';
    const notes: string[] = [];
    const listingsFound: string[] = [];

    if (domain && !isFreemail) {
      const live = await checkDirectDomain(domain);
      if (live) {
        websiteStatus = 'Live — own domain';
        notes.push(`Company email domain (${domain}) resolves to a live site.`);
      } else {
        notes.push(`Company email domain (${domain}) didn't respond directly — checked search results too.`);
      }
    }

    const apiKey = Deno.env.get('SERPER_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing SERPER_API_KEY secret' }), { status: 500, headers: cors });
    }

    const query = [name, district, state].filter(Boolean).join(' ');
    const searchRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'in', num: 10 }),
    });
    const searchData = await searchRes.json();
    if (!searchRes.ok) throw new Error('Serper search failed: ' + JSON.stringify(searchData));
    const organic = searchData.organic || [];

    let candidateSite: string | null = null;
    for (const r of organic) {
      const dom = domainOf(r.link || '');
      if (!dom) continue;
      if (MIRROR_DOMAINS.some(m => dom.includes(m))) continue;
      const listingHit = Object.entries(LISTING_DOMAINS).find(([d]) => dom.includes(d));
      if (listingHit) {
        if (!listingsFound.includes(listingHit[1])) listingsFound.push(listingHit[1]);
        continue;
      }
      if (!candidateSite) candidateSite = r.link;
    }

    if (websiteStatus !== 'Live — own domain') {
      if (candidateSite) {
        websiteStatus = 'Possible website found — verify';
        notes.push(`Search surfaced a possible site: ${candidateSite}. Common business names collide often — confirm this is actually the same entity before citing it in a draft.`);
      } else {
        notes.push('No independent website found in search results.');
      }
    }

    return new Response(JSON.stringify({
      website_status: websiteStatus,
      business_listings: listingsFound.length ? listingsFound.join(', ') : 'None found',
      search_notes: notes.join(' '),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
