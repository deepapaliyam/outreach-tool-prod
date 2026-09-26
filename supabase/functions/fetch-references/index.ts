// Supabase Edge Function: fetches a small set of reference URLs
// (portfolio, case studies, etc.) server-side and extracts rough plain
// text from each, so drafts can cite them. Called once when the user
// saves their sender profile — NOT on every draft — the result is
// cached in sender_profiles.reference_notes and just read from there
// afterward. This is a basic tag-stripping extractor, not a full
// readability parser — good enough for short citable snippets, not a
// general web scraper.
//
// Deploy: supabase functions deploy fetch-references

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_URLS = 5;
const MAX_CHARS_PER_URL = 2000;

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS_PER_URL);
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

    const { urls } = await req.json();
    const list = (Array.isArray(urls) ? urls : []).filter(Boolean).slice(0, MAX_URLS);

    const results = [];
    for (const url of list) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const html = await res.text();
        results.push({ url, text: extractText(html) });
      } catch (e) {
        results.push({ url, text: '', error: String(e) });
      }
    }

    return new Response(JSON.stringify({ references: results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
