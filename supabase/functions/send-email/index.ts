// Supabase Edge Function: sends an email through the user's own Gmail,
// using the refresh token captured at connect-time. Never exposes the
// token to the browser — it's read here with the service role key only.
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

function base64url(input: string) {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: cors });
    }

    const { leadId, to, subject, body, sources } = await req.json();
    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Missing to/subject/body' }), { status: 400, headers: cors });
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: conn, error: connErr } = await admin
      .from('gmail_connections')
      .select('refresh_token, gmail_address')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!conn) {
      return new Response(JSON.stringify({ error: 'Gmail not connected yet' }), { status: 400, headers: cors });
    }

    const accessToken = await refreshAccessToken(conn.refresh_token);

    const mime = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ].join('\r\n');

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: base64url(mime) }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok) throw new Error('Gmail send failed: ' + JSON.stringify(sendData));

    // Mark the outcome as contacted + sent via Gmail, if a leadId was given.
    if (leadId) {
      await admin.from('outcomes').upsert(
        { lead_id: leadId, user_id: userData.user.id, contacted: true, contacted_date: new Date().toISOString().slice(0, 10), sent_via_gmail: true, sent_subject: subject, sent_body: body, sent_sources: sources || [], updated_at: new Date().toISOString() },
        { onConflict: 'user_id,lead_id' }
      );
    }

    return new Response(JSON.stringify({ ok: true, gmailMessageId: sendData.id }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
