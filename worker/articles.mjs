import { collections, withdrawnIds, loadCatalog, displayDate } from './cms-catalog.mjs';

const origin = 'https://coketsu.fund';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const jsonText = value => JSON.stringify(value).replace(/</g, '\\u003c');
const errorResponse = (status, message) => new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...(status === 503 ? { 'retry-after': '60' } : {}) } });

export function renderArticle(catalog, key, id) {
  const collection = collections.find(item => item.key === key);
  if (!collection) return null;
  const items = catalog.articles.filter(article => article.collection === key && !withdrawnIds.has(article.id));
  const article = id ? items.find(item => item.id === id) : undefined;
  if (id && !article) return null;
  const title = article?.title || collection.label;
  const route = article?.route || `/${key}/`;
  const description = article?.description || collection.description;
  const image = article?.image || `${origin}/wp-content/uploads/2025/04/coketsu2.png`;
  const crumb = `<nav class="breadcrumb" aria-label="パンくずリスト"><div class="container"><a href="/">ホーム</a> / ${article ? `<a href="/${key}/">${collection.label}</a> / ` : ''}<span aria-current="page">${esc(title)}</span></div></nav>`;
  const cards = items.map(item => `<article class="article-card"><a href="${item.route}">${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.imageAlt)}" loading="lazy" width="800" height="450">` : ''}<div class="article-card-body"><time datetime="${item.publishedAt}">${displayDate(item.publishedAt)}</time><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p><span>記事を読む →</span></div></a></article>`).join('');
  const content = article
    ? `${crumb}<div class="site-body"><div class="container"><article class="entry-body cms-article"><p><a href="/${key}/">${collection.label}</a> · <time datetime="${article.publishedAt}">${displayDate(article.publishedAt)}</time></p><h1>${esc(title)}</h1>${article.image ? `<img class="article-cover" src="${esc(image)}" alt="${esc(article.imageAlt)}" width="1200" height="675">` : ''}<div class="article-body">${article.body}</div><p class="article-publisher">発信：株式会社ジェイトラスト / COKETSU FUND</p><p><a href="/${key}/">← ${collection.label}一覧へ戻る</a></p></article></div></div>`
    : `<div class="page-header"><div class="container"><h1 class="page-header-title">${title}</h1></div></div>${crumb}<div class="site-body"><div class="container"><div class="article-grid">${cards}</div></div></div>`;
  const graph = [
    { '@type': 'Organization', '@id': `${origin}/#organization`, name: '株式会社ジェイトラスト', url: 'https://jtrust-inc.jp/' },
    { '@type': 'WebSite', '@id': `${origin}/#website`, name: 'Coketsu fund.', url: origin + '/', publisher: { '@id': `${origin}/#organization` } },
    { '@type': 'WebPage', '@id': origin + route + '#webpage', url: origin + route, name: title, description, inLanguage: 'ja', isPartOf: { '@id': `${origin}/#website` } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'ホーム', item: origin + '/' }, { '@type': 'ListItem', position: 2, name: collection.label, item: `${origin}/${key}/` }, ...(article ? [{ '@type': 'ListItem', position: 3, name: title, item: origin + route }] : [])] },
  ];
  if (article) graph.push({ '@type': 'Article', headline: title, description, datePublished: article.publishedAt, dateModified: article.updatedAt, mainEntityOfPage: origin + route, image: [image], author: { '@id': `${origin}/#organization` }, publisher: { '@id': `${origin}/#organization` }, inLanguage: 'ja' });
  return { title: `${title} | Coketsu fund.`, description, image, route, content, empty: !id && !items.length, schema: jsonText({ '@context': 'https://schema.org', '@graph': graph }) };
}

export async function handleArticles(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/(news|features)(?:\/([a-zA-Z0-9_-]{1,100}))?\/?$/);
  const sitemap = url.pathname === '/sitemap.xml';
  if (!match && !sitemap) return null;
  // Not enabled until the read-only key is explicitly configured.
  if (!env.MICROCMS_API_KEY) return null;
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } });
  if (match && withdrawnIds.has(match[2])) return errorResponse(404, '記事が見つかりません。');
  if (match && !url.pathname.endsWith('/')) { url.pathname += '/'; return Response.redirect(url.toString(), 308); }
  try {
    const catalog = await loadCatalog(env, match ? [match[1]] : undefined);
    if (sitemap) {
      const base = await env.ASSETS.fetch(new Request(`${url.origin}/sitemap.xml`));
      if (!base.ok) throw new Error('Missing sitemap');
      const source = await base.text(); // bounded local build asset, not remote CMS
      const additions = catalog.articles.filter(article => !source.includes(`<loc>${origin}${article.route}</loc>`)).map(article => `<url><loc>${origin}${article.route}</loc><lastmod>${article.updatedAt}</lastmod></url>`).join('');
      return new Response(request.method === 'HEAD' ? null : source.replace('</urlset>', `${additions}</urlset>`), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' } });
    }
    const rendered = renderArticle(catalog, match[1], match[2]);
    if (!rendered) return errorResponse(404, '記事が見つかりません。');
    const template = await env.ASSETS.fetch(new Request(`${url.origin}/${match[1]}/`));
    if (!template.ok) throw new Error('Missing article template');
    const headers = new Headers(template.headers);
    for (const key of ['etag', 'last-modified', 'content-length', 'content-encoding']) headers.delete(key);
    headers.set('cache-control', 'no-store');
    const base = new Response(template.body, { headers });
    const response = rendered.empty ? base : new HTMLRewriter()
      .on('head', { element(element) { element.append('<link rel="stylesheet" href="/assets/articles.css">', { html: true }); } })
      .on('#main', { element(element) { element.setInnerContent(rendered.content, { html: true }); } })
      .on('title', { element(element) { element.setInnerContent(rendered.title); } })
      .on('link[rel="canonical"]', { element(element) { element.setAttribute('href', origin + rendered.route); } })
      .on('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]', { element(element) { element.setAttribute('content', rendered.description); } })
      .on('meta[property="og:title"],meta[name="twitter:title"]', { element(element) { element.setAttribute('content', rendered.title); } })
      .on('meta[property="og:url"]', { element(element) { element.setAttribute('content', origin + rendered.route); } })
      .on('meta[property="og:image"],meta[name="twitter:image"]', { element(element) { element.setAttribute('content', rendered.image); } })
      .on('script[type="application/ld+json"]', { element(element) { element.setInnerContent(rendered.schema, { html: true }); } })
      .transform(base);
    return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
  } catch {
    console.error(JSON.stringify({ event: 'cms_read_failed' }));
    return errorResponse(503, '記事を取得できませんでした。時間をおいて再度お試しください。');
  }
}
