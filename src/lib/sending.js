import { supabase } from './supabase';
import { functionUrl } from './functionUrl';

// Calls the send-email Edge Function, which holds the Gmail refresh token
// and Google client secret server-side. The browser never sees either.
//
// options.testMode: when true, the real lead address is NEVER used as
// the recipient — the email goes to testEmailOverride (or the signed-in
// account's own login email as a fallback) instead, the subject is
// prefixed to make that unmistakable in the inbox, and leadId is
// omitted from the request so the lead's outcome is never touched —
// a test send must never look like a real one in Track Outcomes/Insights.
export async function sendViaGmail(lead, options = {}) {
  const { testMode = false, testEmailOverride = '' } = options;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const realTo = lead.draft.sendTo;
  const to = testMode ? (testEmailOverride || session.user.email) : realTo;
  const subject = testMode ? `[TEST — would send to ${realTo}] ${lead.draft.subject}` : lead.draft.subject;

  const res = await fetch(functionUrl('send-email'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      leadId: testMode ? undefined : lead.id,
      to,
      subject,
      body: lead.draft.body,
      sources: lead.draft.sources || [],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Send failed');
  return { ...data, testMode, to, realTo };
}
