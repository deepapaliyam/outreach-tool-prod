import { computeStatus } from './scoring';

export const SCORE_BANDS = ['0-20', '20-40', '40-60', '60-80', '80-100+'];
function scoreBand(s) {
  if (s < 20) return '0-20';
  if (s < 40) return '20-40';
  if (s < 60) return '40-60';
  if (s < 80) return '60-80';
  return '80-100+';
}

// Single aggregation function consumed by the Insights tab AND every
// export format, so what you see on screen is exactly what gets
// exported — never two slightly-different computations to keep in sync.
export function computeInsightsData(leads, filters = {}) {
  const { industry = '', state = '', dateFrom = '', dateTo = '' } = filters;

  const inDateRange = (dateStr) => {
    if (!dateFrom && !dateTo) return true;
    if (!dateStr) return false; // a date filter is set but this lead has no date — exclude
    if (dateFrom && dateStr < dateFrom) return false;
    if (dateTo && dateStr > dateTo) return false;
    return true;
  };

  const scopedLeads = leads.filter(l => {
    if (industry && l.nic_label !== industry) return false;
    if (state && l.state !== state) return false;
    return true;
  });

  const withOutcome = scopedLeads.filter(l => l.outcome?.contacted && inDateRange(l.outcome.contacted_date));
  const clients = withOutcome.filter(l => l.outcome.materialized);

  const totalRevenue = clients.reduce((sum, l) => sum + Number(l.outcome.final_amount || l.outcome.quoted_price || 0), 0);

  const summary = {
    totalLeads: scopedLeads.length,
    totalContacted: withOutcome.length,
    totalClients: clients.length,
    totalRevenue,
    avgDealSize: clients.length ? Math.round(totalRevenue / clients.length) : 0,
  };

  const statusCounts = {};
  scopedLeads.forEach(l => {
    const label = computeStatus(l).label;
    statusCounts[label] = (statusCounts[label] || 0) + 1;
  });
  const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  const indMap = {};
  withOutcome.forEach(l => {
    const key = l.nic_label || 'Unknown';
    if (!indMap[key]) indMap[key] = { name: key, contacted: 0, replied: 0 };
    indMap[key].contacted++;
    if (l.outcome.replied) indMap[key].replied++;
  });
  const replyByIndustry = Object.values(indMap)
    .map(d => ({ name: d.name, contacted: d.contacted, replyRate: d.contacted ? Math.round((d.replied / d.contacted) * 100) : 0 }))
    .sort((a, b) => b.contacted - a.contacted)
    .slice(0, 10);

  const bandMap = {};
  SCORE_BANDS.forEach(b => bandMap[b] = { contacted: 0, replied: 0 });
  withOutcome.forEach(l => {
    const b = scoreBand(l.priority_score);
    bandMap[b].contacted++;
    if (l.outcome.replied) bandMap[b].replied++;
  });
  const replyByBand = SCORE_BANDS.map(b => ({
    name: b, contacted: bandMap[b].contacted,
    replyRate: bandMap[b].contacted ? Math.round((bandMap[b].replied / bandMap[b].contacted) * 100) : 0,
  }));

  const f = (pred) => withOutcome.filter(pred).length;
  const funnel = [
    { name: 'Contacted', value: withOutcome.length },
    { name: 'Replied', value: f(l => l.outcome.replied) },
    { name: 'Proposal sent', value: f(l => l.outcome.proposal_sent) },
    { name: 'Client', value: f(l => l.outcome.materialized) },
    { name: 'Paid', value: f(l => l.outcome.payment_received) },
  ];

  const won = withOutcome.filter(l => l.outcome.materialized && l.outcome.quoted_price);
  const lost = withOutcome.filter(l => !l.outcome.materialized && l.outcome.quoted_price && l.outcome.response_type);
  const avg = arr => arr.length ? Math.round(arr.reduce((s, l) => s + Number(l.outcome.quoted_price || 0), 0) / arr.length) : 0;
  const reasonCounts = {};
  withOutcome.filter(l => !l.outcome.materialized && l.outcome.not_proceeded_reason)
    .forEach(l => { reasonCounts[l.outcome.not_proceeded_reason] = (reasonCounts[l.outcome.not_proceeded_reason] || 0) + 1; });
  const pricing = {
    avgWonPrice: avg(won), avgLostPrice: avg(lost), wonCount: won.length, lostCount: lost.length,
    reasons: Object.entries(reasonCounts).map(([name, value]) => ({ name, value })),
  };

  const clientList = clients
    .map(l => ({
      name: l.name, industry: l.nic_label, state: l.state,
      quotedPrice: l.outcome.quoted_price || '', finalAmount: l.outcome.final_amount || '',
      contactedDate: l.outcome.contacted_date || '', paid: l.outcome.payment_received ? 'Yes' : 'No',
    }))
    .sort((a, b) => Number(b.finalAmount || b.quotedPrice || 0) - Number(a.finalAmount || a.quotedPrice || 0));

  return {
    generatedAt: new Date().toISOString(),
    filtersApplied: { industry: industry || 'All', state: state || 'All', dateFrom: dateFrom || 'Any', dateTo: dateTo || 'Any' },
    summary, statusBreakdown, replyByIndustry, replyByBand, funnel, pricing, clients: clientList,
  };
}
