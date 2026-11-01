import { supabase } from './supabase';
import { functionUrl } from './functionUrl';
import { callFunction } from './apiErrors';

// Asks the health-check Edge Function to test every outside service the
// tool depends on. Returns { checkedAt, ok, checks: [{id,label,status,message}] }.
export async function runServiceCheck() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return callFunction(functionUrl('health-check'), {
    token: session.access_token,
    body: {},
    fallback: 'Service check failed',
  });
}

// "All working" / "2 need attention" / "1 to look at" — one line for the header chip.
export function summarizeChecks(checks) {
  const fails = checks.filter(c => c.status === 'fail').length;
  const warns = checks.filter(c => c.status === 'warn').length;
  if (fails) return { tone: 'fail', text: `${fails} need${fails === 1 ? 's' : ''} fixing` };
  if (warns) return { tone: 'warn', text: `${warns} to look at` };
  return { tone: 'ok', text: 'All services working' };
}
