import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../dist/', import.meta.url);
const route = '/news/2026-11-05-service-notice/';
const home = await readFile(new URL('index.html', root), 'utf8');
const news = await readFile(new URL('news/index.html', root), 'utf8');
const article = await readFile(new URL('news/2026-11-05-service-notice/index.html', root), 'utf8');
for (const html of [home, news]) assert.ok(html.includes(`href="${route}"`), 'notice must be discoverable');
for (const html of [home, news, article]) {
  const header = /<header\b[\s\S]*?<\/header>/.exec(html)?.[0];
  assert.ok(header?.includes('href="/news/">お知らせ</a>'), 'header news menu missing');
  assert.ok(header?.includes('https://invest.coketsu.fund/#/login'), 'investor login must remain');
}
assert.ok(article.includes('重要なお知らせ'));
assert.ok(article.includes('再開時期は現時点で未定'));
assert.ok(article.includes('報告を受けております'));
assert.ok(article.includes('mailto:support@coketsu.fund'));
assert.ok(article.includes(`<link rel="canonical" href="https://coketsu.fund${route}"`));
assert.equal((article.match(/<h1\b/g) || []).length, 1);
assert.ok(!/３名|3名|大久保|今週中|第9条|第９条|漏えいはありません|被害はありません|�/.test(article));
for (const match of article.matchAll(/(?:href|src)="(\/[^"?#]*)"/g)) {
  if (match[1] === '') continue;
  const ref = match[1].endsWith('/') ? `${match[1]}index.html` : match[1];
  await access(new URL(ref.slice(1), root));
}
const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
assert.ok(sitemap.includes(`https://coketsu.fund${route}`));
console.log('Important notice: discovery, content boundaries, heading, canonical, assets and sitemap passed.');
