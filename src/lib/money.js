// Rupee amounts are typed by hand ("12,000", "₹15000"), so they are read forgivingly.
export const rupee = (v) => {
  if (v === '' || v == null) return '—';
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : String(v);
};
export const num = (v) => { const n = Number(String(v ?? '').replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
