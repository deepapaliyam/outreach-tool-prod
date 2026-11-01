// What Gmail answered, shown to the user in plain words.

export const KIND_LABEL = { send: 'Sent', test: 'Test send', draft: 'Gmail draft' };

export function describeResponse(r) {
  if (!r) return '';
  if (r.ok) {
    if (r.kind === 'draft') return 'Gmail saved it to your Drafts folder.';
    if (r.kind === 'test') return 'Gmail accepted the test email.';
    return 'Gmail accepted the email for delivery.';
  }
  return r.error_message || 'Gmail did not accept the email.';
}

export function shortId(id) {
  const s = String(id || '');
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

// Latest response per lead, for the outcome panel.
export function latestByLead(rows) {
  const map = new Map();
  (rows || []).forEach(r => {
    if (!r.lead_id) return;
    const cur = map.get(r.lead_id);
    if (!cur || r.created_at > cur.created_at) map.set(r.lead_id, r);
  });
  return map;
}
