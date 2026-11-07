// Supabase Edge Function: sends (or drafts) an email through the user's
// own Gmail, using the refresh token captured at connect-time. Never
// exposes the token to the browser — it's read here with the service
// role key only.
//
// SEND SAFETY (enforced here, server-side, so it can't be bypassed by a
// second browser tab or a page refresh). For every REAL outreach send —
// meaning the recipient is not one of the user's own addresses and it
// isn't a draftOnly call — three rules apply, checked in this order:
//   1. Daily limit: at most `daily_send_cap` real sends (default 30, max
//      100) in any rolling 24 hours.
//   2. Minimum spacing: at least 120 seconds since the previous real send.
//   3. No double-contact: the same recipient address can't be emailed
//      twice within 30 days (the same director often appears on several
//      newly registered entities).
// Test-mode sends (to yourself) and Gmail drafts are exempt from all
// three and are not counted against the limit.
//
// SIGNATURE: if the user saved a signature in Profile & Settings, it is
// sanitised here (never trusted as stored) and sent as a multipart email:
// styled HTML plus a plain-text copy. With no signature the message is the
// same plain-text email as before.
//
// GMAIL RESPONSES: whatever Gmail answers (message id, thread id, labels, or
// the exact error) is recorded in public.gmail_responses for every send, test
// send and Gmail draft, and failures also go to the admin event log.
//
// Secrets needed (set once):
//   supabase secrets set GOOGLE_CLIENT_ID=...
//   supabase secrets set GOOGLE_CLIENT_SECRET=...
// Deploy: supabase functions deploy send-email

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import sanitizeHtml from 'npm:sanitize-html@2.13.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Email headers must be 7-bit ASCII — any non-ASCII header value (like a
// subject containing an em dash or an accented name) needs RFC 2047
// "encoded-word" wrapping, or it renders as mojibake in the recipient's
// inbox even though the body (which just needs a charset declaration)
// looks fine.
function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(value))}?=`;
}

// --- GUARD START (pure logic, no Deno APIs — unit-tested separately) ---
const MIN_GAP_SECONDS = 120;
const DUPLICATE_WINDOW_DAYS = 30;
const FOLLOWUP_MIN_DAYS = 3;       // wait at least this long after the last email before following up
const MAX_FOLLOW_UPS = 2;          // per lead - a third nudge is pestering
const DEFAULT_DAILY_CAP = 30;
const MAX_DAILY_CAP = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function clampCap(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAILY_CAP;
  return Math.min(MAX_DAILY_CAP, n);
}

function isOwnAddress(to: string, candidates: Array<string | null | undefined>): boolean {
  const target = String(to).trim().toLowerCase();
  return candidates.filter(Boolean).some((c) => String(c).trim().toLowerCase() === target);
}

interface GuardInput {
  now: number;                                  // ms since epoch
  exempt: boolean;                              // draftOnly, or a send to one of the user's own addresses
  cap: number;                                  // already clamped
  sentLast24h: Array<{ sent_at: string }>;      // real sends in the last 24h, NEWEST first
  priorToSameAddress: { sent_at: string } | null; // most recent real send to this recipient within the duplicate window
  to: string;
  followUp?: boolean;                           // this email is a follow-up to one already sent to the lead
  leadOutcome?: LeadOutcome | null;             // the lead's outcome row, when the request names a lead
  lastLeadSendAt?: string | null;               // newest real send to this lead in the send log (exact time)
}
interface LeadOutcome {
  contacted?: boolean | null;
  contacted_date?: string | null;               // date (YYYY-MM-DD) of the first email
  follow_ups?: Array<{ sent_at: string }> | null;
}
interface GuardResult {
  allowed: boolean;
  status?: number;
  code?: 'daily_cap' | 'min_gap' | 'duplicate_recipient' | 'already_sent' | 'followup_no_original' | 'followup_limit' | 'followup_too_soon';
  error?: string;
}

// When the lead was last emailed: the newest of the first email's date (a date has no time
// of day, so it counts from the start of that day), any follow-up, and the send log's exact time.
function lastTouchMs(o: LeadOutcome, lastSendAt?: string | null): number | null {
  const times: number[] = [];
  if (o.contacted_date) {
    const t = Date.parse(`${String(o.contacted_date).slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(t)) times.push(t);
  }
  for (const f of o.follow_ups ?? []) {
    const t = Date.parse(f.sent_at);
    if (Number.isFinite(t)) times.push(t);
  }
  if (lastSendAt) {
    const t = Date.parse(lastSendAt);
    if (Number.isFinite(t)) times.push(t);
  }
  return times.length ? Math.max(...times) : null;
}

function evaluateSendGuard(i: GuardInput): GuardResult {
  if (i.exempt) return { allowed: true };

  // 0. A first email to a lead that has already been emailed is refused outright, so a
  // stale screen or a second browser tab can never send the same lead a second "first" email.
  // Follow-ups are the only way to write to them again.
  if (!i.followUp && i.leadOutcome?.contacted) {
    const when = i.leadOutcome.contacted_date ? ` on ${String(i.leadOutcome.contacted_date).slice(0, 10)}` : '';
    return {
      allowed: false, status: 409, code: 'already_sent',
      error: `This lead was already emailed${when}, so it was skipped. Use the Sent tab if you want to follow up. Nothing was sent.`,
    };
  }

  // 1. Rolling-24h limit. If the user is at or over the cap, the slot that
  // frees up first belongs to the row at index (cap - 1) in a newest-first
  // list — that's the send that must age out before there's room again.
  if (i.sentLast24h.length >= i.cap) {
    const blocking = i.sentLast24h[i.cap - 1];
    const freesAt = Date.parse(blocking.sent_at) + DAY_MS;
    const mins = Math.max(1, Math.ceil((freesAt - i.now) / 60000));
    return {
      allowed: false, status: 429, code: 'daily_cap',
      error: `Daily safe-send limit reached (${i.sentLast24h.length} real sends in the last 24 hours, limit ${i.cap}). The next slot opens in about ${mins} minute${mins === 1 ? '' : 's'}. Nothing was sent.`,
    };
  }

  // 2. Minimum spacing from the previous real send.
  const latest = i.sentLast24h[0];
  if (latest) {
    const elapsed = (i.now - Date.parse(latest.sent_at)) / 1000;
    if (elapsed < MIN_GAP_SECONDS) {
      const wait = Math.ceil(MIN_GAP_SECONDS - elapsed);
      return {
        allowed: false, status: 429, code: 'min_gap',
        error: `Too soon after your last send — please wait about ${wait} more second${wait === 1 ? '' : 's'}. Spacing sends out is what keeps outreach from looking like a burst. Nothing was sent.`,
      };
    }
  }

  // 3a. A follow-up: needs an earlier email, a polite wait, and no more than MAX_FOLLOW_UPS.
  if (i.followUp) {
    const o = i.leadOutcome;
    if (!o?.contacted) {
      return {
        allowed: false, status: 409, code: 'followup_no_original',
        error: 'There is no earlier email recorded for this lead, so there is nothing to follow up on. Nothing was sent.',
      };
    }
    const done = (o.follow_ups ?? []).length;
    if (done >= MAX_FOLLOW_UPS) {
      return {
        allowed: false, status: 409, code: 'followup_limit',
        error: `You have already sent ${done} follow-up${done === 1 ? '' : 's'} to this lead (the limit is ${MAX_FOLLOW_UPS}). A third nudge tends to hurt more than help. Nothing was sent.`,
      };
    }
    const last = lastTouchMs(o, i.lastLeadSendAt);
    if (last !== null) {
      const waitDays = Math.ceil((last + FOLLOWUP_MIN_DAYS * DAY_MS - i.now) / DAY_MS);
      if (waitDays > 0) {
        return {
          allowed: false, status: 409, code: 'followup_too_soon',
          error: `It is too soon to follow up - wait about ${waitDays} more day${waitDays === 1 ? '' : 's'} (at least ${FOLLOWUP_MIN_DAYS} days after the last email). Nothing was sent.`,
        };
      }
    }
    return { allowed: true };
  }

  // 3b. Same recipient contacted recently.
  if (i.priorToSameAddress) {
    const when = new Date(i.priorToSameAddress.sent_at).toISOString().slice(0, 10);
    return {
      allowed: false, status: 409, code: 'duplicate_recipient',
      error: `You already emailed ${i.to} on ${when} (within the last ${DUPLICATE_WINDOW_DAYS} days), so this one was skipped to avoid contacting the same person twice. Nothing was sent.`,
    };
  }

  return { allowed: true };
}
// --- GUARD END ---

// --- MAIL START (pure logic, no Deno APIs — unit-tested separately) ---
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Blank lines start a new paragraph, single line breaks stay line breaks.
function bodyToHtml(body: string): string {
  return body.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px 0">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}
// Plain-text twin of the signature, for mail clients that show text only.
function htmlToText(html: string): string {
  return html
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return !text || text === href ? href : `${text} (${href})`;
    })
    .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, (_m, alt) => (alt ? alt : ''))
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function wrap76(b64: string): string {
  return (b64.match(/.{1,76}/g) || []).join('\r\n');
}
// With no signature this is byte-for-byte the plain email the tool always
// sent. With one, it is multipart/alternative: plain text first, HTML last
// (clients show the last part they understand).
function buildMime(o: { to: string; subject: string; body: string; signatureHtml: string; boundary: string }): string {
  const head = [`To: ${o.to}`, `Subject: ${encodeHeader(o.subject)}`, 'MIME-Version: 1.0'];
  if (!o.signatureHtml) {
    return [...head, 'Content-Type: text/plain; charset="UTF-8"', '', o.body].join('\r\n');
  }
  const text = `${o.body.trim()}\n\n${htmlToText(o.signatureHtml)}`;
  const html = `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222">${bodyToHtml(o.body)}<div style="margin-top:6px">${o.signatureHtml}</div></div></body></html>`;
  const enc = (t: string) => wrap76(bytesToBase64(new TextEncoder().encode(t)));
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${o.boundary}"`,
    '',
    `--${o.boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    enc(text),
    `--${o.boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    enc(html),
    `--${o.boundary}--`,
    '',
  ].join('\r\n');
}

// Plain-language reading of a Gmail API failure.
function classifyGmailFailure(status: number, data: any): { code: string; fatal: boolean; error: string } {
  const g = data?.error;
  const msg = String(g?.message || '');
  const reasons = ((g?.errors as any[]) || []).map((e) => String(e?.reason || '')).join(' ');
  const blob = `${msg} ${reasons}`.toLowerCase();
  if (status === 401) {
    return { code: 'gmail_reconnect', fatal: true, error: 'Gmail no longer accepts your saved connection. Click "Disconnect Gmail", then "Connect Gmail" again. Nothing was sent.' };
  }
  if (status === 403 && /insufficient|scope/.test(blob)) {
    return { code: 'gmail_scopes', fatal: true, error: 'Your Gmail connection is missing the permission to send email. Click "Disconnect Gmail", then "Connect Gmail to send", and on Google’s screen tick the box that lets the app send email on your behalf. If Google does not show that box, add the gmail.send permission under Data Access in your Google Cloud app first (GMAIL_OAUTH_SETUP.md, step 5). Nothing was sent.' };
  }
  if ((status === 403 || status === 429) && /ratelimit|dailylimit|quota/.test(blob)) {
    return { code: 'gmail_limit', fatal: true, error: 'Gmail itself has stopped this account from sending for now (its own sending limit). Wait a while — usually up to 24 hours — before sending again. Nothing was sent.' };
  }
  if (status === 400 && /recipient|invalid to|address/.test(blob)) {
    return { code: 'gmail_recipient', fatal: false, error: 'Gmail rejected the recipient address. Check the email address and try again. Nothing was sent.' };
  }
  if (status >= 500) {
    return { code: 'gmail_down', fatal: false, error: 'Gmail is temporarily unavailable. Try again in a few minutes. Nothing was sent.' };
  }
  return { code: 'gmail_error', fatal: false, error: `Gmail returned an error (${status}): ${msg || 'unknown error'}` };
}
// --- MAIL END ---

// Signatures are stored by the browser, so they are never trusted: only these
// tags, attributes and style properties survive. No scripts, no event handlers,
// no javascript:/data: links, and images must be http(s).
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/i, /^[a-z]{3,20}$/i];
const LENGTH = [/^\d+(\.\d+)?(px|pt|em|rem|%)$/];
function sanitizeSignature(html: string): string {
  return sanitizeHtml(String(html || '').slice(0, 20000), {
    allowedTags: ['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'img', 'ul', 'ol', 'li', 'hr'],
    allowedAttributes: { a: ['href', 'target', 'rel', 'style'], img: ['src', 'alt', 'width', 'height', 'style'], '*': ['style'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    allowedStyles: {
      '*': {
        color: COLOR, 'background-color': COLOR,
        'font-size': LENGTH, 'line-height': LENGTH.concat([/^\d+(\.\d+)?$/]),
        'font-weight': [/^(normal|bold|[1-9]00)$/], 'font-style': [/^(normal|italic)$/],
        'text-decoration': [/^(none|underline|line-through)$/], 'text-align': [/^(left|right|center|justify)$/],
        'font-family': [/^[\w\s,'"-]{1,120}$/],
        margin: [/^[\d.\s]+(px|pt|em|rem)?(\s+[\d.]+(px|pt|em|rem)?){0,3}$/],
      },
      img: { width: LENGTH, height: LENGTH.concat([/^auto$/]), 'max-width': LENGTH.concat([/^100%$/]), border: [/^0$/], 'vertical-align': [/^(top|middle|bottom|baseline)$/] },
    },
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }),
      // A 2000px logo would swamp the email, so images are capped unless sized.
      img: (tagName: string, attribs: Record<string, string>) => ({ tagName, attribs: { ...attribs, style: attribs.width ? `max-width:100%;height:auto;border:0;` : 'max-width:200px;height:auto;border:0;' } }),
    },
  }).trim();
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

class GmailAuthError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function refreshAccessToken(refresh_token: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    // invalid_grant = the stored Gmail permission expired or was revoked (Google
    // expires them after 7 days while the OAuth app is in "Testing" mode).
    if (data?.error === 'invalid_grant') {
      throw new GmailAuthError('gmail_reconnect', 'Your Gmail connection has expired or was revoked. Click "Disconnect Gmail", then "Connect Gmail" again. Nothing was sent.');
    }
    if (data?.error === 'invalid_client') {
      throw new GmailAuthError('gmail_client', 'Gmail sign-in is misconfigured on the server (the GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets do not match your Google Cloud client). Nothing was sent.');
    }
    // Anything else Google says is still a connection problem the user can fix the same way -
    // never show them a raw JSON blob.
    const why = typeof data?.error === 'string' ? data.error : (res.ok ? 'no access token returned' : `HTTP ${res.status}`);
    throw new GmailAuthError('gmail_reconnect', `Google would not renew your Gmail connection (${why}). Click "Disconnect Gmail", then "Connect Gmail" again. Nothing was sent.`);
  }
  return data.access_token as string;
}

// Records what Gmail answered. Best effort: it must never undo or block a send.
async function recordGmail(admin: any, row: Record<string, unknown>) {
  try {
    const { error } = await admin.from('gmail_responses').insert(row);
    if (error) console.error('gmail_responses insert failed:', error.message);
  } catch (err) {
    console.error('gmail_responses insert threw:', String(err));
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
    if (userErr || !userData?.user) return json({ error: 'Invalid session', code: 'session_expired' }, 401);
    const uid = userData.user.id;

    const { leadId, logLeadId, to, subject, body, sources, draftOnly, includeSignature, followUp: followUpRaw, threadId: threadRaw } = await req.json();
    if (!to || !subject || !body) return json({ error: 'Missing to/subject/body' }, 400);
    const followUp = followUpRaw === true;
    // A Gmail thread id is plain letters and digits; anything else is ignored rather than passed on.
    const threadId = typeof threadRaw === 'string' && /^[A-Za-z0-9]{6,64}$/.test(threadRaw) ? threadRaw : null;

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: conn, error: connErr } = await admin
      .from('gmail_connections')
      .select('refresh_token, gmail_address')
      .eq('user_id', uid)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!conn) return json({ error: 'Gmail is not connected yet — click "Connect Gmail" first. Nothing was sent.', code: 'gmail_not_connected', fatal: true }, 400);

    // The profile supplies the send cap, the test address and the signature.
    const { data: profile } = await admin
      .from('sender_profiles')
      .select('daily_send_cap, test_email, signature_html')
      .eq('user_id', uid)
      .maybeSingle();

    // ---- Send safety: gather what the guard needs, then decide ----
    const toNorm = String(to).trim().toLowerCase();
    let exempt = !!draftOnly;
    let cap = DEFAULT_DAILY_CAP;
    let recent: Array<{ sent_at: string }> = [];
    let priorSame: { sent_at: string } | null = null;
    let leadOutcome: LeadOutcome | null = null;
    let lastLeadSendAt: string | null = null;

    if (!draftOnly) {
      cap = clampCap(profile?.daily_send_cap);
      exempt = isOwnAddress(toNorm, [userData.user.email, profile?.test_email, conn.gmail_address]);

      if (!exempt) {
        const since24h = new Date(Date.now() - DAY_MS).toISOString();
        const { data: rows, error: logErr } = await admin
          .from('gmail_send_log')
          .select('sent_at')
          .eq('user_id', uid)
          .gte('sent_at', since24h)
          .order('sent_at', { ascending: false });
        const dupSince = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * DAY_MS).toISOString();
        const { data: dupRows, error: dupErr } = await admin
          .from('gmail_send_log')
          .select('sent_at')
          .eq('user_id', uid)
          .eq('to_address', toNorm)
          .gte('sent_at', dupSince)
          .order('sent_at', { ascending: false })
          .limit(1);
        // Fail closed: if the limits can't be verified, don't send a real email.
        if (logErr || dupErr) {
          console.error('send-safety lookup failed', logErr || dupErr);
          return json({ error: 'Could not verify your send limits (has supabase/send_safety_schema.sql been run?). Nothing was sent.' }, 500);
        }
        recent = rows ?? [];
        priorSame = dupRows?.[0] ?? null;

        // Has this lead already been emailed? (A follow-up also needs its follow-up history,
        // which lives in a column added by v8_schema.sql.)
        if (leadId) {
          const { data: oc, error: ocErr } = await admin
            .from('outcomes')
            .select(followUp ? 'contacted, contacted_date, follow_ups' : 'contacted, contacted_date')
            .eq('user_id', uid)
            .eq('lead_id', leadId)
            .maybeSingle();
          if (ocErr) {
            console.error('outcome lookup failed', ocErr);
            const hint = followUp ? ' (has supabase/v8_schema.sql been run?)' : '';
            return json({ error: `Could not check whether this lead was already emailed${hint}. Nothing was sent.`, code: 'lead_lookup_failed' }, 500);
          }
          leadOutcome = (oc as LeadOutcome | null) ?? null;
          if (followUp) {
            const { data: lastRows } = await admin
              .from('gmail_send_log')
              .select('sent_at')
              .eq('user_id', uid)
              .eq('lead_id', leadId)
              .order('sent_at', { ascending: false })
              .limit(1);
            lastLeadSendAt = lastRows?.[0]?.sent_at ?? null;
          }
        } else if (followUp) {
          return json({ error: 'A follow-up has to be tied to a lead. Nothing was sent.', code: 'followup_no_original' }, 400);
        }
      }
    }

    const decision = evaluateSendGuard({ now: Date.now(), exempt, cap, sentLast24h: recent, priorToSameAddress: priorSame, to: toNorm, followUp, leadOutcome, lastLeadSendAt });
    if (!decision.allowed) return json({ error: decision.error, code: decision.code }, decision.status ?? 429);

    // What kind of attempt this is, for the response log.
    const kind = draftOnly ? 'draft' : (exempt ? 'test' : 'send');
    const base = {
      user_id: uid, lead_id: leadId ?? logLeadId ?? null, kind, to_address: toNorm, subject: String(subject).slice(0, 300),
      ...(followUp ? { purpose: 'followup' } : {}),   // the column exists once v8_schema.sql has run; first emails never need it
    };

    // ---- Build and send (or draft) the message ----
    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(conn.refresh_token);
    } catch (e) {
      if (e instanceof GmailAuthError) {
        await recordGmail(admin, { ...base, ok: false, error_message: e.message, response: { stage: 'google_token_refresh', code: e.code } });
        await logEvent(admin, { user_id: uid, source: 'send-email', kind: 'error', code: e.code, message: e.message });
      }
      throw e;
    }

    const signatureHtml = includeSignature === false || !profile?.signature_html ? '' : sanitizeSignature(profile.signature_html);
    const mime = buildMime({ to, subject, body, signatureHtml, boundary: `outreach-${crypto.randomUUID()}` });
    const raw = bytesToBase64Url(new TextEncoder().encode(mime));

    // draftOnly: create it in the user's own Gmail Drafts folder instead of
    // sending — nothing is transmitted until they send it from Gmail.
    const endpoint = draftOnly
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
      : 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    // A follow-up goes into the same Gmail conversation as the first email. (Test sends to
    // yourself stay out of it.) Without Gmail's read permission the tool cannot see the first
    // email's Message-ID header, so this groups the two in YOUR Gmail; the recipient's mail
    // app decides for itself whether to show them as one thread.
    const useThread = followUp && threadId && (draftOnly || !exempt);
    const message = useThread ? { raw, threadId } : { raw };
    const payload = draftOnly ? { message } : message;

    let sendRes: Response;
    try {
      sendRes = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      const message = 'Could not reach Gmail from the server. Nothing was sent. Try again in a moment.';
      await recordGmail(admin, { ...base, ok: false, error_message: message, response: { stage: 'gmail_unreachable' } });
      await logEvent(admin, { user_id: uid, source: 'send-email', kind: 'error', code: 'gmail_unreachable', message });
      return json({ error: message, code: 'gmail_unreachable', fatal: false }, 502);
    }
    const sendData = await sendRes.json().catch(() => null);

    if (!sendRes.ok) {
      const problem = classifyGmailFailure(sendRes.status, sendData);
      await recordGmail(admin, { ...base, ok: false, http_status: sendRes.status, error_message: sendData?.error?.message ?? problem.error, response: sendData });
      await logEvent(admin, { user_id: uid, source: 'send-email', kind: 'error', code: problem.code, message: problem.error, data: { http_status: sendRes.status, gmail_message: sendData?.error?.message ?? null, kind } });
      return json({ error: problem.error, code: problem.code, fatal: problem.fatal, gmail: { status: sendRes.status, message: sendData?.error?.message ?? null } }, 502);
    }

    // Gmail answers a send with { id, threadId, labelIds } and a draft with { id, message: {...} }.
    const gmail = {
      status: sendRes.status,
      messageId: (sendData?.id && !draftOnly ? sendData.id : sendData?.message?.id) ?? null,
      draftId: draftOnly ? (sendData?.id ?? null) : null,
      threadId: (sendData?.threadId ?? sendData?.message?.threadId) ?? null,
      labelIds: (sendData?.labelIds ?? sendData?.message?.labelIds ?? []) as string[],
    };
    await recordGmail(admin, {
      ...base, ok: true, http_status: sendRes.status,
      gmail_message_id: gmail.messageId, gmail_thread_id: gmail.threadId, label_ids: gmail.labelIds, response: sendData,
    });

    // Log real outreach sends (never test sends to yourself, never drafts).
    let sendsLast24h: number | null = null;
    if (!exempt) {
      const { error: insErr } = await admin
        .from('gmail_send_log')
        .insert({ user_id: uid, lead_id: leadId ?? null, to_address: toNorm });
      if (insErr) console.error('gmail_send_log insert failed (the email WAS sent):', insErr);
      sendsLast24h = recent.length + 1;
    }

    // Mark the outcome as contacted + sent via Gmail — but never for a
    // draftOnly call, since nothing was actually sent.
    let followUps: unknown[] | null = null;
    if (leadId && !draftOnly) {
      if (followUp) {
        // The original email stays exactly as it was; the follow-up is added to its history.
        // (A follow-up to one of your own addresses is just a test, so it records nothing.)
        if (!exempt) {
          followUps = [
            ...(leadOutcome?.follow_ups ?? []),
            { sent_at: new Date().toISOString(), subject, body, thread_id: gmail.threadId, message_id: gmail.messageId },
          ];
          await admin.from('outcomes').upsert(
            { lead_id: leadId, user_id: uid, follow_ups: followUps, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,lead_id' }
          );
        }
      } else {
        await admin.from('outcomes').upsert(
          { lead_id: leadId, user_id: uid, contacted: true, contacted_date: new Date().toISOString().slice(0, 10), sent_via_gmail: true, sent_subject: subject, sent_body: body, sent_sources: sources || [], updated_at: new Date().toISOString() },
          { onConflict: 'user_id,lead_id' }
        );
      }
    }

    return json({ ok: true, draftOnly: !!draftOnly, kind, followUp, followUps, gmailMessageId: gmail.messageId, gmail, signatureIncluded: !!signatureHtml, counted: !exempt, sendsLast24h, cap });
  } catch (e) {
    if (e instanceof GmailAuthError) return json({ error: e.message, code: e.code, fatal: true }, 400);
    return json({ error: String(e) }, 500);
  }
});
