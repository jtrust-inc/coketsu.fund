import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const require = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const { chromium } = require('playwright');
const base = process.env.LP_TEST_URL || 'http://127.0.0.1:4328';
const loginUrl = 'https://invest.coketsu.fund/#/login';
const browser = await chromium.launch({channel:'msedge',headless:true});
await mkdir('artifacts/login-navigation',{recursive:true});
try {
  for (const width of [320,390,768,1024,1250,1440]) {
    const page = await browser.newPage({viewport:{width,height:960}});
    await page.route('https://www.googletagmanager.com/**',r=>r.abort());
    await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({status:200,body:''}));
    await page.route('https://invest.coketsu.fund/**',r=>r.fulfill({status:200,contentType:'text/html',body:'Login navigation target verified'}));
    await page.goto(base,{waitUntil:'networkidle'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow at ${width}`);
    const login = page.locator('.header-nav .header-login');
    assert.equal(await login.getAttribute('href'),loginUrl);
    assert.equal(await page.locator('footer a[href="'+loginUrl+'"]').count(),1);
    if(width<=1000) await page.locator('.menu-toggle').click();
    assert.ok(await login.isVisible(),`Login hidden at ${width}`);
    const rect = await login.boundingBox();
    assert.ok(rect && rect.x>=0 && rect.x+rect.width<=width+1,`Login clipped at ${width}`);
    await page.screenshot({path:`artifacts/login-navigation/header-${width}.png`});
    await login.click();
    await page.waitForURL(loginUrl);
    console.log(JSON.stringify({width,loginVisible:true,loginNavigation:page.url(),footerLoginPreserved:true}));
    await page.close();
  }
} finally { await browser.close(); }
