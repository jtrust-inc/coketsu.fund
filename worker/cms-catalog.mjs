import sanitizeHtml from 'sanitize-html';

export const collections = [
  { key: 'news', label: 'お知らせ', description: 'Coketsu fund.からのお知らせをご案内します。' },
  { key: 'features', label: '特集', description: 'Coketsu fund.の特集記事をご案内します。' },
];
// Explicit withdrawal must survive subsequent CMS connection/imports.
export const withdrawnIds = new Set(['2026-11-05-service-notice']);
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const imageAllowed = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'images.microcms-assets.io' && !url.username && !url.password && !url.port; } catch { return false; }
};

export function normalizeArticle(raw, collection) {
  if (!collections.some(item => item.key === collection) || !raw || !idPattern.test(raw.id || '') || !text(raw.title, 200) || !date(raw.publishedAt) || Date.parse(raw.publishedAt) > Date.now()) throw new Error('Invalid published article');
  if (typeof raw.body !== 'string' || raw.body.length > 250_000) throw new Error('Invalid article body');
  const body = sanitizeHtml(raw.body, {
    allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 's', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'code', 'pre'],
    allowedAttributes: { a: ['href', 'title', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading'], th: ['scope', 'colspan', 'rowspan'], td: ['colspan', 'rowspan'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'], allowedSchemesByTag: { img: ['https'] }, allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }), img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }) },
    exclusiveFilter: frame => frame.tag === 'img' && !imageAllowed(frame.attribs.src),
  });
  const plain = sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  if (!plain && !body.includes('<img')) throw new Error('Empty article body');
  return { id: raw.id, collection, route: `/${collection}/${raw.id}/`, title: text(raw.title, 200), description: text(raw.description, 300) || plain.slice(0, 160), body,
    image: imageAllowed(raw.eyecatch?.url) ? raw.eyecatch.url : null, imageAlt: text(raw.eyecatch?.alt, 300), publishedAt: date(raw.publishedAt), updatedAt: date(raw.revisedAt) || date(raw.publishedAt) };
}

async function boundedJson(response, budget) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing CMS response');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; budget.bytes += value.byteLength;
      if (size > 5 * 1024 * 1024 || budget.bytes > 10 * 1024 * 1024) { await reader.cancel(); throw new Error('CMS response too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(buffer));
}

// Server-side, read-only, published contents only. Visitor query parameters and
// draftKey are never forwarded. Do not cache: unpublishing must take effect on
// the next origin request, including after upstream failures.
export async function loadCatalog(env, requested = collections.map(item => item.key), fetcher = fetch) {
  if (!env.MICROCMS_API_KEY) return { configured: false, articles: [] };
  const service = env.MICROCMS_SERVICE_DOMAIN;
  if (!service || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(service)) throw new Error('Invalid CMS configuration');
  if (!requested.every(key => collections.some(item => item.key === key))) throw new Error('Invalid CMS collection');
  const articles = []; const budget = { bytes: 0 };
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    for (const key of requested) {
      let offset = 0; let total = 1; const seen = new Set();
      while (offset < total) {
        const url = new URL(`https://${service}.microcms.io/api/v1/${key}`);
        url.search = new URLSearchParams({ limit: '100', offset: String(offset), orders: '-publishedAt', fields: 'id,title,description,body,eyecatch,publishedAt,revisedAt' }).toString();
        const response = await fetcher(url, { headers: { 'X-MICROCMS-API-KEY': env.MICROCMS_API_KEY }, signal: controller.signal, redirect: 'manual' });
        if (!response.ok) throw new Error('CMS request failed');
        const result = await boundedJson(response, budget);
        if (!Array.isArray(result.contents) || !Number.isInteger(result.totalCount) || result.totalCount < 0 || result.totalCount > 1000 || result.contents.length > 100 || offset + result.contents.length > result.totalCount) throw new Error('Invalid CMS pagination');
        total = result.totalCount;
        if (!result.contents.length && offset < total) throw new Error('Incomplete CMS pagination');
        for (const raw of result.contents) {
          if (withdrawnIds.has(raw?.id)) continue;
          const article = normalizeArticle(raw, key);
          if (seen.has(article.id)) throw new Error('Duplicate content ID');
          seen.add(article.id); articles.push(article);
        }
        offset += result.contents.length;
      }
    }
    return { configured: true, articles };
  } finally { clearTimeout(timer); }
}

export const displayDate = value => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
