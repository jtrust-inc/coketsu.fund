import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { loadCatalog, normalizeArticle } from '../worker/cms-catalog.mjs';
import { renderArticle } from '../worker/articles.mjs';

const raw = { id: 'published-test', title: '動作確認 <script>title</script>', body: '<p>公開記事</p><h2>見出し</h2><script>alert(1)</script><img src="https://evil.invalid/a" onerror="alert(1)"><a href="javascript:alert(1)">危険リンク</a><iframe src="https://evil.invalid"></iframe>', publishedAt: '2026-01-01T00:00:00Z', revisedAt: '2026-01-02T00:00:00Z' };
const article = normalizeArticle(raw, 'news');
assert.ok(article.body.includes('<h2>見出し</h2>'));
for (const text of ['<script', 'onerror', 'javascript:', '<iframe', 'evil.invalid']) assert.ok(!article.body.includes(text), text);
for (const mutation of [{ id: '../secret' }, { publishedAt: null }, { publishedAt: '2999-01-01' }, { body: '<script>no body</script>' }, { body: 'x'.repeat(250001) }]) assert.throws(() => normalizeArticle({ ...raw, ...mutation }, 'news'));
assert.equal(normalizeArticle({ ...raw, eyecatch: { url: 'https://images.microcms-assets.io.evil.invalid/a' } }, 'news').image, null);
const env = { MICROCMS_SERVICE_DOMAIN: 'coketsu-fund', MICROCMS_API_KEY: 'local-fixture-not-a-secret' };
assert.equal((await loadCatalog({}, undefined, () => { throw new Error('No network when disabled'); })).configured, false);
await assert.rejects(loadCatalog({ ...env, MICROCMS_SERVICE_DOMAIN: 'evil.invalid/' }));
await assert.rejects(loadCatalog(env, ['private']));
const calls = [];
const pageFetcher = async (url, init) => {
  calls.push(url);
  assert.equal(url.origin, 'https://coketsu-fund.microcms.io');
  assert.equal(init.redirect, 'manual'); assert.ok(init.signal instanceof AbortSignal);
  assert.equal(url.searchParams.has('draftKey'), false);
  const offset = Number(url.searchParams.get('offset'));
  return Response.json({ totalCount: 101, contents: offset ? [{ ...raw, id: 'last' }] : Array.from({ length: 100 }, (_, i) => ({ ...raw, id: `item-${i}` })) });
};
assert.equal((await loadCatalog(env, ['news'], pageFetcher)).articles.length, 101);
assert.deepEqual(calls.map(url => url.searchParams.get('offset')), ['0', '100']);
const forbidden = { ...raw, id: '2026-11-05-service-notice', title: 'MUST NOT APPEAR' };
assert.equal((await loadCatalog(env, ['news'], async () => Response.json({ totalCount: 1, contents: [forbidden] }))).articles.length, 0);
for (const response of [Response.json({ totalCount: 1, contents: [] }), Response.json({ totalCount: 2, contents: [raw, raw] }), Response.json({ totalCount: 1001, contents: [] }), new Response('denied', { status: 401 }), new Response('x'.repeat(5 * 1024 * 1024 + 1))]) {
  await assert.rejects(loadCatalog(env, ['news'], async () => response));
}
const rendered = renderArticle({ articles: [article] }, 'news', article.id);
assert.ok(rendered.content.includes('&lt;script&gt;title&lt;/script&gt;'));
assert.ok(!rendered.schema.includes('<script'));
assert.equal(JSON.parse(rendered.schema)['@graph'].find(x => x['@type'] === 'Article').headline, raw.title);

// Real workerd/HTMLRewriter execution, all outbound CMS requests mocked.
// Uses the simulator/bundler versions already locked with Wrangler.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
// Use exactly Wrangler's packaged output, including its Node compatibility shims.
execFileSync(process.execPath, [resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js'), 'deploy', '--dry-run', '--config', 'wrangler.jsonc', '--outdir', 'artifacts/cms-worker'], { stdio: 'pipe', windowsHide: true });
const bundle = await readFile('artifacts/cms-worker/index.js', 'utf8');
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
const templates = Object.fromEntries(await Promise.all(['news', 'features'].map(async key => [key, await readFile(`dist/${key}/index.html`, 'utf8')])));
const sitemap = await readFile('dist/sitemap.xml', 'utf8');
let published = [raw, forbidden]; let upstreamStatus = 200; let upstreamCalls = 0;
const options = {
  modules: true, script: bundle,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
  bindings: env,
  serviceBindings: { ASSETS: async request => {
    const path = new URL(request.url).pathname;
    if (path === '/sitemap.xml') return new Response(sitemap, { headers: { 'content-type': 'application/xml' } });
    const key = path.split('/')[1];
    if (templates[key] && path === `/${key}/`) return new Response(templates[key], { headers: { 'content-type': 'text/html; charset=utf-8', etag: 'static-template' } });
    return new Response(path === '/' ? 'HOME UNCHANGED' : 'NOT FOUND', { status: path === '/' ? 200 : 404 });
  } },
  outboundService: async request => {
    upstreamCalls++;
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://coketsu-fund.microcms.io');
    assert.equal(request.headers.get('X-MICROCMS-API-KEY'), env.MICROCMS_API_KEY);
    assert.equal(url.searchParams.has('draftKey'), false);
    return new Response(JSON.stringify({ totalCount: published.length, contents: published }), { status: upstreamStatus, headers: { 'content-type': 'application/json' } });
  },
};
const mf = new Miniflare(convertV4MiniflareOptions(options));
try {
  const home = await mf.dispatchFetch('https://coketsu.fund/');
  assert.equal(await home.text(), 'HOME UNCHANGED'); assert.equal(upstreamCalls, 0);
  const list = await mf.dispatchFetch('https://coketsu.fund/news/');
  const listing = await list.text();
  assert.equal(list.status, 200); assert.ok(listing.includes('/news/published-test/')); assert.ok(!listing.includes('MUST NOT APPEAR'));
  assert.ok(listing.includes('/features/')); assert.ok(listing.includes('invest.coketsu.fund'));
  assert.equal(list.headers.get('cache-control'), 'no-store'); assert.equal(list.headers.get('etag'), null);
  for (const host of ['coketsu.fund', 'coketsu-fund.system-f78.workers.dev']) {
    const result = await mf.dispatchFetch(`https://${host}/news/published-test/?draftKey=do-not-forward`);
    const html = await result.text();
    assert.equal(result.status, 200); assert.ok(html.includes('https://coketsu.fund/news/published-test/'));
    assert.ok(html.includes('application/ld+json')); assert.ok(html.includes('/assets/articles.css'));
    assert.ok(!html.includes(env.MICROCMS_API_KEY));
    assert.ok(html.includes('<h1>動作確認 &lt;script&gt;title&lt;/script&gt;</h1>'));
    assert.ok(!html.includes('</title><script>'));
    assert.ok(result.headers.get('content-security-policy').includes("object-src 'none'"));
    assert.equal(result.headers.get('x-robots-tag'), host.endsWith('.workers.dev') ? 'noindex, nofollow' : null);
  }
  const beforeWithdrawn = upstreamCalls;
  assert.equal((await mf.dispatchFetch('https://coketsu.fund/news/2026-11-05-service-notice/')).status, 404);
  assert.equal(upstreamCalls, beforeWithdrawn);
  assert.equal((await mf.dispatchFetch('https://coketsu.fund/news/missing/')).status, 404);
  assert.equal((await mf.dispatchFetch('https://coketsu.fund/news', { redirect: 'manual' })).status, 308);
  assert.equal((await mf.dispatchFetch('https://coketsu.fund/news/', { method: 'POST' })).status, 405);
  assert.equal(await (await mf.dispatchFetch('https://coketsu.fund/news/published-test/', { method: 'HEAD' })).text(), '');
  const xml = await (await mf.dispatchFetch('https://coketsu.fund/sitemap.xml')).text();
  assert.ok(xml.includes('/news/published-test/')); assert.ok(xml.includes('/features/published-test/')); assert.ok(!xml.includes(forbidden.id));
  published = [];
  assert.equal((await mf.dispatchFetch('https://coketsu.fund/news/published-test/')).status, 404, 'Unpublish removes detail immediately');
  assert.equal(await (await mf.dispatchFetch('https://coketsu.fund/news/')).text(), templates.news, 'Empty list retains approved UI');
  assert.ok(!(await (await mf.dispatchFetch('https://coketsu.fund/sitemap.xml')).text()).includes('/news/published-test/'));
  upstreamStatus = 503;
  const failed = await mf.dispatchFetch('https://coketsu.fund/news/');
  assert.equal(failed.status, 503); assert.equal(failed.headers.get('cache-control'), 'no-store'); assert.ok(!(await failed.text()).includes(env.MICROCMS_API_KEY));
  await mf.setOptions(convertV4MiniflareOptions({ ...options, bindings: { MICROCMS_SERVICE_DOMAIN: env.MICROCMS_SERVICE_DOMAIN } }));
  const beforeDisabled = upstreamCalls;
  assert.equal(await (await mf.dispatchFetch('https://coketsu.fund/news/')).text(), templates.news);
  assert.equal(await (await mf.dispatchFetch('https://coketsu.fund/features/')).text(), templates.features);
  assert.equal(await (await mf.dispatchFetch('https://coketsu.fund/sitemap.xml')).text(), sitemap);
  assert.equal(upstreamCalls, beforeDisabled, 'No CMS calls before secret registration');
} finally { await mf.dispose(); }
console.log('CMS checks passed: disabled passthrough, published-only pagination, sanitization, limits, withdrawal, SEO/sitemap, real HTMLRewriter, immediate unpublish, fail-closed errors. All upstream calls mocked; no content published and no email sent.');
