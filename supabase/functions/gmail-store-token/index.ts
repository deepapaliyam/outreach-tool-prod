// Supabase Edge Function: stores the Gmail refresh token captured right
// after the OAuth consent redirect. The caller must be signed in (their
// JWT identifies them); this function uses the service role key
// internally so it can write to gmail_connections, which has no RLS
// policy for regular users at all.
//
// Deploy: supabase functions deploy gmail-store-token

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: cors });

    // Verify the caller and get their user id, using the anon key + their JWT.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authed = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await authed.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: cors });
    }

    const { refresh_token, gmail_address } = await req.json();
    if (!refresh_token) {
      return new Response(JSON.stringify({ error: 'Missing refresh_token' }), { status: 400, headers: cors });
    }

    // Service-role client bypasses RLS to write this sensitive row.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: upsertErr } = await admin
      .from('gmail_connections')
      .upsert({ user_id: userData.user.id, refresh_token, gmail_address, connected_at: new Date().toISOString() });
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
