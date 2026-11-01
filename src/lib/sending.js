import { supabase } from './supabase';
import { functionUrl } from './functionUrl';
import { callFunction } from './apiErrors';
import { signatureIsEmpty } from './signature';

// Should this email carry the saved signature? Drafts written for a signature
// end on a closing phrase only, so they need it. Older drafts already sign off
// with the sender's name, and adding the signature would repeat it.
export function signatureDefault(lead, signatureHtml) {
  return !signatureIsEmpty(signatureHtml) && lead?.draft?.signatureMode === 'auto';
}

// Calls the send-email Edge Function, which holds the Gmail refresh token
// and Google client secret server-side. The browser never sees either.
//
// options.testMode: when true (and draftOnly is false), the real lead
// address is NEVER used as the recipient — the email goes to
// testEmailOverride (or the signed-in account's own login email as a
// fallback) instead, the subject is prefixed to make that unmistakable,
// and leadId is omitted so the lead's outcome is never touched. The lead
// is still passed as logLeadId so the Gmail response is filed under it.
//
// options.draftOnly: creates the message in the user's own Gmail
// Drafts folder instead of sending it. This is safe on its own —
// nothing transmits until the user opens Gmail and sends it themselves
// — so it always uses the lead's real address regardless of test mode,
// and never marks the lead's outcome either way.
//
// The result carries Gmail's own answer in `gmail`:
//   { status, messageId, draftId, threadId, labelIds }
export async function sendViaGmail(lead, options = {}) {
  const { testMode = false, testEmailOverride = '', draftOnly = false, includeSignature = true, followUp = false, threadId = null, email = null } = options;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  // `email` replaces the lead's saved draft - used for follow-ups, which are written separately
  // and must never overwrite the first email that was saved (and locked) for insights.
  const mail = email || lead.draft;
  const realTo = mail.sendTo;
  const redirect = testMode && !draftOnly;
  const to = redirect ? (testEmailOverride || session.user.email) : realTo;
  const subject = redirect ? `[TEST — would send to ${realTo}] ${mail.subject}` : mail.subject;

  // Errors carry err.code ('daily_cap' | 'min_gap' | 'duplicate_recipient' | 'already_sent' |
  // 'followup_too_soon' | 'followup_limit' | 'gmail_reconnect' | ...) so callers can react to each differently.
  const data = await callFunction(functionUrl('send-email'), {
    token: session.access_token,
    fallback: 'Send failed',
    body: {
      leadId: redirect || draftOnly ? undefined : lead.id,
      logLeadId: lead.id,
      to,
      subject,
      body: mail.body,
      sources: mail.sources || [],
      draftOnly,
      includeSignature: !!includeSignature,
      followUp: !!followUp,
      threadId: followUp && threadId ? threadId : undefined,
    },
  });
  return { ...data, testMode: redirect, draftOnly, to, realTo };
}

// A harmless email to yourself, to see exactly how your signature looks in a
// real inbox. Goes to the signed-in account's own address, so it never counts
// toward the daily limit and never touches a lead.
export async function sendSignatureTest() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const data = await callFunction(functionUrl('send-email'), {
    token: session.access_token,
    fallback: 'Test email failed',
    body: {
      to: session.user.email,
      subject: '[TEST] How my signature looks',
      body: 'Hi there,\n\nThis is a test email from your Outreach Tool, so you can see exactly how your signature looks in a real inbox.\n\nBest regards,',
    },
  });
  return { ...data, to: session.user.email };
}
