import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const toolkitRequire = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const { chromium } = toolkitRequire('playwright');
const base = process.env.LP_TEST_URL || 'http://127.0.0.1:4321';
const output = 'artifacts/lp-components';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { base, checkedAt: new Date().toISOString(), delivery: 'Mocked browser responses only; no email sent', viewports: [] };
try {
  for (const width of [762, 1200, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    // Local host is not registered with Turnstile. Backend validation is not bypassed.
    await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await Promise.all([...document.images].map(async img => { img.loading = 'eager'; await img.decode().catch(() => {}); })); });
    const structure = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      forms: document.querySelectorAll('form[data-astro-form]').length,
      h1s: document.querySelectorAll('h1').length,
      fullPageImage: !!document.querySelector('img[src="/assets/lp/1009-coketsufund-lp.png"]'),
      missingImages: [...document.images].filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
      sections: [...document.querySelectorAll('main>section')].map(el => ({id: el.id, height: Math.round(el.getBoundingClientRect().height)})),
    }));
    assert.equal(structure.forms, 2); assert.equal(structure.h1s, 1); assert.equal(structure.fullPageImage, false);
    assert.equal(structure.missingImages.length, 0); assert.ok(structure.pageWidth <= structure.viewportWidth + 1, 'Page horizontally overflows');
    if(width === 390) {
      for(const input of await page.locator('.request-panel input:not([type="checkbox"]):not([tabindex="-1"])').all()) {
        const box = await input.boundingBox(); assert.ok(box && box.height >= 44, 'Mobile input must be usable');
      }
    }
    await page.screenshot({ path: `${output}/desktop-${width}.png`, fullPage: true });
    for(const id of ['consultation', 'consultation-bottom']) {
      const form = page.locator(`#${id}`);
      await form.getByLabel('お名前', {exact: true}).fill('表示確認テスト');
      await form.getByLabel('フリガナ', {exact: true}).fill('ヒョウジカクニン');
      await form.getByLabel('メールアドレス', {exact: true}).fill('browser-test@example.invalid');
      await form.getByLabel('電話番号', {exact: true}).fill('00000000000');
      await form.getByLabel('個人情報の取り扱いに同意します。', {exact: true}).check();
      let submitted = false;
      await page.route('**/api/forms/request', async route => {
        submitted = true;
        assert.ok(route.request().postData().includes('browser-test@example.invalid'));
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:'テスト応答：送信完了'})});
      });
      await form.getByRole('button', {name: '無料で資料を請求する'}).click();
      await page.waitForFunction(id => document.querySelector(`#${id} .astro-form-status`).textContent.includes('送信完了'), id);
      assert.ok(submitted); assert.equal(await form.getByLabel('お名前', {exact:true}).inputValue(), '');
      await page.unroute('**/api/forms/request');
      await form.getByLabel('お名前', {exact:true}).fill('エラー表示テスト');
      await form.getByLabel('フリガナ', {exact:true}).fill('エラーテスト');
      await form.getByLabel('メールアドレス', {exact:true}).fill('browser-test@example.invalid');
      await form.getByLabel('電話番号', {exact:true}).fill('00000000000');
      await form.getByLabel('個人情報の取り扱いに同意します。', {exact:true}).check();
      await page.route('**/api/forms/request', route => route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'テスト応答：認証を確認できませんでした。'})}));
      await form.getByRole('button', {name:'無料で資料を請求する'}).click();
      await page.waitForFunction(id => document.querySelector(`#${id} .astro-form-status`).textContent.includes('認証を確認'), id);
      assert.equal(await form.getByLabel('お名前',{exact:true}).inputValue(),'エラー表示テスト');
      assert.equal(await form.getByRole('button',{name:'無料で資料を請求する'}).isEnabled(),true);
      await page.unroute('**/api/forms/request');
    }
    await page.locator('.footer-top').getByRole('button', { name:'よくある質問' }).click();
    assert.ok(await page.locator('#faq-dialog').isVisible());
    assert.ok(await page.locator('#faq-dialog details').count() > 0);
    await page.getByRole('button', {name:'よくある質問を閉じる'}).click();
    await page.locator('.menu summary').click();
    await page.locator('.menu a[href="#about"]').click();
    await page.waitForTimeout(500);
    const anchor = await page.locator('#about').boundingBox(); assert.ok(anchor.y < 100, 'About navigation did not scroll');
    assert.ok(await page.locator('.menu').getAttribute('open') === null);
    report.viewports.push({width, ...structure, forms:'both forms: mocked success resets input; mocked error retains input and re-enables submit', faq:'opened and closed', navigation:'about anchor passed'});
    await page.close();
  }
  await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
