// Supabase Edge Function: rewrites ONE selected snippet of an already
// drafted email body, leaving the rest untouched. Deliberately a
// separate function from `draft` — different, simpler output contract
// (just the replacement text), and keeps the main draft generator
// unchanged/low-risk.
//
// Deploy: supabase functions deploy refine-selection

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

// --- ERR START (identical in draft, refine-selection and health-check) ---
// Turns an Anthropic API failure into a plain-language message.
//   fatal    - a SETUP problem: retrying, or looping over more leads, cannot help.
//   operator - only the administrator can fix it, so ordinary users are shown
//              the neutral USER_SAFE_AI text instead (see modelFailureBody).
type ModelProblem = { code: string; fatal: boolean; operator: boolean; error: string };
const USER_SAFE_AI = 'The AI drafting service is unavailable right now. The problem has been recorded for your administrator — please try again later.';
function classifyAnthropicFailure(status: number, data: any): ModelProblem {
  const type = String(data?.error?.type || '');
  const msg = String(data?.error?.message || '');
  const lower = msg.toLowerCase();
  if (status === 401 || type === 'authentication_error') {
    return { code: 'anthropic_key_invalid', fatal: true, operator: true, error: 'Your Anthropic API key has expired, been disabled, or is incorrect. Create a new key in the Claude Console (set Expiration to "Never"), then update the ANTHROPIC_API_KEY secret in Supabase. No redeploy is needed.' };
  }
  if (status === 403 || type === 'permission_error') {
    return { code: 'anthropic_key_forbidden', fatal: true, operator: true, error: 'Your Anthropic API key is not allowed to use this model. Check the key\'s workspace and permissions in the Claude Console, or create a new key.' };
  }
  if (lower.includes('credit balance')) {
    return { code: 'anthropic_credit', fatal: true, operator: true, error: 'Your Anthropic account is out of credit. Add credit in the Claude Console under Billing (turn on auto-reload so this does not repeat), then try again.' };
  }
  if (/usage limit|spend limit|workspace api usage|reached your specified/.test(lower)) {
    return { code: 'anthropic_limit', fatal: true, operator: true, error: 'Your Anthropic spending limit has been reached. Raise the limit in the limits section of your Claude Console settings, or wait for it to reset, then try again.' };
  }
  if (status === 404 || type === 'not_found_error') {
    return { code: 'anthropic_model', fatal: true, operator: true, error: 'The AI model this tool uses is no longer available to your account. Set the ANTHROPIC_MODEL secret in Supabase to a current model name (no redeploy needed).' };
  }
  if (status === 429 || type === 'rate_limit_error') {
    return { code: 'anthropic_busy', fatal: false, operator: false, error: 'The AI service is rate-limiting requests right now. Wait a minute and try again.' };
  }
  if (status >= 500 || type === 'overloaded_error' || type === 'api_error') {
    return { code: 'anthropic_down', fatal: false, operator: false, error: 'The AI service is temporarily unavailable or overloaded. Try again in a few minutes.' };
  }
  return { code: 'anthropic_error', fatal: false, operator: false, error: `The AI model returned an error (${status}): ${msg || 'unknown error'}` };
}
// What goes back to the browser: the full message for the administrator, plus a
// neutral one (user_error) that the app shows to everyone else.
function modelFailureBody(p: ModelProblem) {
  return { code: p.code, fatal: p.fatal, error: p.error, user_error: p.operator ? USER_SAFE_AI : undefined };
}
// --- ERR END ---

function reply(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// --- LOG START (identical in every function that records events) ---
// Best-effort write to the admin event log (public.app_events). It must never
// break the request it is describing, so every failure is swallowed.
async function logEvent(admin: any, e: { user_id?: string | null; source: string; kind: string; code?: string | null; message?: string | null; data?: Record<string, unknown> }) {
  try {
    const { error } = await admin.from('app_events').insert({
      user_id: e.user_id ?? null,
      source: e.source,
      kind: e.kind,
      code: e.code ?? null,
      message: e.message ? String(e.message).slice(0, 1000) : null,
      data: e.data ?? {},
    });
    if (error) console.error('logEvent failed:', error.message);
  } catch (err) {
    console.error('logEvent threw:', String(err));
  }
}
// --- LOG END ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ---- who is calling? (a signed-in user, not just anyone holding the anon key) ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const authed = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await authed.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return reply({ error: 'Your sign-in has expired. Sign out and sign in again, then retry.', code: 'session_expired', fatal: true }, 401);
    }
    const uid = userData.user.id;
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { full_body, selected_text, instruction, lead_context } = await req.json();
    if (!full_body || !selected_text) {
      return reply({ code: 'bad_request', fatal: false, error: 'Missing full_body or selected_text' }, 400);
    }
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) {
      const message = 'The ANTHROPIC_API_KEY secret is not set in Supabase. Add it with: npx supabase secrets set ANTHROPIC_API_KEY=your-key';
      await logEvent(admin, { user_id: uid, source: 'refine-selection', kind: 'error', code: 'anthropic_key_missing', message });
      return reply({ code: 'anthropic_key_missing', fatal: true, error: message, user_error: USER_SAFE_AI }, 500);
    }
    const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';

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

    let resp: Response;
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
    } catch {
      await logEvent(admin, { user_id: uid, source: 'refine-selection', kind: 'error', code: 'anthropic_unreachable', message: 'Could not reach api.anthropic.com' });
      return reply({ code: 'anthropic_unreachable', fatal: false, error: 'Could not reach the AI service. Try again in a moment.' }, 502);
    }

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const problem = classifyAnthropicFailure(resp.status, data);
      console.error('refine-selection: Anthropic returned', resp.status, data?.error?.type, data?.error?.message);
      await logEvent(admin, { user_id: uid, source: 'refine-selection', kind: 'error', code: problem.code, message: problem.error, data: { http_status: resp.status, anthropic_type: data?.error?.type ?? null, anthropic_message: data?.error?.message ?? null, model } });
      return reply(modelFailureBody(problem), 502);
    }
    const text = (data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    if (!text) {
      await logEvent(admin, { user_id: uid, source: 'refine-selection', kind: 'error', code: 'empty_rewrite', message: 'The model returned no text', data: { model } });
      return reply({ code: 'empty_rewrite', fatal: false, error: 'The AI model returned no text — your draft was not changed. Try again.' }, 502);
    }
    await logEvent(admin, { user_id: uid, source: 'refine-selection', kind: 'usage', code: 'rewrite', data: { model, input_tokens: data?.usage?.input_tokens ?? null, output_tokens: data?.usage?.output_tokens ?? null } });
    return reply({ replacement: text });
  } catch (e) {
    return reply({ code: 'server_error', fatal: false, error: String(e) }, 500);
  }
});
