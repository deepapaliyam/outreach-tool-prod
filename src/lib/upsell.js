import { supabase } from './supabase';
import { functionUrl } from './functionUrl';
import { callFunction } from './apiErrors';
import { buildDraftPayload } from './drafting';

// Ideas for what to offer a client next. Two layers:
//  1. checklistIdeas() - instant, free, and explained by the facts the tool actually holds.
//  2. generateUpsellIdeas() - on demand, written by the AI for this client, and saved.
// Neither invents facts: an idea is only as specific as the data behind it.

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|rediffmail|outlook|hotmail|live|aol|icloud|protonmail)\./i;

function emailDomain(addr) {
  const m = String(addr || '').trim().toLowerCase().match(/@([^@\s]+)$/);
  return m ? m[1] : '';
}

export function checklistIdeas(lead) {
  const f = lead && lead.web_findings;
  const out = [];
  const add = (id, type, title, why, pitch, basis) => out.push({ id, type, title, why, pitch, basis });

  add('care-plan', 'upsell', 'Monthly care plan (hosting, updates, backups, small edits)',
    'A website needs ongoing upkeep, and a retainer turns a one-off project into steady work.',
    'Offer to look after the site every month so they never have to think about updates or backups.', 'general');

  if (f) {
    const placeMatched = (f.places || []).some(p => p.name_match);
    if (!placeMatched) {
      add('gbp', 'cross-sell', 'Google Business Profile setup',
        'The web check found no Google Business result matching their name — customers searching on Google or Maps may not find them.',
        'Offer to claim and fill in their Google Business Profile so they show up on Maps with hours, photos and a phone number.', 'lead');
    }
    const listingMatched = (f.listings || []).some(l => l.name_match);
    if (!listingMatched) {
      add('listings', 'cross-sell', 'Business directory listings',
        'No directory listing matching their name turned up in the web check.',
        'Offer to list them on the directories their customers use, with consistent name, address and phone.', 'lead');
    }
  }

  if (FREE_MAIL.test(emailDomain(lead && lead.company_email))) {
    add('domain-email', 'cross-sell', 'Professional email on their own domain',
      `Their company email is on a free service (${emailDomain(lead.company_email)}), which looks less established than name@theirbusiness.com.`,
      'Offer to set up email addresses on their own domain now that they have a website.', 'email');
  }

  add('seo', 'upsell', 'Search basics and a short monthly report',
    'A new site does best when search engines can read it and someone checks how many visitors it gets.',
    'Offer a light monthly check-up: what people searched, which pages they visited, and one improvement to make.', 'general');

  return out;
}

export async function generateUpsellIdeas(lead, sender) {
  const { payload } = buildDraftPayload(lead, sender);
  const o = lead.outcome || {};
  const body = {
    mode: 'upsell',
    business_name: payload.business_name,
    entity_type: payload.entity_type,
    industry: payload.industry,
    location: payload.location,
    website_status: payload.website_status,
    business_listings_found: payload.business_listings_found,
    web_check: payload.web_check,
    company_email_is_free_mail: FREE_MAIL.test(emailDomain(lead.company_email)),
    sender_name: payload.sender_name,
    sender_company: payload.sender_company,
    sender_business_info: payload.sender_business_info,
    sender_offer: payload.sender_offer,
    reference_notes: payload.reference_notes,
    client: {
      notes: o.notes || 'None',
      quoted_price: o.quoted_price || 'Unknown',
      final_amount: o.final_amount || 'Unknown',
      payment_received: !!o.payment_received,
      client_since: o.updated_at ? String(o.updated_at).slice(0, 10) : 'Unknown',
    },
  };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const data = await callFunction(functionUrl('draft'), { token: session.access_token, body, fallback: 'Could not get ideas' });
  return { ideas: data.ideas || [], generatedAt: data.generatedAt || new Date().toISOString() };
}
