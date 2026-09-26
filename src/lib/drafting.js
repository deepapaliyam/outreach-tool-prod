import { recommendContact } from './scoring';
import { supabase } from './supabase';
import { functionUrl } from './functionUrl';

// The browser NEVER calls Anthropic directly (that would expose your API key).
// It calls your own serverless function, which holds the key.
// See supabase/functions/draft/ (Edge Function).

export async function generateDraft(lead, sender) {
  const contact = recommendContact(lead);
  const sendTo = contact.primary ? contact.primary.addr : (contact.fallback ? contact.fallback.addr : '');
  const salutation = contact.primary
    ? `Hi ${lead.name} team,`
    : (contact.fallback && contact.fallback.verified ? `Hi ${lead.stakeholder_name},` : `Hi ${lead.name} team,`);

  let voiceProfile = sender.tone || 'Not specified — use a warm, professional default';
  if (sender.voiceSample && sender.voiceSample.trim()) {
    voiceProfile += `\n\nWrite in a style similar to this sample the sender provided:\n"""${sender.voiceSample.trim()}"""`;
  }

  const refs = (sender.referenceNotes || []).filter(r => r.text);
  const referenceNotes = refs.length
    ? refs.map(r => `Source: ${r.url}\n${r.text}`).join('\n\n')
    : 'None';

  const payload = {
    business_name: lead.name,
    entity_type: lead.entity_type,
    industry: lead.nic_label,
    location: [lead.district, lead.state].filter(Boolean).join(', '),
    website_status: lead.website_status || 'Unknown',
    business_listings_found: lead.business_listings || 'Not checked',
    other_verified_notes: lead.search_notes || 'None',
    recommended_send_to: sendTo,
    recommended_salutation: salutation,
    sender_name: sender.name || 'Your name',
    sender_offer: sender.offer || 'website design & development services',
    voice_profile: voiceProfile,
    reference_notes: referenceNotes,
  };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(functionUrl('draft'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Draft request failed: ${res.status}`);
  const data = await res.json();
  return { ...data, sendTo }; // { subject, body, evaluation[], generatedAt, sendTo }
}
