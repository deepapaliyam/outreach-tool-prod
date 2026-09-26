import { supabase } from './supabase';
import { functionUrl } from './functionUrl';

// Calls the send-email Edge Function, which holds the Gmail refresh token
// and Google client secret server-side. The browser never sees either.
export async function sendViaGmail(lead) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(functionUrl('send-email'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      leadId: lead.id,
      to: lead.draft.sendTo,
      subject: lead.draft.subject,
      body: lead.draft.body,
      sources: lead.draft.sources || [],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Send failed');
  return data;
}
