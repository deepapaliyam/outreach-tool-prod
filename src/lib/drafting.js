import { recommendContact } from './scoring';
import { supabase } from './supabase';
import { functionUrl } from './functionUrl';
import { callFunction } from './apiErrors';
import { buildWebCheckForDraft, websiteStatusForDraft } from './webcheck';
import { signatureIsEmpty } from './signature';

// The browser NEVER calls Anthropic directly (that would expose your API key).
// It calls your own serverless function, which holds the key.
// See supabase/functions/draft/ (Edge Function).

// The facts about the lead and the sender that every kind of writing (first email,
// follow-up) starts from. Kept in one place so they can never drift apart.
export function buildDraftPayload(lead, sender) {
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

  return {
    sendTo,
    payload: {
      business_name: lead.name,
      entity_type: lead.entity_type,
      industry: lead.nic_label,
      location: [lead.district, lead.state].filter(Boolean).join(', '),
      website_status: websiteStatusForDraft(lead),
      business_listings_found: lead.business_listings || 'Not checked',
      other_verified_notes: lead.search_notes || 'None',
      web_check: buildWebCheckForDraft(lead),
      recommended_send_to: sendTo,
      recommended_salutation: salutation,
      sender_name: sender.name || 'Your name',
      sender_title: sender.title || '',
      sender_company: sender.company || '',
      sender_business_info: sender.businessInfo || '',
      sender_offer: sender.offer || 'website design & development services',
      // With a saved signature the email adds name, title and links itself, so the
      // draft should end on a closing phrase only. Without one it signs off by name.
      signature_mode: signatureIsEmpty(sender.signatureHtml) ? 'in_body' : 'auto',
      voice_profile: voiceProfile,
      reference_notes: referenceNotes,
    },
  };
}

export async function generateDraft(lead, sender) {
  const { sendTo, payload } = buildDraftPayload(lead, sender);

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const data = await callFunction(functionUrl('draft'), { token: session.access_token, body: payload, fallback: 'Draft request failed' });
  // signatureMode is remembered so the app can warn if the signature is later removed.
  return { ...data, sendTo, signatureMode: payload.signature_mode }; // { subject, body, evaluation[], generatedAt, sendTo, signatureMode }
}
