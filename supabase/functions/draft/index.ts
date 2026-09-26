// Supabase Edge Function: server-side draft generation.
// Deploy:  supabase functions deploy draft
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The Anthropic key lives ONLY here, never in the browser. The frontend
// posts lead facts to /functions/v1/draft (proxied to /api/draft in dev,
// see vite.config.js) and gets back { subject, body, evaluation[] }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SYSTEM_PROMPT = `You write short, honest, professional B2B cold outreach emails for a freelance web developer / small agency reaching out to Indian small businesses.

STRICT RULE: use ONLY the facts given in the user message. Never invent a website, review, social detail, or personal fact that wasn't provided. If website_status indicates no website was found, you may reference that honestly. If a field says "Unknown", "Not checked", or "None", omit it rather than guessing. If a voice_profile is given, follow its tone. If reference_notes is given (formatted as one or more "Source: <url>" sections), you may draw on those facts too — when you do, name it in SOURCES as "<claim> — from <the specific url>", not a generic label, so it's clear exactly which reference backed the claim.

Write four things, in this exact format and nothing else:

EVALUATION:
- (one line: is this a good-fit lead and why, based only on given facts)
- (one line: what contact/channel to use and why)
- (one line: any risk or caveat — if none, say "No specific risk flags from the data provided.")

SOURCES:
- (one line per factual claim actually used in the body, format: "<short claim> — from <field name>". If the body makes no specific factual claims beyond generic value language, write "No specific claims beyond general outreach language.")

SUBJECT: (one subject line, under 60 characters, specific and honest, no clickbait)

BODY:
(90-130 words. Open with the recommended_salutation given. One genuine, verifiable personalization line drawn only from the facts. One to two sentences of value — no bullet list. One low-pressure call to action. One short line making it easy to opt out. Sign off with sender_name. Plain prose.)`;

function parse(text: string) {
  const evalMatch = text.match(/EVALUATION:([\s\S]*?)SOURCES:/i);
  const sourcesMatch = text.match(/SOURCES:([\s\S]*?)SUBJECT:/i);
  const subjectMatch = text.match(/SUBJECT:(.*?)\n/i);
  const bodyMatch = text.match(/BODY:([\s\S]*)/i);
  return {
    evaluation: evalMatch ? evalMatch[1].split('\n').map((l) => l.replace(/^[\s-]+/, '').trim()).filter(Boolean) : [],
    sources: sourcesMatch ? sourcesMatch[1].split('\n').map((l) => l.replace(/^[\s-]+/, '').trim()).filter(Boolean) : [],
    subject: subjectMatch ? subjectMatch[1].trim() : '(could not parse subject)',
    body: bodyMatch ? bodyMatch[1].trim() : text,
    generatedAt: new Date().toISOString(),
  };
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const lead = await req.json();
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return new Response(JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }), { status: 500, headers: cors });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Lead data:\n${JSON.stringify(lead, null, 2)}` }],
      }),
    });

    const data = await resp.json();
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    return new Response(JSON.stringify(parse(text)), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
