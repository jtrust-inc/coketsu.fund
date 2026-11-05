import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const { chromium } = require('playwright');
const manifest = JSON.parse(await readFile('migration-source/manifest.json', 'utf8'));
for (const origin of ['https://coketsu.fund', 'https://coketsu-fund.system-f78.workers.dev']) {
  for (const page of manifest.pages) {
    const route = new URL(page.url).pathname;
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, origin + route);
    assert.ok(response.headers.get('content-security-policy')?.includes("object-src 'none'"));
    assert.equal(response.headers.get('x-robots-tag'), origin.includes('workers.dev') ? 'noindex, nofollow' : null);
    const html = await response.text();
    assert.equal(html, await readFile(`dist/${page.file}`, 'utf8'), `HTML build parity ${origin}${route}`);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema['@graph'].find(node => node['@type'] === 'Organization').name, '株式会社ジェイトラスト');
  }
  const badOrigin = await fetch(origin + '/api/forms/request', { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=verification' });
  assert.equal(badOrigin.status, 403);
  const tokenless = await fetch(origin + '/api/forms/request', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=verification' });
  assert.equal(tokenless.status, 400);
  assert.equal(tokenless.headers.get('cache-control'), 'no-store');
  console.log(JSON.stringify({ origin, pages: 9, htmlMatchesBuild: true, organization: '株式会社ジェイトラスト', cspEnforced: true, crossOrigin: 403, tokenless: 400, realEmailSent: false }));
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', event => window.__violations.push(`${event.effectiveDirective}: ${event.blockedURI}`));
  });
  await page.goto('https://coketsu.fund/?review=5c9eea1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.turnstile !== 'undefined');
  await page.evaluate(() => document.fonts.ready);
  const actual = await page.evaluate(() => ({ cspViolations: window.__violations, gaInitialized: typeof window.gtag === 'function', turnstileLoaded: typeof window.turnstile !== 'undefined', representative: document.querySelector('#company').innerText.includes('岩本 圭賢') }));
  assert.deepEqual(actual.cspViolations, []);
  assert.ok(actual.gaInitialized && actual.turnstileLoaded && actual.representative);
  console.log(JSON.stringify({ productionBrowser: actual, realEmailSent: false }));
} finally { await browser.close(); }
