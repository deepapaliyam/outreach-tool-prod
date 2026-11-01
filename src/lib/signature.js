import DOMPurify from 'dompurify';

// Browser-side helpers for the email signature. The server (send-email)
// sanitises again at send time and is the authority; this copy exists so the
// preview shows what will really go out, and so nothing odd is ever rendered
// inside the app itself.

// ---- URLs ------------------------------------------------------------------
// "northstar.studio" -> "https://northstar.studio". Anything that is not a
// plain web address (javascript:, data:, ...) is rejected.
export function normalizeUrl(input) {
  let u = String(input || '').trim();
  if (!u) return '';
  if (/^mailto:|^tel:/i.test(u)) return u;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (!url.hostname.includes('.')) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return String(url || ''); }
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- Allowed content (mirrors supabase/functions/send-email) -----------------
const ALLOWED_TAGS = ['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'img', 'ul', 'ol', 'li', 'hr'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'src', 'alt', 'width', 'height'];

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/i, /^[a-z]{3,20}$/i];
const LENGTH = [/^\d+(\.\d+)?(px|pt|em|rem|%)$/];
const STYLE_RULES = {
  color: COLOR, 'background-color': COLOR,
  'font-size': LENGTH, 'line-height': LENGTH.concat([/^\d+(\.\d+)?$/]),
  'font-weight': [/^(normal|bold|[1-9]00)$/], 'font-style': [/^(normal|italic)$/],
  'text-decoration': [/^(none|underline|line-through)$/], 'text-align': [/^(left|right|center|justify)$/],
  'font-family': [/^[\w\s,'"-]{1,120}$/],
  margin: [/^[\d.\s]+(px|pt|em|rem)?(\s+[\d.]+(px|pt|em|rem)?){0,3}$/],
  width: LENGTH, height: LENGTH.concat([/^auto$/]), 'max-width': LENGTH.concat([/^100%$/]),
  border: [/^0$/], 'vertical-align': [/^(top|middle|bottom|baseline)$/],
};

// Keeps only the style properties above whose values look safe.
export function cleanStyle(value) {
  return String(value || '').split(';').map(d => d.trim()).filter(Boolean).map(d => {
    const i = d.indexOf(':');
    if (i < 0) return '';
    const prop = d.slice(0, i).trim().toLowerCase();
    const val = d.slice(i + 1).trim();
    const rules = STYLE_RULES[prop];
    return rules && rules.some(r => r.test(val)) ? `${prop}:${val}` : '';
  }).filter(Boolean).join(';');
}

let hooked = false;
function installHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.hasAttribute && node.hasAttribute('style')) {
      const cleaned = cleanStyle(node.getAttribute('style'));
      if (cleaned) node.setAttribute('style', cleaned); else node.removeAttribute('style');
    }
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (!/^https?:\/\//i.test(src)) node.remove();
      else node.setAttribute('style', node.getAttribute('width') ? 'max-width:100%;height:auto;border:0' : 'max-width:200px;height:auto;border:0');
    }
  });
}

export function sanitizeSignatureHtml(html) {
  installHooks();
  return DOMPurify.sanitize(String(html || '').slice(0, 20000), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Without this DOMPurify treats every non-listed attribute value as a URL and drops "120",
    // so logo sizes would vanish from the preview even though the server keeps them.
    ADD_URI_SAFE_ATTR: ['width', 'height'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  }).trim();
}

// A signature that is only an empty paragraph counts as "no signature".
export function signatureIsEmpty(html) {
  const h = String(html || '');
  if (/<img\b/i.test(h)) return false;
  return h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';
}

// ---- Starter signature ---------------------------------------------------------
// Builds a tidy first draft from the details already on the profile, so
// nobody has to start from a blank box.
export function buildStarterSignature(p, logoUrl = '') {
  const parts = [];
  const logo = normalizeUrl(logoUrl);
  if (logo) parts.push(`<p><img src="${esc(logo)}" alt="${esc((p.company || p.name || 'Logo') + ' logo')}"></p>`);

  const who = [p.title, p.company].map(s => String(s || '').trim()).filter(Boolean).join(' · ');
  if (p.name || who) {
    parts.push(`<p>${p.name ? `<strong>${esc(p.name)}</strong>` : ''}${p.name && who ? '<br>' : ''}${esc(who)}</p>`);
  }

  const reach = [];
  if (p.phone) reach.push(esc(p.phone));
  const mail = String(p.contactEmail || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) reach.push(`<a href="mailto:${esc(mail)}">${esc(mail)}</a>`);
  const site = normalizeUrl(p.website);
  if (site) reach.push(`<a href="${esc(site)}">${esc(hostLabel(site))}</a>`);
  if (reach.length) parts.push(`<p>${reach.join('<br>')}</p>`);

  const linkList = (list) => (list || []).map(l => {
    const url = normalizeUrl(l.url);
    return url ? `<a href="${esc(url)}">${esc(l.label || hostLabel(url))}</a>` : '';
  }).filter(Boolean).join(' · ');
  const portfolio = linkList(p.portfolioLinks);
  const social = linkList(p.socialLinks);
  if (portfolio) parts.push(`<p>Portfolio: ${portfolio}</p>`);
  if (social) parts.push(`<p>${social}</p>`);

  return parts.join('');
}

// ---- The email body, as the server will render it ---------------------------------
// Blank lines start a new paragraph, single line breaks stay line breaks.
// (Same rule as bodyToHtml in send-email.)
export function bodyToHtml(body) {
  return String(body || '').replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
    .map(para => `<p style="margin:0 0 14px 0">${esc(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}
