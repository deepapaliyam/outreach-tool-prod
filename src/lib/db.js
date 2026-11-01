import { supabase } from './supabase';

// All database access lives here so the UI never talks to Supabase directly.
// Every function assumes the user is signed in; RLS enforces per-user scoping
// server-side, but we also set user_id explicitly on writes.

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

// --- LEADS ----------------------------------------------------------------

export async function fetchLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('priority_score', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Insert only leads whose entity_id isn't already stored for this user.
// Returns { inserted, skipped }.
export async function upsertNewLeads(scoredLeads) {
  const userId = await currentUserId();
  if (!userId) throw new Error('Not signed in');

  const entityIds = scoredLeads.map(l => l.entity_id);
  const { data: existing, error: exErr } = await supabase
    .from('leads')
    .select('entity_id')
    .in('entity_id', entityIds);
  if (exErr) throw exErr;

  const have = new Set((existing ?? []).map(r => r.entity_id));
  const toInsert = scoredLeads
    .filter(l => !have.has(l.entity_id))
    .map(l => ({ ...l, user_id: userId }));

  if (toInsert.length) {
    const { error } = await supabase.from('leads').insert(toInsert);
    if (error) throw error;
  }
  return { inserted: toInsert.length, skipped: scoredLeads.length - toInsert.length };
}

export async function updateLeadDraft(leadId, draft) {
  const { error } = await supabase.from('leads').update({ draft }).eq('id', leadId);
  if (error) throw error;
}

// Persists a fresh score computation (e.g. after changing preferred
// regions) onto an already-saved lead. Scoring normally happens once,
// at upload time, and is never revisited automatically — this is the
// explicit "apply my new preference retroactively" action.
export async function updateLeadScore(leadId, scoreFields) {
  const { error } = await supabase.from('leads').update(scoreFields).eq('id', leadId);
  if (error) throw error;
}

// Bulk version of the above — updates many leads' scores in a handful of
// requests instead of one network round-trip per lead. Each row must
// include id (the upsert conflict target) plus the NOT NULL columns
// (user_id, entity_id, name) so Postgres's upsert validates even though
// every one of these ids already exists and only the UPDATE branch ever
// actually runs — columns not included here (like `draft`) are left
// untouched, not cleared.
export async function bulkUpdateLeadScores(leads, scoreFieldsByLeadId) {
  const userId = await currentUserId();
  if (!userId) throw new Error('Not signed in');
  const CHUNK = 300;
  for (let i = 0; i < leads.length; i += CHUNK) {
    const chunk = leads.slice(i, i + CHUNK).map(l => ({
      id: l.id,
      user_id: userId,
      entity_id: l.entity_id,
      name: l.name,
      ...scoreFieldsByLeadId(l),
    }));
    const { error } = await supabase.from('leads').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }
}

// --- OUTCOMES -------------------------------------------------------------

export async function fetchOutcomes() {
  const { data, error } = await supabase.from('outcomes').select('*');
  if (error) throw error;
  return data ?? [];
}

// Create or update the single outcome row for a lead.
export async function saveOutcome(leadId, outcome) {
  const userId = await currentUserId();
  if (!userId) throw new Error('Not signed in');
  const row = { ...outcome, lead_id: leadId, user_id: userId, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('outcomes')
    .upsert(row, { onConflict: 'user_id,lead_id' });
  if (error) throw error;
}

// Joined view for the Insights tab.
export async function fetchContactedLeads() {
  const { data, error } = await supabase.from('contacted_leads').select('*');
  if (error) throw error;
  return data ?? [];
}

// --- SENDER PROFILE (voice/tone/reference links) ---------------------------

export async function fetchSenderProfile() {
  const { data, error } = await supabase.from('sender_profiles').select('*').maybeSingle();
  if (error) throw error;
  return data; // null if never saved yet
}

export async function saveSenderProfile(profile) {
  const userId = await currentUserId();
  if (!userId) throw new Error('Not signed in');
  const row = { ...profile, user_id: userId, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('sender_profiles').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
}

// Real outreach sends in the last rolling 24 hours (RLS returns only this
// user's rows). Read-only from the browser — the send-email function is
// the only thing that can write to gmail_send_log.
export async function fetchSendStats() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('gmail_send_log')
    .select('sent_at')
    .gte('sent_at', since)
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return { count: (data || []).length, lastSentAt: data && data[0] ? data[0].sent_at : null };
}

// --- ADMIN FLAG --------------------------------------------------------------
// A user can read only their OWN row of app_admins (row-level security), so
// this answers "am I an administrator?" and nothing more. If the table does
// not exist yet (v7_schema.sql not run) the answer is simply "no".
export async function fetchIsAdmin() {
  try {
    const { data, error } = await supabase.from('app_admins').select('user_id').maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

// --- GMAIL RESPONSES (own rows only) ---------------------------------------------
export async function fetchGmailResponses(limit = 100) {
  const { data, error } = await supabase
    .from('gmail_responses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// --- SIGNATURE LOGO ----------------------------------------------------------------
// Uploads to the public signature-assets bucket, inside the user's own folder
// (the bucket policy refuses anything else). Public because the recipient's mail
// app has to be able to load the picture.
export const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
export const LOGO_MAX_BYTES = 512 * 1024;

export function checkLogoFile(file) {
  if (!file) return 'Choose an image first.';
  if (!LOGO_TYPES[file.type]) return 'Use a PNG, JPG, GIF or WebP image.';
  if (file.size > LOGO_MAX_BYTES) return `That image is ${Math.round(file.size / 1024)} KB. Please use one under 512 KB (a logo around 400 px wide is plenty).`;
  return '';
}

export async function uploadSignatureLogo(file) {
  const problem = checkLogoFile(file);
  if (problem) throw new Error(problem);
  const userId = await currentUserId();
  if (!userId) throw new Error('Not signed in');
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${Date.now()}-${rand}.${LOGO_TYPES[file.type]}`;
  const { error } = await supabase.storage.from('signature-assets').upload(path, file, {
    contentType: file.type, cacheControl: '31536000', upsert: false,
  });
  if (error) {
    const hint = /bucket.*not found/i.test(error.message) ? ' (Has supabase/v7_schema.sql been run?)' : '';
    throw new Error('Could not upload the logo: ' + error.message + hint);
  }
  const { data } = supabase.storage.from('signature-assets').getPublicUrl(path);
  return data.publicUrl;
}
