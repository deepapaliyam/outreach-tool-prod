import { supabase } from './supabase';
import { functionUrl } from './functionUrl';

// Calls enrich-lead, which checks the lead's company-email domain (free)
// and runs one Google search at the same time, and returns the evidence:
//   { website_status, business_listings, web_findings }
// It does NOT write to the database or re-score. The caller merges the
// result, re-scores with the same scoreLead() used everywhere, and saves
// everything in one write — so the check and the score can't drift apart.
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Web check failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Several leads are checked in parallel, so a burst can hit the search
// provider's rate limit. Rate limits (429), server hiccups (5xx) and
// dropped connections are retried with a growing pause; anything else
// (bad API key, bad request) fails straight away so it isn't repeated
// hundreds of times.
export async function enrichLeadWithRetry(lead, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await enrichLead(lead);
    } catch (e) {
      lastErr = e;
      const retryable = e.status === 429 || e.status >= 500 || e.name === 'TypeError';
      if (!retryable || i === attempts - 1) break;
      await new Promise(r => setTimeout(r, 1500 * (i + 1) * (i + 1)));
    }
  }
  throw lastErr;
}
