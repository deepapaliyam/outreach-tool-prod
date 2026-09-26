# Daily automation — n8n workflow blueprint

Built as a blueprint rather than an import-ready JSON file on purpose:
the Gmail-fetch node needs its own OAuth credential configured inside
n8n's UI regardless of what file you import, so a pre-built JSON would
have broken credential references anyway. What's below is copy-paste
accurate for the parts that don't depend on your n8n account setup.

Assumption: the daily file arrives as an email attachment. If it
actually comes from a vendor portal or API instead, only Node 1 changes
— everything downstream (parsing, scoring, writing to Supabase) is the
same regardless of source.

## Nodes, in order

**1. Schedule Trigger**
- Trigger: Cron, e.g. `0 8 * * *` (8 AM daily — adjust to when the file
  usually lands).

**2. Gmail node — Get Many Messages**
- Credential: connect your Gmail account (n8n handles this OAuth
  connection itself, separately from the app's own Gmail connection).
- Filter: search query matching how the vendor's email looks, e.g.
  `has:attachment from:vendor@example.com newer_than:1d` — adjust the
  sender/subject pattern to match reality.

**3. Gmail node — Download Attachment**
- Downloads the `.xlsx` attachment from the message found in step 2.

**4. Extract From File node**
- Operation: **Read binary file** → Format: **XLSX**.
- This is n8n's native spreadsheet parser — no custom code needed for
  this part. Output: one JSON item per row of the sheet.

**5. Code node — dedupe + score**
- Paste the JavaScript below. This is your existing `scoring.js` logic,
  adapted to n8n's Code node input/output shape (`$input.all()` /
  return `[{ json: {...} }]`). Keep this in sync with
  `src/lib/scoring.js` if you tune weights later — same rubric, two
  places it lives.

```javascript
// n8n Code node — paste this whole block in "Run Once for All Items" mode

const FREEMAIL = new Set(['gmail.com','yahoo.com','yahoo.in','outlook.com','rediffmail.com','hotmail.com','icloud.com','live.com']);

function industryWeight(label) {
  if (!label) return 7;
  const l = String(label).trim().toUpperCase();
  const high = ['REAL ESTATE','FOOD AND BEVERAGE','RETAIL TRADE','TRAVEL AGENCY','ACCOMMODATION','EDUCATION','HUMAN HEALTH','CREATIVE, ARTS','MOTION PICTURE','SPORTS ACTIVITIES','PUBLISHING','RENTAL AND LEASING'];
  const med = ['CONSTRUCTION OF BUILDINGS','OTHER PROFESSIONAL','LEGAL AND ACCOUNTING','HEADOFFICES','EMPLOYMENT ACTIVITIES','OTHER FINANCIAL','OFFICE ADMINISTRATIVE','SECURITY AND INVESTIGATION','SOCIAL WORK','RESIDENTIAL CARE','SCIENTIFIC RESEARCH'];
  const lowTech = ['COMPUTER PROGRAMMING','INFORMATION SERVICE'];
  if (high.some(k => l.includes(k))) return 14;
  if (med.some(k => l.includes(k))) return 10;
  if (lowTech.some(k => l.includes(k))) return 6;
  if (l.includes('MANUFACTURE')) return 6;
  return 7;
}
function getDomain(email) {
  if (!email || !String(email).includes('@')) return null;
  return String(email).split('@').pop().toLowerCase().trim();
}
function pick(row, keys) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  return '';
}

const rows = $input.all().map(i => i.json);
const byId = new Map();
rows.forEach(r => {
  const id = pick(r, ['entityId', 'EntityId', 'Entity ID']);
  if (!id) return;
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push(r);
});

const PREFERRED_REGIONS = ['kerala']; // <- edit this to your preferred regions

const out = [];
byId.forEach((group, id) => {
  const first = group[0];
  const companyEmail = pick(first, ['email', 'Email']);
  const domain = getDomain(companyEmail);
  const isFreemail = domain ? FREEMAIL.has(domain) : true;
  let stakeName = pick(first, ['directorName']), stakeEmail = pick(first, ['directorEmail']), matched = false;
  if (domain && !isFreemail) {
    const hit = group.find(g => getDomain(pick(g, ['directorEmail'])) === domain);
    if (hit) { stakeName = hit.directorName; stakeEmail = hit.directorEmail; matched = true; }
  }
  const nicLabel = String(pick(first, ['nicLabel', 'Industry']) || '').trim();
  const entityType = String(pick(first, ['entityType']) || '');
  const capital = Number(pick(first, ['paidUpCapital']));

  let need = isFreemail ? 25 : 5;
  need += industryWeight(nicLabel);
  if (entityType.toLowerCase().includes('company') && capital > 100000) need += 10;

  let reach = 5;
  if (matched) reach += 15;
  reach += Math.min((group.length - 1) * 2, 6);

  let regionBonus = 0;
  const state = (pick(first, ['state']) || '').toLowerCase();
  if (PREFERRED_REGIONS.some(r => state.includes(r))) regionBonus = 10;

  out.push({
    json: {
      entity_id: String(id),
      name: pick(first, ['name']) || '(unnamed)',
      entity_type: entityType,
      state: pick(first, ['state']) || '',
      district: pick(first, ['district']) || '',
      nic_label: nicLabel,
      paid_up_capital: capital || null,
      num_directors: group.length,
      company_email: companyEmail || '',
      stakeholder_name: stakeName,
      stakeholder_email: stakeEmail,
      stakeholder_domain_match: matched,
      website_status: 'Unknown',
      need_score: need,
      reach_score: reach,
      region_bonus: regionBonus,
      priority_score: need + reach + regionBonus,
    },
  });
});

return out;
```

**6. HTTP Request node — upsert into Supabase**
- Method: POST
- URL: `https://YOUR-PROJECT-ref.supabase.co/rest/v1/leads`
- Headers:
  - `apikey`: your **service_role** key (stored as an n8n credential —
    never paste it in plain text in the node)
  - `Authorization`: `Bearer <same service_role key>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=ignore-duplicates` (skips rows whose
    `(user_id, entity_id)` already exists, matching the "safe to
    re-upload" behavior from the app)
- Body: the array from the Code node, with a fixed `user_id` field
  added for whichever account should own these leads (yours, or your
  client's, once you know their Supabase user id).
- Body Content Type: JSON, Send Body: **all items as an array** (n8n's
  "Send Body" toggle — batches the whole day's leads in one request,
  not one call per lead).

**7. (Optional) Notification node** — Slack, Gmail, or Telegram — post
a one-line summary: "X new leads loaded, top score Y" so you know it
ran without checking manually.

## Why website enrichment isn't in this workflow yet

Adding real search/website checks means one more HTTP Request node per
lead calling a search API (Serper, SerpAPI, Google Custom Search) — a
paid, per-call cost, which is why it's kept as a deliberate next
addition rather than bundled in by default. Once you pick a provider,
that's a single new node between steps 5 and 6, writing into the same
`website_status` field this workflow already sets to "Unknown."
