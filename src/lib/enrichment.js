import { supabase } from './supabase';
import { functionUrl } from './functionUrl';

// Calls enrich-lead, which does a free direct-domain check (for custom
// email domains) plus one Serper.dev search, and returns the three raw
// fields — website_status, business_listings, search_notes. This
// function does NOT write to the database or recompute the score itself;
// the caller (App.jsx) merges the result, recomputes the score via the
// same scoreLead() used everywhere else, and saves both in one write —
// so enrichment and scoring can never drift out of sync with each other.
export async function enrichLead(lead) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(functionUrl('enrich-lead'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      name: lead.name,
      district: lead.district,
      state: lead.state,
      companyEmail: lead.company_email,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Enrichment failed');
  return data; // { website_status, business_listings, search_notes }
}
