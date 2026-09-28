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
// three and are not logged.
//
// Secrets needed (set once):
//   supabase secrets set GOOGLE_CLIENT_ID=...
//   supabase secrets set GOOGLE_CLIENT_SECRET=...
// Deploy: supabase functions deploy send-email

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
}
interface GuardResult {
  allowed: boolean;
  status?: number;
  code?: 'daily_cap' | 'min_gap' | 'duplicate_recipient';
  error?: string;
}

function evaluateSendGuard(i: GuardInput): GuardResult {
  if (i.exempt) return { allowed: true };

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

  // 3. Same recipient contacted recently.
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
  const data = await res.json();
  if (!data.access_token) throw new Error('Could not refresh Google access token: ' + JSON.stringify(data));
  return data.access_token as string;
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
    const uid = userData.user.id;

    const { leadId, to, subject, body, sources, draftOnly } = await req.json();
    if (!to || !subject || !body) return json({ error: 'Missing to/subject/body' }, 400);

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: conn, error: connErr } = await admin
      .from('gmail_connections')
      .select('refresh_token, gmail_address')
      .eq('user_id', uid)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!conn) return json({ error: 'Gmail not connected yet' }, 400);

    // ---- Send safety: gather what the guard needs, then decide ----
    const toNorm = String(to).trim().toLowerCase();
    let exempt = !!draftOnly;
    let cap = DEFAULT_DAILY_CAP;
    let recent: Array<{ sent_at: string }> = [];
    let priorSame: { sent_at: string } | null = null;

    if (!draftOnly) {
      const { data: profile } = await admin
        .from('sender_profiles')
        .select('daily_send_cap, test_email')
        .eq('user_id', uid)
        .maybeSingle();
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
      }
    }

    const decision = evaluateSendGuard({ now: Date.now(), exempt, cap, sentLast24h: recent, priorToSameAddress: priorSame, to: toNorm });
    if (!decision.allowed) return json({ error: decision.error, code: decision.code }, decision.status ?? 429);

    // ---- Build and send (or draft) the message ----
    const accessToken = await refreshAccessToken(conn.refresh_token);

    const mime = [
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ].join('\r\n');
    const raw = bytesToBase64Url(new TextEncoder().encode(mime));

    // draftOnly: create it in the user's own Gmail Drafts folder instead of
    // sending — nothing is transmitted until they send it from Gmail.
    const endpoint = draftOnly
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
      : 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    const payload = draftOnly ? { message: { raw } } : { raw };

    const sendRes = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok) throw new Error(`Gmail ${draftOnly ? 'draft creation' : 'send'} failed: ` + JSON.stringify(sendData));

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
    if (leadId && !draftOnly) {
      await admin.from('outcomes').upsert(
        { lead_id: leadId, user_id: uid, contacted: true, contacted_date: new Date().toISOString().slice(0, 10), sent_via_gmail: true, sent_subject: subject, sent_body: body, sent_sources: sources || [], updated_at: new Date().toISOString() },
        { onConflict: 'user_id,lead_id' }
      );
    }

    return json({ ok: true, draftOnly: !!draftOnly, gmailMessageId: sendData.id || sendData.message?.id, counted: !exempt, sendsLast24h, cap });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
