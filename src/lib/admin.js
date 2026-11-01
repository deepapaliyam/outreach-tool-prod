import { supabase } from './supabase';
import { functionUrl } from './functionUrl';
import { callFunction } from './apiErrors';

// Everything here is for the hidden Admin tab. The admin Edge Function
// answers a plain "Not found" to anyone who is not on the admin list, so even
// someone who opened this code in their browser's developer tools gets nothing.
async function callAdmin(action, params = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return callFunction(functionUrl('admin'), {
    token: session.access_token,
    body: { action, ...params },
    fallback: 'Admin request failed',
  });
}

export const loadAdminOverview = () => callAdmin('overview');                       // { overview, users }
export const loadAdminEvents = (kind = '', limit = 100) => callAdmin('events', { kind, limit });   // { events }
export const loadAdminGmail = (limit = 100) => callAdmin('gmail', { limit });       // { responses }
