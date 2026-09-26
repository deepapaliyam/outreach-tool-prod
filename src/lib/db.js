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
