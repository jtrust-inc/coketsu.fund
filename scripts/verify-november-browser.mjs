import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const { chromium } = require('playwright');
const base = process.env.LP_TEST_URL || 'http://127.0.0.1:4328';
const reference = 'https://coketsu-fund-mobile-nov.jtrust-inc.chatgpt.site/';
const output = 'artifacts/november-design';
await mkdir(output, {recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
const report = {base,reference,checkedAt:new Date().toISOString(),emailDelivery:'Mocked only; no actual mail sent',viewports:[]};
try {
  for(const width of [320,390,768,1440]) {
    const page = await browser.newPage({viewport:{width,height:960},deviceScaleFactor:1});
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.__cspViolations.push(`${event.effectiveDirective}: ${event.blockedURI}`));
    });
    await page.route('https://www.googletagmanager.com/**', r => r.abort());
    await page.route('https://challenges.cloudflare.com/**', r => r.fulfill({status:200,contentType:'application/javascript',body:''}));
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.evaluate(async()=>{await Promise.all([...document.images].map(async img=>{img.loading='eager';await img.decode().catch(()=>{});}));});
    const structure=await page.evaluate(()=>({
      width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      forms:document.querySelectorAll('form[data-astro-form="request"]').length,
      h1s:document.querySelectorAll('h1').length,
      missingImages:[...document.images].filter(img=>!img.naturalWidth).map(img=>img.src),
      invalidAnchors:[...document.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href')).filter(h=>h.length>1&&!document.getElementById(h.slice(1))),
      title:document.title,
      placeholderForm:document.body.innerText.includes('仮設置'),
    }));
    assert.ok(structure.scrollWidth<=width+1,`Overflow at ${width}: ${structure.scrollWidth}`);
    assert.equal(structure.forms,1);assert.equal(structure.h1s,1);assert.deepEqual(structure.missingImages,[]);assert.deepEqual(structure.invalidAnchors,[]);assert.equal(structure.placeholderForm,false);
    assert.equal(await page.locator('form [name="address"],form [name="your-address"]').count(),0);
    assert.ok((await page.locator('main').innerText()).includes('63,600,000'));
    const companyText = await page.locator('#company').innerText();
    for (const value of ['株式会社ジェイトラスト', '岩本 圭賢', '2017年6月', '1億円', '100名', '03-6690-6652']) assert.ok(companyText.includes(value), `Missing company fact: ${value}`);
    assert.ok(!companyText.includes('松本'));
    const schema = await page.locator('script[type="application/ld+json"]').evaluate(el => JSON.parse(el.textContent));
    assert.equal(schema['@graph'].find(node => node['@type'] === 'Organization').name, '株式会社ジェイトラスト');
    await page.screenshot({path:`${output}/production-${width}.png`,fullPage:true});
    await page.locator('.hero').screenshot({path:`${output}/hero-${width}.png`});
    for(const id of ['hero-inquiry']) {
      const form=page.locator(`#${id}`);
      const fill=async()=>{for(const [name,value] of Object.entries({name:'表示検証',name_kana:'ヒョウジケンショウ',email:'preview-test@example.invalid',phone:'00000000000'}))await form.locator(`[name="${name}"]`).fill(value);await form.locator('[name="privacy_agreed"]').check();};
      await fill();
      await page.route('**/api/forms/request',async route=>{assert.ok(route.request().postData().includes('preview-test@example.invalid'));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:'テスト送信成功'})});});
      await form.getByRole('button',{name:'無料で資料を請求する'}).click();
      await page.waitForFunction(id=>document.querySelector(`#${id} .astro-form-status`).textContent.includes('テスト送信成功'),id);
      assert.equal(await form.locator('[name="name"]').inputValue(),'');
      await page.unroute('**/api/forms/request');await fill();
      await page.route('**/api/forms/request',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'認証を確認できませんでした。'})}));
      await form.getByRole('button',{name:'無料で資料を請求する'}).click();
      await page.waitForFunction(id=>document.querySelector(`#${id} .astro-form-status`).textContent.includes('認証を確認'),id);
      assert.equal(await form.locator('[name="name"]').inputValue(),'表示検証');
      assert.ok(await form.getByRole('button').isEnabled());await page.unroute('**/api/forms/request');
    }
    if(width<=1000){await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.locator('.header-nav a[href="/#about"]').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');}
    await page.locator('#faq summary').first().click();assert.notEqual(await page.locator('#faq details').first().getAttribute('open'),null);
    const cspViolations = await page.evaluate(() => window.__cspViolations);
    assert.deepEqual(cspViolations, []);
    assert.deepEqual(errors,[]);report.viewports.push({...structure,formTests:'both mocked success/error paths passed',pageErrors:errors,cspViolations});
    await page.close();
    if(width===390||width===1440){const ref=await browser.newPage({viewport:{width,height:960}});await ref.goto(reference,{waitUntil:'networkidle'});await ref.evaluate(async()=>{await Promise.all([...document.images].map(async img=>{img.loading='eager';await img.decode().catch(()=>{});}));});await ref.screenshot({path:`${output}/reference-${width}.png`,fullPage:true});await ref.locator('.hero').screenshot({path:`${output}/reference-hero-${width}.png`});await ref.close();}
  }
  await writeFile(`${output}/verification.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
