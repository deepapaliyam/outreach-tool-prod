import { supabase } from './supabase';
import { functionUrl } from './functionUrl';
import { callFunction } from './apiErrors';
import { buildDraftPayload } from './drafting';
import { followUpAddress, DAY_MS } from './sent';

// A follow-up is written by the same `draft` function as a first email, in
// "followup" mode: shorter, aware of the earlier email, and honest about
// anything the live web check just found. The earlier email stays exactly as it
// was sent — the follow-up is its own piece of text with its own history.

export function replySubject(original) {
  const s = String(original || '').trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export async function generateFollowUp(lead, sender, { facts, number, recheck = null, now = Date.now() }) {
  const { payload } = buildDraftPayload(lead, sender);
  const sendTo = followUpAddress(lead);
  const sentOn = facts.firstAt != null ? new Date(facts.firstAt).toISOString().slice(0, 10) : '';
  const body = {
    ...payload,
    mode: 'followup',
    recommended_send_to: sendTo,
    followup_number: number,
    previous_email: {
      subject: facts.subject,
      body: facts.body,
      sent_on: sentOn,
      days_since: facts.lastAt != null ? Math.max(0, Math.floor((now - facts.lastAt) / DAY_MS)) : null,
    },
    live_check_changes: recheck
      ? { checked_now: true, changed: !!recheck.changed, new_findings: recheck.findings || [] }
      : { checked_now: false, changed: false, new_findings: [] },
  };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const data = await callFunction(functionUrl('draft'), { token: session.access_token, body, fallback: 'Follow-up request failed' });
  return {
    ...data,
    subject: replySubject(facts.subject),   // always "Re: <the first subject>", whatever the model returned
    sendTo,
    number,
    signatureMode: payload.signature_mode,
    sources: data.sources || [],
  };
}
