// Supabase Edge Function: server-side draft generation.
// Deploy:  supabase functions deploy draft
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The Anthropic key lives ONLY here, never in the browser. The frontend
// posts lead facts to /functions/v1/draft and gets back { subject, body, evaluation[] }.
//
// The caller must be signed in (a bare anon-key request is refused, so a stranger
// cannot spend your Anthropic credit). Failures and token usage are written to
// public.app_events for the Admin tab.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SENDER_INTRO = `You write short, honest, professional B2B cold outreach emails for a freelance web developer / small agency reaching out to Indian small businesses.

SENDER CONTEXT: sender_name, sender_title, sender_company and sender_business_info describe the person WRITING. You may use them to say who is writing and what they offer, but they are not facts about the lead.

`;

// The facts-only rules every email shares: nothing the model was not given, and the web-check rules.
const FACT_RULES = `STRICT RULE: use ONLY the facts given in the user message. Never invent a website, review, social detail, or personal fact that wasn't provided. If a field says "Unknown", "Not checked", or "None", omit it rather than guessing. If a voice_profile is given, follow its tone. If reference_notes is given (formatted as one or more "Source: <url>" sections), you may draw on those facts too — when you do, name it in SOURCES as "<claim> — from <the specific url>", not a generic label, so it's clear exactly which reference backed the claim.

WEBSITE FACTS. There are two possible sources. (a) If web_check.checked is true, the website information comes from an automated web check: follow the WEB CHECK RULES below and ignore anything website_status says about whether they have a site. (b) If web_check.checked is false or missing, website_status was entered by the user; if it says no website was found you may reference that honestly.

WEB CHECK RULES (only when web_check.checked is true). The web check is evidence, not proof: business names collide constantly, so a search result can belong to a different company.
- website_outcome \"confirmed_own_domain\": the domain came from the company's own email address, so the website is theirs and you may mention it. Only quote its title or description exactly as given in web_check.website; never describe pages or content you were not shown.
- website_outcome \"possible_match_unverified\": a site was found that MIGHT be theirs but could belong to another business. Do NOT mention it, and do NOT imply they have or lack a website. You may note it as a caveat in EVALUATION.
- website_outcome \"placeholder_page\" or \"blocked\": do not claim they have a live website and do not claim they lack one.
- website_outcome \"none_found\": no search result looked like their own website. NEVER write that they do not have a website. At most, only if it fits naturally, say you could not find a website for the business online, phrased as your own observation. Otherwise leave it out.
- listings_matched_by_name and google_business_matched_by_name: the business name matched, which is still not proof. You may say the business appears on that platform, only if it is in these lists, and add no detail that is not given.
- Every fact you use from web_check must appear in SOURCES as \"<claim> — from web check: <url>\" (for a Google Business result with no url write \"from web check: Google Business result\").
- Write as someone who has looked at the company's public presence. Never mention searching, Google, tools, or a check.

`;

const COLD_FORMAT = `Write four things, in this exact format and nothing else:

EVALUATION:
- (one line: is this a good-fit lead and why, based only on given facts)
- (one line: what contact/channel to use and why)
- (one line: any risk or caveat — if none, say "No specific risk flags from the data provided.")

SOURCES:
- (one line per factual claim actually used in the body, format: "<short claim> — from <field name>". If the body makes no specific factual claims beyond generic value language, write "No specific claims beyond general outreach language.")

SUBJECT: (one subject line, under 60 characters, specific and honest, no clickbait)

BODY:
(90-130 words. Open with the recommended_salutation given. One genuine, verifiable personalization line drawn only from the facts. One to two sentences of value — no bullet list. One low-pressure call to action. One short line making it easy to opt out. Then close according to signature_mode: if signature_mode is "auto", end with ONLY a short closing phrase such as "Best regards," on its own line — the sender's signature block (name, title, company, links) is added automatically after the email, so write nothing after the closing phrase, not even a name. Otherwise (signature_mode is "in_body" or missing) sign off with sender_name. Plain prose.)`;

const SYSTEM_PROMPT = SENDER_INTRO + FACT_RULES + COLD_FORMAT;

// ---- Follow-up mode ------------------------------------------------------------------------
// The same facts-only rules, a different job: a short nudge after an earlier email got no answer.
const FOLLOWUP_INTRO = `You write short, honest, professional FOLLOW-UP emails for a freelance web developer / small agency who emailed an Indian small business a few days ago and has not had a reply.

SENDER CONTEXT: sender_name, sender_title, sender_company and sender_business_info describe the person WRITING. You may use them to say who is writing and what they offer, but they are not facts about the lead.

`;

const FOLLOWUP_FORMAT = `FOLLOW-UP INPUT. previous_email holds the email that was already sent (subject, body, sent_on, days_since). followup_number says whether this is the 1st or 2nd follow-up. live_check_changes (when present) says whether a fresh web check was just run (checked_now), whether it found anything different from before (changed), and what is new (new_findings: plain sentences you may use as facts - cite them in SOURCES as "<claim> - from live check").

FOLLOW-UP RULES.
- Be brief: 50-90 words. Open with the recommended_salutation given. One line that refers back to the earlier email naturally (for example "I wrote to you on <sent_on> about ..."). Do not repeat the earlier email's pitch word for word.
- Give ONE reason to read it: either something genuinely new from the facts (only if live_check_changes.new_findings has entries, or the web check gives a fact the earlier email did not use), or the same idea from a fresh, concrete angle. Never invent news, deadlines, scarcity, discounts or "limited slots".
- Never guilt-trip: no "I haven't heard back", "you must have missed my email", "just checking again", "bumping this".
- If followup_number is 2 this is the last email: say you will not keep writing, that it is fine if the timing is wrong, and leave the door open in one line.
- One low-pressure call to action, and one short line making it easy to opt out.
- SUBJECT must be exactly: "Re: " followed by previous_email.subject (do not add "Re:" twice).
- Close according to signature_mode: if signature_mode is "auto", end with ONLY a short closing phrase such as "Best regards," on its own line — the sender's signature block is added automatically after the email, so write nothing after it, not even a name. Otherwise sign off with sender_name. Plain prose.

Write four things, in this exact format and nothing else:

EVALUATION:
- (one line: why a follow-up is reasonable now, based only on given facts)
- (one line: what is new, or what angle this follow-up takes)
- (one line: any risk or caveat — if none, say "No specific risk flags from the data provided.")

SOURCES:
- (one line per factual claim actually used in the body, format: "<short claim> — from <field name>". If the body makes no specific factual claims beyond the earlier email and general language, write "No specific claims beyond general outreach language.")

SUBJECT: (exactly as described above)

BODY:
(the follow-up email)`;

const FOLLOWUP_PROMPT = FOLLOWUP_INTRO + FACT_RULES + FOLLOWUP_FORMAT;

// ---- Upsell mode -------------------------------------------------------------------------
// Not an email: ideas for what to offer an existing client next.
const UPSELL_PROMPT = `You advise a freelance web developer / small agency on what else to offer a business that has ALREADY become a client.

SENDER CONTEXT: sender_name, sender_company, sender_business_info and sender_offer describe the person advising. Only suggest things that plausibly fit what the sender offers; if sender_offer is vague, stay with common web, search and online-presence services.

STRICT RULE: use ONLY the facts given. Never invent facts about the client, their business, their customers, their sales or their results. If a field says "Unknown", "Not checked", or "None", do not guess. client.notes is the sender's own note about the project; treat it as context, not as proof of anything else.

WEB CHECK. If web_check.checked is true, it shows what a public web search found. It is evidence, not proof: names collide. Only use a finding when you can say what it shows ("no Google Business result matched their name"), never as certain fact about the business.

Give 3 to 5 ideas, each one either an UPSELL (a bigger or better version of what they bought) or a CROSS-SELL (a different service). Each must be specific to this client's facts, not a generic list. Do not suggest anything that needs facts you were not given. If client.payment_received is false, say in "timing" to settle the existing payment first.

Reply with ONLY a JSON array, no prose before or after it, no code fences. Each element:
{"title": "<under 60 characters>", "type": "upsell" | "cross-sell", "why": "<one or two sentences naming the fact it is based on>", "pitch": "<one or two sentences the sender could say to the client, in plain language, no hype>", "timing": "<when to raise it, one short sentence>"}`;

// The model is asked for a bare JSON array. Be forgiving about stray text or fences around it,
// strict about the contents: only strings, bounded in length, at most 6 ideas.
function parseIdeas(text: string) {
  const a = text.indexOf('[');
  const b = text.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  let raw: unknown;
  try { raw = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  if (!Array.isArray(raw)) return null;
  const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const ideas = raw
    .filter((r) => r && typeof r === 'object')
    .map((r: any) => ({
      title: clip(r.title, 80),
      type: /cross/i.test(String(r.type)) ? 'cross-sell' : 'upsell',
      why: clip(r.why, 400),
      pitch: clip(r.pitch, 400),
      timing: clip(r.timing, 200),
    }))
    .filter((r) => r.title && r.why)
    .slice(0, 6);
  return ideas.length ? ideas : null;
}

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

    const lead = await req.json();
    // What to write: a first email (the default, unchanged), a follow-up, or upsell ideas for a client.
    const mode: 'cold' | 'followup' | 'upsell' = lead?.mode === 'followup' ? 'followup' : lead?.mode === 'upsell' ? 'upsell' : 'cold';
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) {
      const message = 'The ANTHROPIC_API_KEY secret is not set in Supabase. Add it with: npx supabase secrets set ANTHROPIC_API_KEY=your-key';
      await logEvent(admin, { user_id: uid, source: 'draft', kind: 'error', code: 'anthropic_key_missing', message });
      return reply({ code: 'anthropic_key_missing', fatal: true, error: message, user_error: USER_SAFE_AI }, 500);
    }
    const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';

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
          max_tokens: mode === 'upsell' ? 1500 : 1000,
          system: mode === 'followup' ? FOLLOWUP_PROMPT : mode === 'upsell' ? UPSELL_PROMPT : SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `${mode === 'upsell' ? 'Client' : 'Lead'} data:\n${JSON.stringify(lead, null, 2)}` }],
        }),
      });
    } catch {
      await logEvent(admin, { user_id: uid, source: 'draft', kind: 'error', code: 'anthropic_unreachable', message: 'Could not reach api.anthropic.com' });
      return reply({ code: 'anthropic_unreachable', fatal: false, error: 'Could not reach the AI service. Try again in a moment.' }, 502);
    }

    const data = await resp.json().catch(() => null);
    // Never turn a failed model call into a blank saved draft.
    if (!resp.ok) {
      const problem = classifyAnthropicFailure(resp.status, data);
      console.error('draft: Anthropic returned', resp.status, data?.error?.type, data?.error?.message);
      await logEvent(admin, { user_id: uid, source: 'draft', kind: 'error', code: problem.code, message: problem.error, data: { http_status: resp.status, anthropic_type: data?.error?.type ?? null, anthropic_message: data?.error?.message ?? null, model } });
      return reply(modelFailureBody(problem), 502);
    }
    const text = (data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    if (!text.trim()) {
      await logEvent(admin, { user_id: uid, source: 'draft', kind: 'error', code: 'empty_draft', message: 'The model returned no text', data: { model } });
      return reply({ code: 'empty_draft', fatal: false, error: 'The AI model returned no text — nothing was saved. Try again.' }, 502);
    }
    if (mode === 'upsell') {
      const ideas = parseIdeas(text);
      if (!ideas) {
        await logEvent(admin, { user_id: uid, source: 'draft', kind: 'error', code: 'unreadable_ideas', message: 'The model reply could not be read as a list of ideas', data: { model } });
        return reply({ code: 'unreadable_ideas', fatal: false, error: 'The AI answered in a form the tool could not read - nothing was saved. Try again.' }, 502);
      }
      await logEvent(admin, { user_id: uid, source: 'draft', kind: 'usage', code: 'upsell', data: { model, input_tokens: data?.usage?.input_tokens ?? null, output_tokens: data?.usage?.output_tokens ?? null } });
      return reply({ ideas, generatedAt: new Date().toISOString() });
    }
    await logEvent(admin, { user_id: uid, source: 'draft', kind: 'usage', code: mode === 'followup' ? 'followup' : 'draft', data: { model, input_tokens: data?.usage?.input_tokens ?? null, output_tokens: data?.usage?.output_tokens ?? null } });
    return reply(parse(text));
  } catch (e) {
    return reply({ code: 'server_error', fatal: false, error: String(e) }, 500);
  }
});
