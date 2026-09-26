// ---------------------------------------------------------------------------
// Pure lead parsing + scoring. No React, no Supabase — so it can be unit
// tested and reused by the n8n enrichment step if you port it to a function.
// This is the SAME rubric as the prototype; keep the two in sync.
// ---------------------------------------------------------------------------

export const FREEMAIL = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com',
  'rediffmail.com', 'hotmail.com', 'icloud.com', 'live.com',
]);

export const INDUSTRY_WEIGHTS = {
  'ACCOMMODATION': 14, 'ACTIVITIES OF MEMBERSHIP ORGANIZATIONS': 10,
  'ACTIVITIESOFHEADOFFICES;MANAGEMENTCONSULTANCYACTIVITIES': 10, 'CIVIL ENGINEERING': 7,
  'COMPUTER PROGRAMMING, CONSULTANCYAND RELATEDACTIVITIES': 6, 'CONSTRUCTION OF BUILDINGS': 10,
  'CREATIVE, ARTS AND ENTERTAINMENT ACTIVITIES': 14,
  'CROP AND ANIMAL PRODUCTION, HUNTING AND RELATED SERVICE ACTIVITIES': 7,
  'Community, personal & Social Services': 14, 'EDUCATION': 14,
  'ELECTRICITY, GAS, STEAM AND AIRCONDITION SUPPLY': 7, 'EMPLOYMENT ACTIVITIES': 10,
  'FOOD AND BEVERAGE SERVICE ACTIVITIES': 14, 'HUMAN HEALTH ACTIVITIES': 14,
  'INFORMATION SERVICE ACTIVITIES': 6, 'LAND TRANSPORT AND TRANSPORT VIA PIPELINES': 7,
  'LEGAL AND ACCOUNTING ACTIVITIES': 10, 'MANUFACTURE OF BASIC METALS': 6,
  'MANUFACTURE OF BEVERAGES': 6, 'MANUFACTURE OF CHEMICALS AND CHEMICAL PRODUCTS': 6,
  'MANUFACTURE OF COMPUTER, ELECTRONICAND OPTICAL PRODUCTS.': 6,
  'MANUFACTURE OF ELECTRICAL EQUIPMENT': 6,
  'MANUFACTURE OF FABRICATED METAL PRODUCTS, EXCEPT MACHINERY AND EQUIPMENT': 6,
  'MANUFACTURE OF FOOD PRODUCTS': 6, 'MANUFACTURE OF FURNITURE': 6,
  'MANUFACTURE OF LEATHER AND RELATED PRODUCTS': 6, 'MANUFACTURE OF MACHINERY AND EQUIPMENT N.E.C.': 6,
  'MANUFACTURE OF OTHER NON-METALLIC MINERAL PRODUCTS': 6, 'MANUFACTURE OF OTHER TRANSPORT EQUIPMENT': 6,
  'MANUFACTURE OF PAPER AND PAPER PRODUCTS': 6,
  'MANUFACTURE OF PHARMACEUTICALS, MEDICINAL CHEMICAL AND BOTANICAL PRODUCTS': 6,
  'MANUFACTURE OF RUBBER AND PLASTICS PRODUCTS': 6, 'MANUFACTURE OF TEXTILES': 6,
  'MANUFACTURE OF WEARING APPAREL': 6,
  'MOTION PICTURE, VIDEO AND TELEVISION PROGRAMME PRODUCTION, SOUND RECORDING AND MUSIC PUBLISHING ACTIVITIES.': 14,
  'Manufacture of motor vehicles, trailers and semi-trailers': 6,
  'OFFICE ADMINISTRATIVE, OFFICE SUPPORT AND': 10, 'OTHER FINANCIAL ACTIVITIES': 10,
  'OTHER MANUFACTURING': 7, 'OTHER MINING AND QUARRYING': 7, 'OTHER PERSONAL SERVICE ACTIVITIES': 7,
  'OTHER PROFESSIONAL, SCIENTIFIC AND TECHNICAL ACTIVITIES': 10, 'POSTAL AND COURIER ACTIVITIES': 7,
  'PRINTING AND REPRODUCTION OF RECORDED MEDIA (THIS DIVISION EXCLUDES PUBLISHING ACTIVITIES, SEE SECTION J FOR PUBLISHING ACTIVITIES': 14,
  'PUBLISHING ACTIVITIES': 14, 'REAL ESTATE ACTIVITIES': 14,
  'REMEDIATIONACTIVITIESANDOTHERWASTEMANAGEMENTSERVICES': 7, 'RENTAL AND LEASING ACTIVITIES': 14,
  'REPAIR AND INSTALLATION OF MACHINERY AND EQUIPMENT': 7, 'RESIDENTIAL CARE ACTIVITIES': 10,
  'RETAIL TRADE, EXCEPT OF MOTOR VEHICLES AND MOTORCYCLES': 14, 'Real Estate and Renting': 14,
  'SCIENTIFIC RESEARCH AND DEVELOPMENT': 10, 'SECURITY AND INVESTIGATION ACTIVITIES': 10,
  'SERVICES TO BUILDINGS AND LANDSCAPE ACTIVITIES': 10, 'SOCIAL WORK ACTIVITIES WITHOUT ACCOMMODATION': 14,
  'SPECIALIZED CONSTRUCTION ACTIVITIES': 7, 'SPORTS ACTIVITIES AND AMUSEMENT AND RECREATION ACTIVITIES': 14,
  'TRAVEL AGENCY, TOUR OPERATOR AND OTHER RESERVATION SERVICE ACTIVITIES': 14,
  'WAREHOUSING AND SUPPORT ACTIVITIES FOR TRANSPORTATION': 7,
  'WASTE COLLECTION, TREATMENT AND DISPOSAL ACTIVITIES; MATERIALS RECOVERY': 7,
  'WHOLESALE AND RETAIL TRADE AND REPAIR OF MOTOR VEHICLES AND MOTORCYCLES': 14,
  'WHOLESALETRADE,EXCEPTOFMOTORVEHICLESANDMOTORCYCLES': 7,
};

export function industryWeight(label) {
  if (!label) return 7;
  const key = String(label).trim();
  if (INDUSTRY_WEIGHTS[key] !== undefined) return INDUSTRY_WEIGHTS[key];
  const l = key.toUpperCase();
  const high = ['REAL ESTATE', 'FOOD AND BEVERAGE', 'RETAIL TRADE', 'TRAVEL AGENCY', 'ACCOMMODATION', 'EDUCATION', 'HUMAN HEALTH', 'CREATIVE, ARTS', 'MOTION PICTURE', 'SPORTS ACTIVITIES', 'PUBLISHING', 'RENTAL AND LEASING'];
  const med = ['CONSTRUCTION OF BUILDINGS', 'OTHER PROFESSIONAL', 'LEGAL AND ACCOUNTING', 'HEADOFFICES', 'EMPLOYMENT ACTIVITIES', 'OTHER FINANCIAL', 'OFFICE ADMINISTRATIVE', 'SECURITY AND INVESTIGATION', 'SOCIAL WORK', 'RESIDENTIAL CARE', 'SCIENTIFIC RESEARCH'];
  const lowTech = ['COMPUTER PROGRAMMING', 'INFORMATION SERVICE'];
  if (high.some(k => l.includes(k))) return 14;
  if (med.some(k => l.includes(k))) return 10;
  if (lowTech.some(k => l.includes(k))) return 6;
  if (l.includes('MANUFACTURE')) return 6;
  return 7;
}

export function getDomain(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  return email.split('@').pop().toLowerCase().trim();
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return '';
}

// director-level rows -> one object per business
export function parseWorkbookRows(rows) {
  const byId = new Map();
  rows.forEach(r => {
    const id = pick(r, ['entityId', 'EntityId', 'Entity ID', 'entity_id']);
    if (!id) return;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(r);
  });

  const entities = [];
  byId.forEach((group, id) => {
    const first = group[0];
    const companyEmail = pick(first, ['email', 'Email', 'Company Email', 'company_email']);
    const domain = getDomain(companyEmail);
    let stakeholderName = pick(first, ['directorName', 'DirectorName']);
    let stakeholderEmail = pick(first, ['directorEmail', 'DirectorEmail']);
    let matched = false;
    if (domain && !FREEMAIL.has(domain)) {
      const hit = group.find(g => getDomain(pick(g, ['directorEmail', 'DirectorEmail'])) === domain);
      if (hit) {
        stakeholderName = pick(hit, ['directorName', 'DirectorName']);
        stakeholderEmail = pick(hit, ['directorEmail', 'DirectorEmail']);
        matched = true;
      }
    }
    entities.push({
      entity_id: String(id),
      name: pick(first, ['name', 'Name', 'Business Name']) || '(unnamed)',
      entity_type: String(pick(first, ['entityType', 'EntityType', 'Type']) || ''),
      state: pick(first, ['state', 'State']) || '',
      district: pick(first, ['district', 'District']) || '',
      nic_label: String(pick(first, ['nicLabel', 'NicLabel', 'Industry (NIC)', 'Industry']) || '').trim(),
      paid_up_capital: pick(first, ['paidUpCapital', 'PaidUpCapital']) || null,
      num_directors: group.length,
      company_email: companyEmail || '',
      stakeholder_name: stakeholderName,
      stakeholder_email: stakeholderEmail,
      stakeholder_domain_match: matched,
      website_status: pick(first, ['Website Status (fill in)', 'Website Status', 'websiteStatus', 'Website Found?']) || 'Unknown',
      business_listings: pick(first, ['Business Listings Found', 'businessListings']) || '',
      search_notes: pick(first, ['Search Notes (collisions/false positives)', 'Notes', 'notes']) || '',
    });
  });
  return entities;
}

// entity (snake_case) -> scored entity with breakdown
export function scoreLead(e, preferredRegions = []) {
  const domain = getDomain(e.company_email);
  const isFreemail = domain ? FREEMAIL.has(domain) : true;
  const breakdown = [];

  let need = 0;
  if (isFreemail) { need += 25; breakdown.push({ group: 'Need', points: 25, why: 'Freemail company email — likely no custom domain or site yet' }); }
  else { need += 5; breakdown.push({ group: 'Need', points: 5, why: 'Custom-domain company email — lower default need until live-site check' }); }

  const iw = industryWeight(e.nic_label);
  need += iw;
  breakdown.push({ group: 'Need', points: iw, why: `Industry weight for "${e.nic_label || 'unknown'}"` });

  const capital = Number(e.paid_up_capital);
  if (e.entity_type && e.entity_type.toLowerCase().includes('company') && capital > 100000) {
    need += 10; breakdown.push({ group: 'Need', points: 10, why: 'Company above statutory minimum capital' });
  }
  const ws = (e.website_status || '').toLowerCase();
  if (ws.includes('not found')) { need += 8; breakdown.push({ group: 'Need', points: 8, why: 'No website found (strong need signal)' }); }
  if (ws.includes('live')) { need -= 15; breakdown.push({ group: 'Need', points: -15, why: 'Live website already found' }); }

  let reach = 5;
  breakdown.push({ group: 'Reach', points: 5, why: 'Company email present (baseline)' });
  if (e.stakeholder_domain_match) { reach += 15; breakdown.push({ group: 'Reach', points: 15, why: 'Director email on company domain (real, senior inbox)' }); }
  const dirBonus = Math.min((e.num_directors - 1) * 2, 6);
  if (dirBonus > 0) { reach += dirBonus; breakdown.push({ group: 'Reach', points: dirBonus, why: `${e.num_directors} directors listed` }); }

  let regionBonus = 0;
  if (preferredRegions && preferredRegions.length) {
    const st = (e.state || '').toLowerCase();
    if (preferredRegions.some(r => r && st.includes(r.toLowerCase().trim()))) {
      regionBonus = 10; breakdown.push({ group: 'Region', points: 10, why: `Preferred region (${e.state})` });
    }
  }

  return {
    ...e,
    need_score: need,
    reach_score: reach,
    region_bonus: regionBonus,
    priority_score: need + reach + regionBonus,
    score_breakdown: breakdown,
  };
}

export function recommendContact(lead) {
  const primary = lead.company_email ? { addr: lead.company_email } : null;
  const fallback = lead.stakeholder_email
    ? { addr: lead.stakeholder_email, verified: !!lead.stakeholder_domain_match }
    : null;
  return { primary, fallback };
}

// Single computed pipeline status, derived from the granular outcome
// fields — one source of truth shared by the UI, insights, and exports.
// A materialized deal is labeled "Client" (not "Won") because a
// converted lead is categorically a client from here on.
export function computeStatus(lead) {
  const o = lead.outcome || {};
  if (o.payment_received) return { label: 'Client (Paid)', tone: 'paid' };
  if (o.materialized) return { label: 'Client', tone: 'won' };
  if (o.not_proceeded_reason) return { label: 'Lost', tone: 'lost' };
  if (o.proposal_sent) return { label: 'Proposal sent', tone: 'proposal' };
  if (o.replied) return { label: 'Replied', tone: 'replied' };
  if (o.contacted) return { label: 'Contacted', tone: 'contacted' };
  if (lead.draft) return { label: 'Drafted', tone: 'drafted' };
  return { label: 'Not contacted', tone: 'none' };
}

export function isClient(lead) {
  return !!(lead.outcome && lead.outcome.materialized);
}
