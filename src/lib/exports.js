import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import pptxgen from 'pptxgenjs';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType } from 'docx';

// All four functions take the SAME `data` object shape produced by
// computeInsightsData() (see insights.js), so what's on screen and what
// gets exported can never silently drift apart.
//
// Deliberate scope for this round: data tables only, no embedded chart
// images. Capturing the on-screen recharts SVGs as images (via
// html2canvas or similar) is a real, addable enhancement, but it's the
// one part of this feature that can't be fully verified without a live
// browser — kept out for now rather than shipped unverified.

const filtersLine = (f) => `Industry: ${f.industry} · State: ${f.state} · Date range: ${f.dateFrom} to ${f.dateTo}`;
const fname = (ext) => `outreach-insights-${new Date().toISOString().slice(0, 10)}.${ext}`;

// --- EXCEL ------------------------------------------------------------

export function exportInsightsXLSX(data) {
  const wb = XLSX.utils.book_new();

  const summarySheet = [
    { Metric: 'Total leads', Value: data.summary.totalLeads },
    { Metric: 'Contacted', Value: data.summary.totalContacted },
    { Metric: 'Clients', Value: data.summary.totalClients },
    { Metric: 'Total revenue (₹)', Value: data.summary.totalRevenue },
    { Metric: 'Avg. deal size (₹)', Value: data.summary.avgDealSize },
    { Metric: 'Industry filter', Value: data.filtersApplied.industry },
    { Metric: 'State filter', Value: data.filtersApplied.state },
    { Metric: 'Date from', Value: data.filtersApplied.dateFrom },
    { Metric: 'Date to', Value: data.filtersApplied.dateTo },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), 'Summary');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.clients.map(c => ({ 'Business Name': c.name, Industry: c.industry, State: c.state, 'Quoted Price': c.quotedPrice, 'Final Amount': c.finalAmount, 'Contacted Date': c.contactedDate, Paid: c.paid }))
  ), 'Clients');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.statusBreakdown.map(s => ({ Status: s.status, Count: s.count }))
  ), 'Status Breakdown');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.replyByIndustry.map(r => ({ Industry: r.name, Contacted: r.contacted, 'Reply Rate %': r.replyRate }))
  ), 'Reply Rate by Industry');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.replyByBand.map(r => ({ 'Score Band': r.name, Contacted: r.contacted, 'Reply Rate %': r.replyRate }))
  ), 'Reply Rate by Score');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Metric: 'Avg won price (₹)', Value: data.pricing.avgWonPrice },
    { Metric: 'Avg lost price (₹)', Value: data.pricing.avgLostPrice },
    { Metric: 'Won count', Value: data.pricing.wonCount },
    { Metric: 'Lost count', Value: data.pricing.lostCount },
    ...data.pricing.reasons.map(r => ({ Metric: `Reason: ${r.name}`, Value: r.value })),
  ]), 'Pricing');

  XLSX.writeFile(wb, fname('xlsx'));
}

// --- PDF ----------------------------------------------------------------

export function exportInsightsPDF(data) {
  const doc = new jsPDF();
  let y = 18;

  doc.setFontSize(18);
  doc.text('Outreach Insights Report', 14, y);
  y += 7;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(filtersLine(data.filtersApplied), 14, y);
  doc.text(`Generated ${new Date(data.generatedAt).toLocaleString()}`, 14, y + 5);
  doc.setTextColor(0);
  y += 14;

  doc.setFontSize(12);
  doc.text('Summary', 14, y);
  y += 4;
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Metric', 'Value']],
    body: [
      ['Total leads', String(data.summary.totalLeads)],
      ['Contacted', String(data.summary.totalContacted)],
      ['Clients', String(data.summary.totalClients)],
      ['Total revenue (₹)', String(data.summary.totalRevenue)],
      ['Avg. deal size (₹)', String(data.summary.avgDealSize)],
    ],
    margin: { left: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  if (data.clients.length) {
    doc.setFontSize(12);
    doc.text('Clients', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y, theme: 'grid',
      head: [['Business', 'Industry', 'State', 'Quoted', 'Final', 'Contacted', 'Paid']],
      body: data.clients.map(c => [c.name, c.industry, c.state, String(c.quotedPrice), String(c.finalAmount), c.contactedDate, c.paid]),
      margin: { left: 14 }, styles: { fontSize: 8 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const addSimpleTable = (title, head, rows) => {
    if (y > 260) { doc.addPage(); y = 18; }
    doc.setFontSize(12);
    doc.text(title, 14, y);
    y += 4;
    autoTable(doc, { startY: y, theme: 'grid', head: [head], body: rows, margin: { left: 14 } });
    y = doc.lastAutoTable.finalY + 10;
  };

  addSimpleTable('Status breakdown', ['Status', 'Count'], data.statusBreakdown.map(s => [s.status, String(s.count)]));
  addSimpleTable('Reply rate by industry', ['Industry', 'Contacted', 'Reply rate %'], data.replyByIndustry.map(r => [r.name, String(r.contacted), String(r.replyRate)]));
  addSimpleTable('Reply rate by score band', ['Band', 'Contacted', 'Reply rate %'], data.replyByBand.map(r => [r.name, String(r.contacted), String(r.replyRate)]));
  addSimpleTable('Conversion funnel', ['Stage', 'Count'], data.funnel.map(f => [f.name, String(f.value)]));
  addSimpleTable('Pricing', ['Metric', 'Value'], [
    ['Avg won price (₹)', String(data.pricing.avgWonPrice)],
    ['Avg lost price (₹)', String(data.pricing.avgLostPrice)],
    ...data.pricing.reasons.map(r => [`Reason: ${r.name}`, String(r.value)]),
  ]);

  doc.save(fname('pdf'));
}

// --- PPTX -----------------------------------------------------------------

export async function exportInsightsPPTX(data) {
  const pres = new pptxgen();
  const TEAL = '2F6F62';
  const INK = '1C2321';

  const titleSlide = pres.addSlide();
  titleSlide.addText('Outreach Insights Report', { x: 0.5, y: 1.5, w: 9, fontSize: 32, bold: true, color: INK });
  titleSlide.addText(filtersLine(data.filtersApplied), { x: 0.5, y: 2.3, w: 9, fontSize: 12, color: '5B6360' });
  titleSlide.addText(`Generated ${new Date(data.generatedAt).toLocaleString()}`, { x: 0.5, y: 2.7, w: 9, fontSize: 10, color: '5B6360' });

  const summarySlide = pres.addSlide();
  summarySlide.addText('Summary', { x: 0.4, y: 0.3, fontSize: 20, bold: true, color: TEAL });
  summarySlide.addTable(
    [
      [{ text: 'Metric', options: { bold: true, fill: { color: TEAL }, color: 'FFFFFF' } }, { text: 'Value', options: { bold: true, fill: { color: TEAL }, color: 'FFFFFF' } }],
      ['Total leads', String(data.summary.totalLeads)],
      ['Contacted', String(data.summary.totalContacted)],
      ['Clients', String(data.summary.totalClients)],
      ['Total revenue (₹)', String(data.summary.totalRevenue)],
      ['Avg. deal size (₹)', String(data.summary.avgDealSize)],
    ],
    { x: 0.4, y: 0.9, w: 6, fontSize: 12 }
  );

  if (data.clients.length) {
    const clientSlide = pres.addSlide();
    clientSlide.addText('Clients', { x: 0.4, y: 0.3, fontSize: 20, bold: true, color: TEAL });
    clientSlide.addTable(
      [
        [{ text: 'Business', options: { bold: true, fill: { color: TEAL }, color: 'FFFFFF' } },
         { text: 'Industry', options: { bold: true, fill: { color: TEAL }, color: 'FFFFFF' } },
         { text: 'Quoted', options: { bold: true, fill: { color: TEAL }, color: 'FFFFFF' } },
         { text: 'Final', options: { bold: true, fill: { color: TEAL }, color: 'FFFFFF' } },
         { text: 'Paid', options: { bold: true, fill: { color: TEAL }, color: 'FFFFFF' } }],
        ...data.clients.slice(0, 15).map(c => [c.name, c.industry, String(c.quotedPrice), String(c.finalAmount), c.paid]),
      ],
      { x: 0.4, y: 0.9, w: 9.2, fontSize: 10 }
    );
  }

  const addTableSlide = (title, headers, rows) => {
    const slide = pres.addSlide();
    slide.addText(title, { x: 0.4, y: 0.3, fontSize: 20, bold: true, color: TEAL });
    slide.addTable(
      [headers.map(h => ({ text: h, options: { bold: true, fill: { color: TEAL }, color: 'FFFFFF' } })), ...rows],
      { x: 0.4, y: 0.9, w: 9.2, fontSize: 11 }
    );
  };

  addTableSlide('Status breakdown', ['Status', 'Count'], data.statusBreakdown.map(s => [s.status, String(s.count)]));
  addTableSlide('Reply rate by industry', ['Industry', 'Contacted', 'Reply rate %'], data.replyByIndustry.map(r => [r.name, String(r.contacted), String(r.replyRate)]));
  addTableSlide('Conversion funnel', ['Stage', 'Count'], data.funnel.map(f => [f.name, String(f.value)]));
  addTableSlide('Pricing', ['Metric', 'Value'], [
    ['Avg won price (₹)', String(data.pricing.avgWonPrice)],
    ['Avg lost price (₹)', String(data.pricing.avgLostPrice)],
    ...data.pricing.reasons.map(r => [`Reason: ${r.name}`, String(r.value)]),
  ]);

  await pres.writeFile({ fileName: fname('pptx') });
}

// --- DOCX -----------------------------------------------------------------

function docxTable(headers, rows) {
  const headerRow = new TableRow({
    children: headers.map(h => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })),
  });
  const dataRows = rows.map(r => new TableRow({
    children: r.map(cell => new TableCell({ children: [new Paragraph(String(cell))] })),
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
}

export async function exportInsightsDOCX(data) {
  const children = [
    new Paragraph({ text: 'Outreach Insights Report', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: filtersLine(data.filtersApplied), italics: true })] }),
    new Paragraph({ children: [new TextRun({ text: `Generated ${new Date(data.generatedAt).toLocaleString()}`, italics: true, size: 18 })] }),
    new Paragraph({ text: '' }),

    new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }),
    docxTable(['Metric', 'Value'], [
      ['Total leads', data.summary.totalLeads],
      ['Contacted', data.summary.totalContacted],
      ['Clients', data.summary.totalClients],
      ['Total revenue (₹)', data.summary.totalRevenue],
      ['Avg. deal size (₹)', data.summary.avgDealSize],
    ]),
    new Paragraph({ text: '' }),
  ];

  if (data.clients.length) {
    children.push(new Paragraph({ text: 'Clients', heading: HeadingLevel.HEADING_2 }));
    children.push(docxTable(
      ['Business', 'Industry', 'State', 'Quoted', 'Final', 'Contacted', 'Paid'],
      data.clients.map(c => [c.name, c.industry, c.state, c.quotedPrice, c.finalAmount, c.contactedDate, c.paid])
    ));
    children.push(new Paragraph({ text: '' }));
  }

  children.push(new Paragraph({ text: 'Status breakdown', heading: HeadingLevel.HEADING_2 }));
  children.push(docxTable(['Status', 'Count'], data.statusBreakdown.map(s => [s.status, s.count])));
  children.push(new Paragraph({ text: '' }));

  children.push(new Paragraph({ text: 'Reply rate by industry', heading: HeadingLevel.HEADING_2 }));
  children.push(docxTable(['Industry', 'Contacted', 'Reply rate %'], data.replyByIndustry.map(r => [r.name, r.contacted, r.replyRate])));
  children.push(new Paragraph({ text: '' }));

  children.push(new Paragraph({ text: 'Conversion funnel', heading: HeadingLevel.HEADING_2 }));
  children.push(docxTable(['Stage', 'Count'], data.funnel.map(f => [f.name, f.value])));
  children.push(new Paragraph({ text: '' }));

  children.push(new Paragraph({ text: 'Pricing', heading: HeadingLevel.HEADING_2 }));
  children.push(docxTable(['Metric', 'Value'], [
    ['Avg won price (₹)', data.pricing.avgWonPrice],
    ['Avg lost price (₹)', data.pricing.avgLostPrice],
    ...data.pricing.reasons.map(r => [`Reason: ${r.name}`, r.value]),
  ]));

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname('docx');
  a.click();
}
