import { supabase } from './supabase';
import { functionUrl } from './functionUrl';

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
    website_status: lead.website_status || 'Unknown',
    business_listings_found: lead.business_listings || 'Not checked',
    other_verified_notes: lead.search_notes || 'None',
  };

  const res = await fetch(functionUrl('refine-selection'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      full_body: fullBody,
      selected_text: selectedText,
      instruction: instruction || '',
      lead_context: leadContext,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Rewrite failed');
  return data.replacement;
}
