import { supabase } from './supabase';
import { functionUrl } from './functionUrl';

// Calls fetch-references, which does the actual URL fetch + text
// extraction server-side (this app runs as a real backend now, unlike
// the earlier browser-only prototype, so this works without any CORS
// issue). Meant to be called once when the sender saves/updates their
// reference links — NOT on every draft — the result is cached by the
// caller into sender_profiles.reference_notes.
export async function fetchReferences(urls) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(functionUrl('fetch-references'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ urls }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not fetch references');
  return data.references; // [{url, text, error?}]
}
