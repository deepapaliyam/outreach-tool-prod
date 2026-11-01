import { supabase } from './supabase';
import { functionUrl } from './functionUrl';
import { callFunction } from './apiErrors';
import { buildWebCheckForDraft, websiteStatusForDraft } from './webcheck';

// Rewrites just one selected snippet of a draft body via the
// refine-selection Edge Function, grounded in the same lead facts the
// full draft used. Returns the plain replacement text to splice in.
export async function refineSelection({ fullBody, selectedText, instruction, lead }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const leadContext = {
    business_name: lead.name,
    industry: lead.nic_label,
    location: [lead.district, lead.state].filter(Boolean).join(', '),
    website_status: websiteStatusForDraft(lead),
    business_listings_found: lead.business_listings || 'Not checked',
    other_verified_notes: lead.search_notes || 'None',
    web_check: buildWebCheckForDraft(lead),
  };

  const data = await callFunction(functionUrl('refine-selection'), {
    token: session.access_token,
    fallback: 'Rewrite failed',
    body: {
      full_body: fullBody,
      selected_text: selectedText,
      instruction: instruction || '',
      lead_context: leadContext,
    },
  });
  return data.replacement;
}
