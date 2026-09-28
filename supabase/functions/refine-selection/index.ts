// Supabase Edge Function: rewrites ONE selected snippet of an already
// drafted email body, leaving the rest untouched. Deliberately a
// separate function from `draft` — different, simpler output contract
// (just the replacement text), and keeps the main draft generator
// unchanged/low-risk.
//
// Deploy: supabase functions deploy refine-selection

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SYSTEM_PROMPT = `You are editing ONE selected snippet inside an already-written B2B cold outreach email. You will be given the full email body for context, the exact snippet to replace, an optional instruction for how to change it, and the same verified facts the whole email was grounded in.

Rules:
- Rewrite ONLY the snippet. Do not rewrite or return anything else.
- Your replacement must read naturally in place of the original snippet within the surrounding sentence — match grammar and flow.
- Stay strictly grounded in the given facts — never invent a new claim, detail, review, or fact that wasn't already given.
- If the facts include web_check: only web_check.website (present only when it is confirmed to be theirs) and the *_matched_by_name items may be relied on. Never introduce or mention a possible or unconfirmed website, never say the business has no website, and never mention searching or a check.
- If an instruction is given (e.g. "make it shorter", "less formal", "remove this claim"), follow it. If no instruction is given, just improve clarity and tone while keeping the same core meaning.
- Output ONLY the replacement text for the snippet. No quotation marks, no explanation, no markdown, nothing else — just the plain replacement text.`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { full_body, selected_text, instruction, lead_context } = await req.json();
    if (!full_body || !selected_text) {
      return new Response(JSON.stringify({ error: 'Missing full_body or selected_text' }), { status: 400, headers: cors });
    }
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return new Response(JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }), { status: 500, headers: cors });

    const userMsg = [
      `Full email body (for context only — do not return this):`,
      full_body,
      '',
      `Snippet to replace:`,
      selected_text,
      '',
      `Instruction (may be empty): ${instruction || '(none given — just improve it)'}`,
      '',
      `Verified facts this email is grounded in:`,
      JSON.stringify(lead_context || {}, null, 2),
    ].join('\n');

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    const data = await resp.json();
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return new Response(JSON.stringify({ replacement: text }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
