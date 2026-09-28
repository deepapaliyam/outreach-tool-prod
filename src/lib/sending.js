import { supabase } from './supabase';
import { functionUrl } from './functionUrl';

// Calls the send-email Edge Function, which holds the Gmail refresh token
// and Google client secret server-side. The browser never sees either.
//
// options.testMode: when true (and draftOnly is false), the real lead
// address is NEVER used as the recipient — the email goes to
// testEmailOverride (or the signed-in account's own login email as a
// fallback) instead, the subject is prefixed to make that unmistakable,
// and leadId is omitted so the lead's outcome is never touched.
//
// options.draftOnly: creates the message in the user's own Gmail
// Drafts folder instead of sending it. This is safe on its own —
// nothing transmits until the user opens Gmail and sends it themselves
// — so it always uses the lead's real address regardless of test mode,
// and never marks the lead's outcome either way.
export async function sendViaGmail(lead, options = {}) {
  const { testMode = false, testEmailOverride = '', draftOnly = false } = options;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const realTo = lead.draft.sendTo;
  const redirect = testMode && !draftOnly;
  const to = redirect ? (testEmailOverride || session.user.email) : realTo;
  const subject = redirect ? `[TEST — would send to ${realTo}] ${lead.draft.subject}` : lead.draft.subject;

  const res = await fetch(functionUrl('send-email'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      leadId: redirect ? undefined : lead.id,
      to,
      subject,
      body: lead.draft.body,
      sources: lead.draft.sources || [],
      draftOnly,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Send failed');
    err.code = data.code; // 'daily_cap' | 'min_gap' | 'duplicate_recipient' — lets callers react differently
    throw err;
  }
  return { ...data, testMode: redirect, draftOnly, to, realTo };
}
