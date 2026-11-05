import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../dist/', import.meta.url);
const route = '/news/2026-11-05-service-notice/';
const home = await readFile(new URL('index.html', root), 'utf8');
const news = await readFile(new URL('news/index.html', root), 'utf8');
const features = await readFile(new URL('features/index.html', root), 'utf8');
await assert.rejects(access(new URL('news/2026-11-05-service-notice/index.html', root)), { code: 'ENOENT' });
for (const html of [home, news, features]) {
  assert.ok(!html.includes(route), 'withdrawn notice must not be linked');
  assert.ok(!html.includes('Securitize'), 'withdrawn notice must not be rendered');
  const header = /<header\b[\s\S]*?<\/header>/.exec(html)?.[0];
  assert.ok(header?.includes('href="/news/">お知らせ</a>'), 'header news menu missing');
  assert.ok(header?.includes('href="/features/">特集</a>'), 'header features menu missing');
  const footer = /<footer\b[\s\S]*?<\/footer>/.exec(html)?.[0];
  assert.ok(footer?.includes('href="/features/">特集</a>'), 'footer features menu missing');
  assert.ok(header?.includes('https://invest.coketsu.fund/#/login'), 'investor login must remain');
}
assert.ok(news.includes('現在、公開中のお知らせはありません。'));
const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
assert.ok(!sitemap.includes(route));
assert.ok(sitemap.includes('https://coketsu.fund/features/'));
assert.ok(features.includes('現在、公開中の特集はありません。'));
assert.ok(features.includes('<link rel="canonical" href="https://coketsu.fund/features/"'));
assert.equal((features.match(/<h1\b/g) || []).length, 1);
console.log('Withdrawal verified: article absent; no banner, listing or sitemap entry; news/login menu retained.');
