// Supabase Edge Function: data for the hidden Admin tab.
//
// ONLY accounts listed in public.app_admins may use it; everyone else gets a
// plain 404, exactly as if the function did not exist. Reads run through SQL
// functions that only the service role can execute (see supabase/v7_schema.sql),
// so nothing here is reachable from an ordinary browser session.
//
// Actions (POST { action, ... }):
//   overview  -> totals, AI/search usage, error counts, latest health run, per-user table
//   events    -> recent log entries   { kind?: 'error' | 'usage' | 'health', limit?: number }
//   gmail     -> recent Gmail responses across all users { limit?: number }
//
// Deploy: npx supabase functions deploy admin

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const authed = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await authed.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Not found' }, 404);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: adminRow } = await admin.from('app_admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
    if (!adminRow) return json({ error: 'Not found' }, 404);

    const input = await req.json().catch(() => ({}));
    const limit = Math.min(500, Math.max(1, Math.floor(Number(input?.limit)) || 100));

    if (input?.action === 'overview') {
      const [overview, users] = await Promise.all([admin.rpc('admin_overview'), admin.rpc('admin_user_stats')]);
      if (overview.error) return json({ error: overview.error.message, hint: 'Has supabase/v7_schema.sql been run?' }, 500);
      return json({ overview: overview.data, users: users.data ?? [] });
    }
    if (input?.action === 'events') {
      const kind = ['error', 'usage', 'health'].includes(input?.kind) ? input.kind : '';
      const { data, error } = await admin.rpc('admin_recent_events', { kind_filter: kind, limit_n: limit });
      if (error) return json({ error: error.message }, 500);
      return json({ events: data ?? [] });
    }
    if (input?.action === 'gmail') {
      const { data, error } = await admin.rpc('admin_recent_gmail', { limit_n: limit });
      if (error) return json({ error: error.message }, 500);
      return json({ responses: data ?? [] });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
