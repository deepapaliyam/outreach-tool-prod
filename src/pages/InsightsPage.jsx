import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Download } from 'lucide-react';
import { PageHeader, StatCard, Empty, Spinner, ChartCard } from '../components/ui';

// One accent for every chart: each shows a single series, so a single colour
// is correct (colour never has to tell two things apart). Grid lines are
// solid hairlines; marks are thin with rounded data-ends.
const BRAND = '#5047D8';
const GRID = '#EFEDE6';
const TICK = { fontSize: 12, fill: '#555B6A' };
const rupee = (v) => (v ? `₹${Number(v).toLocaleString('en-IN')}` : '—');

function Tip({ active, payload, label, unit = '', noun }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: '#fff', border: '1px solid #E6E4DC', borderRadius: 8, padding: '8px 10px', fontSize: 12, boxShadow: '0 4px 14px rgba(20,22,40,.1)' }}>
      <div style={{ fontWeight: 600 }}>{label ?? p.payload.name ?? p.payload.status}</div>
      <div>{noun || p.name}: <b>{p.value}{unit}</b>{p.payload.contacted != null ? ` · ${p.payload.contacted} contacted` : ''}</div>
    </div>
  );
}

function HBars({ data, nameKey, valueKey, unit = '', height = 240, nameWidth = 110, noun }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} unit={unit} />
        <YAxis dataKey={nameKey} type="category" tick={TICK} width={nameWidth} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: '#F6F5F1' }} content={<Tip unit={unit} noun={noun} />} />
        <Bar dataKey={valueKey} fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey={valueKey} position="right" formatter={v => `${v}${unit}`} style={{ fontSize: 12, fill: '#1A1D26' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function InsightsPage({ ctl }) {
  const { leads, insightsReady, withOutcomeCount, insightsData: d, insightsFilters, setInsightsFilters, industries, states, runExport, exportingFormat } = ctl;
  const filtersOn = insightsFilters.industry || insightsFilters.state || insightsFilters.dateFrom || insightsFilters.dateTo;
  const exportBtn = (fmt, label) => (
    <button key={fmt} className="btn sm" disabled={exportingFormat === fmt} onClick={() => runExport(fmt)}>
      {exportingFormat === fmt ? <Spinner size={13} /> : <Download size={13} />} {label}
    </button>
  );

  if (!insightsReady) {
    return (
      <>
        <PageHeader title="Insights" sub="See what's working, where to focus and which offers turn into paid projects." />
        <div className="card"><Empty title={`${withOutcomeCount} outcome${withOutcomeCount === 1 ? '' : 's'} logged so far`}
          sub="Log at least 3 contacted leads with outcomes to unlock patterns — reply rate by industry and score band, a funnel, client list, and what pricing works." /></div>
      </>
    );
  }

  const replied = d.funnel.find(f => f.name === 'Replied')?.value || 0;
  const industryRows = d.replyByIndustry.map(r => ({ ...r, name: r.name.length > 24 ? r.name.slice(0, 22) + '…' : r.name }));
  const funnelBase = d.funnel[0]?.value || 0;
  const funnelRows = d.funnel.map(f => ({ ...f, pct: funnelBase ? Math.round((f.value / funnelBase) * 100) : 0 }));

  return (
    <>
      <PageHeader title="Insights" sub="See what's working, where to focus and which offers turn into paid projects.">
        {exportBtn('xlsx', 'Excel')}{exportBtn('pdf', 'PDF')}{exportBtn('pptx', 'PowerPoint')}{exportBtn('docx', 'Word')}
      </PageHeader>

      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="row">
          <select style={{ width: 'auto' }} aria-label="Industry" value={insightsFilters.industry} onChange={e => setInsightsFilters(f => ({ ...f, industry: e.target.value }))}>
            <option value="">All industries</option>{industries.map(i => <option key={i} value={i}>{i.length > 40 ? i.slice(0, 38) + '…' : i}</option>)}
          </select>
          <select style={{ width: 'auto' }} aria-label="State" value={insightsFilters.state} onChange={e => setInsightsFilters(f => ({ ...f, state: e.target.value }))}>
            <option value="">All states</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="small row" style={{ gap: 6 }}>From <input type="date" style={{ width: 'auto' }} value={insightsFilters.dateFrom} onChange={e => setInsightsFilters(f => ({ ...f, dateFrom: e.target.value }))} /></label>
          <label className="small row" style={{ gap: 6 }}>To <input type="date" style={{ width: 'auto' }} value={insightsFilters.dateTo} onChange={e => setInsightsFilters(f => ({ ...f, dateTo: e.target.value }))} /></label>
          {filtersOn && <button className="btn sm" onClick={() => setInsightsFilters({ industry: '', state: '', dateFrom: '', dateTo: '' })}>Clear</button>}
        </div>
        <p className="hint">“Saved leads” follows the industry and state filters only — the date range narrows contacted, client and revenue figures, since leads themselves have no activity date.</p>
      </div>

      <div className="grid g-5 mt16">
        <StatCard label="Saved leads" value={d.summary.totalLeads} sub={`${leads.length} in total`} />
        <StatCard label="Contacted" value={d.summary.totalContacted} sub="in the selected range" />
        <StatCard label="Replies received" value={replied} sub={`${d.summary.totalContacted ? Math.round((replied / d.summary.totalContacted) * 100) : 0}% reply rate`} />
        <StatCard label="Clients won" value={d.summary.totalClients} sub="in the selected range" />
        <StatCard label="Client revenue" value={`₹${Number(d.summary.totalRevenue).toLocaleString('en-IN')}`} brand sub={`${d.summary.avgDealSize ? `₹${Number(d.summary.avgDealSize).toLocaleString('en-IN')} average deal` : 'no deals yet'}`} />
      </div>

      <div className="grid g-2 mt16">
        <ChartCard title="Status breakdown" sub={`Where your ${d.summary.totalLeads} saved leads stand`}
          rows={d.statusBreakdown} columns={[{ key: 'status', label: 'Status' }, { key: 'count', label: 'Leads' }]}
          summary={`Status breakdown: ${d.statusBreakdown.map(s => `${s.status} ${s.count}`).join(', ')}`}>
          <HBars data={[...d.statusBreakdown].sort((a, b) => b.count - a.count)} nameKey="status" valueKey="count" noun="Leads" height={Math.max(180, d.statusBreakdown.length * 34 + 20)} />
        </ChartCard>

        <ChartCard title="Reply rate by industry" sub="Replies ÷ contacted leads, most-contacted industries first"
          rows={d.replyByIndustry} columns={[{ key: 'name', label: 'Industry' }, { key: 'contacted', label: 'Contacted' }, { key: 'replyRate', label: 'Reply rate', format: v => `${v}%` }]}
          summary={`Reply rate by industry: ${d.replyByIndustry.map(r => `${r.name} ${r.replyRate}%`).join(', ')}`}>
          <HBars data={industryRows} nameKey="name" valueKey="replyRate" unit="%" noun="Reply rate" nameWidth={150} height={Math.max(180, industryRows.length * 34 + 20)} />
        </ChartCard>

        <ChartCard title="Reply rate by priority band" sub="Does the score actually predict a reply?"
          rows={d.replyByBand} columns={[{ key: 'name', label: 'Score band' }, { key: 'contacted', label: 'Contacted' }, { key: 'replyRate', label: 'Reply rate', format: v => `${v}%` }]}
          summary={`Reply rate by score band: ${d.replyByBand.map(r => `${r.name} ${r.replyRate}%`).join(', ')}`}>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.replyByBand} margin={{ top: 22, right: 8, left: -14, bottom: 4 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis tick={TICK} unit="%" axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#F6F5F1' }} content={<Tip unit="%" noun="Reply rate" />} />
              <Bar dataKey="replyRate" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={44}>
                <LabelList dataKey="replyRate" position="top" formatter={v => `${v}%`} style={{ fontSize: 12, fill: '#1A1D26' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conversion funnel" sub="Contacted leads, stage by stage"
          rows={funnelRows} columns={[{ key: 'name', label: 'Stage' }, { key: 'value', label: 'Leads' }, { key: 'pct', label: 'Of contacted', format: v => `${v}%` }]}
          summary={`Funnel: ${d.funnel.map(f => `${f.name} ${f.value}`).join(', ')}`}>
          <HBars data={d.funnel} nameKey="name" valueKey="value" noun="Leads" height={230} nameWidth={100} />
          <p className="hint">{funnelBase ? `${d.funnel[3].value} of ${funnelBase} contacted leads became clients (${Math.round((d.funnel[3].value / funnelBase) * 100)}%).` : ''}</p>
        </ChartCard>
      </div>

      <div className="card mt16">
        <h3 className="card-title">Pricing — what tends to work</h3>
        <div className="grid g-2 mt12">
          <div>
            <div className="row" style={{ gap: 32 }}>
              <div><div className="stat-n">{rupee(d.pricing.avgWonPrice)}</div><div className="stat-sub">average quote, won ({d.pricing.wonCount})</div></div>
              <div><div className="stat-n">{rupee(d.pricing.avgLostPrice)}</div><div className="stat-sub">average quote, not proceeded ({d.pricing.lostCount})</div></div>
            </div>
          </div>
          <div>
            <div className="sec-h">Reasons deals didn't proceed</div>
            {d.pricing.reasons.length === 0 ? <p className="hint">No reasons logged yet.</p> : (
              <HBars data={[...d.pricing.reasons].sort((a, b) => b.value - a.value)} nameKey="name" valueKey="value" noun="Deals" height={Math.max(120, d.pricing.reasons.length * 34 + 20)} nameWidth={140} />
            )}
          </div>
        </div>
      </div>

      <div className="card flush mt16">
        <div className="card-pad"><h3 className="card-title">Clients ({d.clients.length})</h3></div>
        {d.clients.length === 0 ? <Empty title="No clients yet in this range" sub="Mark a lead's outcome as converted to see it here." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Business</th><th>Industry</th><th>State</th><th>Quoted</th><th>Final</th><th>Contacted</th><th>Paid</th></tr></thead>
              <tbody>
                {d.clients.map((c, i) => (
                  <tr key={i}>
                    <td className="biz">{c.name}</td>
                    <td className="dim">{c.industry && c.industry.length > 28 ? c.industry.slice(0, 26) + '…' : c.industry}</td>
                    <td className="dim">{c.state}</td>
                    <td className="mono small">{c.quotedPrice ? `₹${c.quotedPrice}` : '—'}</td>
                    <td className="mono small">{c.finalAmount ? `₹${c.finalAmount}` : '—'}</td>
                    <td className="dim">{c.contactedDate}</td>
                    <td>{c.paid === 'Yes' ? <span className="tag ok">Paid</span> : <span className="faint">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
