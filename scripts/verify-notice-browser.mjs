import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url)('playwright');
const base = process.env.LP_TEST_URL || 'http://127.0.0.1:4332';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [320, 390, 768, 1024, 1250, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    await page.route('https://www.googletagmanager.com/**', r => r.abort());
    await page.route('https://challenges.cloudflare.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.important-notice').count(), 0);
    if (await page.locator('.menu-toggle').isVisible()) await page.locator('.menu-toggle').click();
    const menu = page.locator('.header-nav a[href="/news/"]');
    assert.ok(await menu.isVisible());
    const box = await menu.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1);
    await menu.click();
    await page.waitForURL(`${base}/news/`);
    assert.ok((await page.locator('.entry-body').innerText()).includes('現在、公開中のお知らせはありません。'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const response = await page.request.get(`${base}/news/2026-11-05-service-notice/`);
    assert.equal(response.status(), 404);
    assert.ok(!(await response.text()).includes('Securitize'));
    console.log(JSON.stringify({ width, newsMenu: 'passed', withdrawnNotice: 404 }));
    await page.close();
  }
} finally { await browser.close(); }
