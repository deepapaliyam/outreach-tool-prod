// Supabase Edge Function: "Service check" — tests every outside service the
// tool depends on and says, in plain language, what (if anything) needs fixing.
//
//   Anthropic  - a 1-token test message (costs a fraction of a paisa). Catches an
//                expired / disabled key, no credit, a spending limit, a retired model.
//   Serper     - one search (uses 1 search credit). Catches a bad key / no credits.
//   Google     - the Gmail sign-in secrets are present.
//   Gmail      - THIS user's saved Gmail permission still works (nothing is sent).
//                Google expires it after 7 days while the OAuth app is in Testing mode.
//   Database   - the Supabase database answers.
//
// Two ways to call it:
//   1. From the app's Admin tab (a signed-in user who is in public.app_admins;
//      anyone else gets 404, as if the function did not exist)
//                                      -> all checks, always HTTP 200.
//   2. From a free uptime monitor with header  x-monitor-token: <HEALTH_CHECK_TOKEN>
//      -> provider checks only (Anthropic, Google secrets, database; add ?serper=1
//      for Serper too). HTTP 503 if anything FAILS, so the monitor emails you
//      before a client notices. Pinging it also stops a free Supabase project
//      from pausing itself for inactivity.
//
// Deploy (note the flag — this function does its own sign-in check, which is
// what lets a monitor call it without a user login):
//   npx supabase functions deploy health-check --no-verify-jwt
// Optional secret for monitoring:  npx supabase secrets set HEALTH_CHECK_TOKEN=<long random text>

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-monitor-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

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

// --- SERPER ERR START (identical in enrich-lead and health-check) ---
// Plain-language mapping of a Serper.dev failure. `fatal` = a setup problem
// (bad key / out of credits) that retrying or checking more leads cannot
// fix; those use HTTP 400 so clients do not retry them. `operator` = only the
// administrator can fix it, so ordinary users see USER_SAFE_SEARCH instead.
type SearchProblem = { code: string; fatal: boolean; operator: boolean; status: number; error: string };
const USER_SAFE_SEARCH = 'The web-check service is unavailable right now. The problem has been recorded for your administrator.';
function classifySerperFailure(status: number, data: any): SearchProblem {
  const msg = String(data?.message || data?.error || '').toLowerCase();
  if (msg.includes('credit')) {
    return { code: 'serper_credit', fatal: true, operator: true, status: 400, error: 'Your Serper search credits have run out. Top up at serper.dev, then try again.' };
  }
  if (status === 401 || status === 403) {
    return { code: 'serper_key_invalid', fatal: true, operator: true, status: 400, error: 'Serper rejected the API key. Check the SERPER_API_KEY secret in Supabase and your account at serper.dev.' };
  }
  if (status === 429) {
    return { code: 'serper_busy', fatal: false, operator: false, status: 429, error: 'Search rate limit reached — retrying shortly.' };
  }
  return { code: 'serper_error', fatal: false, operator: false, status: 502, error: `Search failed (${status}).` };
}
// --- SERPER ERR END ---

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

// --- CHECKS START (no Deno APIs except env reads inside the functions) ---
type Status = 'ok' | 'warn' | 'fail';
type Check = { id: string; label: string; status: Status; message: string };

function mk(id: string, label: string, status: Status, message: string): Check {
  return { id, label, status, message };
}

async function checkAnthropic(): Promise<Check> {
  const label = 'AI drafting (Anthropic)';
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return mk('anthropic', label, 'fail', 'The ANTHROPIC_API_KEY secret is not set in Supabase.');
  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
    });
    const data = await resp.json().catch(() => null);
    if (resp.ok) return mk('anthropic', label, 'ok', `Working (model ${model}).`);
    const p = classifyAnthropicFailure(resp.status, data);
    return mk('anthropic', label, p.fatal ? 'fail' : 'warn', p.error);
  } catch {
    return mk('anthropic', label, 'warn', 'Could not reach the Anthropic API from the server. Try again in a moment.');
  }
}

async function checkSerper(): Promise<Check> {
  const label = 'Web search (Serper)';
  const key = Deno.env.get('SERPER_API_KEY');
  if (!key) return mk('serper', label, 'fail', 'The SERPER_API_KEY secret is not set in Supabase.');
  try {
    const resp = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'test', gl: 'in', num: 1 }),
    });
    const data = await resp.json().catch(() => null);
    if (resp.ok) return mk('serper', label, 'ok', 'Working (this check used 1 search credit).');
    const p = classifySerperFailure(resp.status, data);
    return mk('serper', label, p.fatal ? 'fail' : 'warn', p.error);
  } catch {
    return mk('serper', label, 'warn', 'Could not reach Serper from the server. Try again in a moment.');
  }
}

function checkGoogleConfig(): Check {
  const label = 'Gmail sign-in setup (Google)';
  const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((n) => !Deno.env.get(n));
  if (missing.length) return mk('google', label, 'fail', `Missing secret${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Gmail sending cannot work until they are set.`);
  return mk('google', label, 'ok', 'Google client ID and secret are set.');
}

async function checkGmail(admin: any, uid: string): Promise<Check> {
  const label = 'Your Gmail connection';
  const { data: conn, error } = await admin.from('gmail_connections').select('refresh_token').eq('user_id', uid).maybeSingle();
  if (error) return mk('gmail', label, 'warn', 'Could not look up your Gmail connection.');
  if (!conn) return mk('gmail', label, 'warn', 'Not connected yet. Click "Connect Gmail" on the Drafts tab to send or save drafts.');
  if (!Deno.env.get('GOOGLE_CLIENT_ID') || !Deno.env.get('GOOGLE_CLIENT_SECRET')) {
    return mk('gmail', label, 'warn', 'Cannot test it because the Google secrets are missing.');
  }
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        refresh_token: conn.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.access_token) return mk('gmail', label, 'ok', 'Connected and working (nothing was sent).');
    if (data?.error === 'invalid_grant') return mk('gmail', label, 'fail', 'Your Gmail permission has expired or was revoked. Click "Disconnect Gmail", then "Connect Gmail" again. (Google expires it every 7 days while the Google app is in Testing mode.)');
    if (data?.error === 'invalid_client') return mk('gmail', label, 'fail', 'The Google client ID / secret secrets do not match your Google Cloud client.');
    return mk('gmail', label, 'warn', 'Google did not accept the saved connection. Try Disconnect Gmail, then Connect Gmail.');
  } catch {
    return mk('gmail', label, 'warn', 'Could not reach Google from the server. Try again in a moment.');
  }
}

async function checkDatabase(admin: any): Promise<Check> {
  const label = 'Database (Supabase)';
  try {
    const { error } = await admin.from('leads').select('id', { count: 'exact', head: true }).limit(1);
    if (error) return mk('database', label, 'fail', 'The database answered with an error. Has the setup SQL been run? (' + error.message + ')');
    return mk('database', label, 'ok', 'Reachable.');
  } catch {
    return mk('database', label, 'fail', 'The database did not answer.');
  }
}

// A monitor-token comparison that does not reveal where two strings differ.
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// --- CHECKS END ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);
    const url = new URL(req.url);

    // ---- who is asking? ----
    const monitorSecret = Deno.env.get('HEALTH_CHECK_TOKEN') || '';
    const monitorHeader = req.headers.get('x-monitor-token') || '';
    const isMonitor = !!monitorSecret && sameSecret(monitorHeader, monitorSecret);

    let uid: string | null = null;
    if (!isMonitor) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const jwt = authHeader.replace('Bearer ', '');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authed = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await authed.auth.getUser(jwt);
      if (userErr || !userData?.user) return json({ error: 'Invalid session', code: 'session_expired' }, 401);
      uid = userData.user.id;
      // Admins only. Everyone else is told it does not exist.
      const { data: adminRow } = await admin.from('app_admins').select('user_id').eq('user_id', uid).maybeSingle();
      if (!adminRow) return json({ error: 'Not found' }, 404);
    }

    // ---- run the checks side by side ----
    const wantSerper = !isMonitor || url.searchParams.get('serper') === '1';
    const jobs: Array<Promise<Check>> = [checkAnthropic(), Promise.resolve(checkGoogleConfig()), checkDatabase(admin)];
    if (wantSerper) jobs.push(checkSerper());
    if (uid) jobs.push(checkGmail(admin, uid));
    const results = await Promise.all(jobs);

    const order = ['anthropic', 'serper', 'google', 'gmail', 'database'];
    const checks = results.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const anyFail = checks.some((c) => c.status === 'fail');
    const body = { checkedAt: new Date().toISOString(), ok: !anyFail, checks };
    // Keep a history for the Admin tab (statuses only — never any secret).
    await logEvent(admin, {
      user_id: uid, source: 'health-check', kind: 'health', code: anyFail ? 'fail' : 'ok',
      message: anyFail ? checks.filter((c) => c.status === 'fail').map((c) => c.label).join(', ') + ' need fixing' : 'All checks passed',
      data: { mode: isMonitor ? 'monitor' : 'admin', checks: checks.map((c) => ({ id: c.id, label: c.label, status: c.status, message: c.message })) },
    });
    return json(body, isMonitor && anyFail ? 503 : 200);
  } catch (e) {
    return json({ error: String(e), code: 'server_error' }, 500);
  }
});
