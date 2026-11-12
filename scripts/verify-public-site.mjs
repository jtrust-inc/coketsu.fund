import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const { chromium } = require('playwright');
const origin = process.env.LP_TEST_URL || 'http://127.0.0.1:4340';
const production = 'https://coketsu.fund';
const expected = ['/', '/news/', '/features/', '/contact/', '/request/', '/institutional-step1/', '/cooling-off/', '/electronic-document/', '/information-system-policy/', '/privacy-policy/'];
const sitemap = await (await fetch(origin+'/sitemap.xml')).text();
const routes = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>new URL(m[1]).pathname);
assert.deepEqual([...routes].sort(), [...expected].sort());
const robots = await (await fetch(origin+'/robots.txt')).text();
assert.ok(robots.includes('https://coketsu.fund/sitemap.xml'));
const browser = await chromium.launch({channel:'msedge',headless:true});
const report = {origin,checkedAt:new Date().toISOString(),pages:[],missingImages:[],brokenLinks:[],failedResponses:[],checkedAssets:0,mailDelivery:'mocked in separate form tests; no mail sent by this test'};
const routeIds=new Map(), internalLinks=[], assetUrls=new Set();
try {
  for (const width of [390,1440]) for (const route of routes) {
    const page=await browser.newPage({viewport:{width,height:960}});
    await page.route('https://www.googletagmanager.com/**', r=>r.abort());
    await page.route('https://challenges.cloudflare.com/**', r=>r.fulfill({status:200,body:''}));
    page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)report.failedResponses.push({url:r.url(),status:r.status()});});
    const response=await page.goto(origin+route,{waitUntil:'networkidle'});
    assert.equal(response.status(),200,route);
    await page.evaluate(async()=>{await Promise.all([...document.images].map(async i=>{i.loading='eager';await i.decode().catch(()=>{});}));});
    assert.equal(await page.locator('h1').count(),1,route);
    assert.ok(await page.title());
    assert.ok(await page.locator('meta[name="description"]').getAttribute('content'));
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),production+route);
    assert.equal(await page.locator('meta[name="google-site-verification"]').count(),1);
    for(const selector of ['meta[property="og:title"]','meta[property="og:description"]','meta[property="og:image"]','meta[name="twitter:card"]'])assert.equal(await page.locator(selector).count(),1,route+selector);
    for(const parent of ['header','footer'])for(const [href,label]of [['/news/','お知らせ'],['/features/','特集']])assert.equal(await page.locator(`${parent} a[href="${href}"]`).innerText(),label);
    const state=await page.evaluate(()=>({text:document.body.innerText,ids:[...document.querySelectorAll('[id]')].map(x=>x.id),images:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),overflow:document.documentElement.scrollWidth>innerWidth+1,links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')),assets:[...document.querySelectorAll('img[src],script[src],link[rel="stylesheet"]')].map(e=>e.getAttribute('src')||e.getAttribute('href'))}));
    assert.ok(!state.text.includes('\uFFFD'),route+' encoding');
    assert.ok(!state.overflow,route+' overflow '+width);
    assert.equal(new Set(state.ids).size,state.ids.length,route+' duplicate id');
    report.missingImages.push(...state.images);
    routeIds.set(route,new Set(state.ids));
    for(const href of state.links)internalLinks.push({from:route,href});
    for(const asset of state.assets){const u=new URL(asset,origin+route);if(u.origin===new URL(origin).origin)assetUrls.add(u.href);}
    report.pages.push({route,width,status:200,encoding:'passed',metadata:'passed',menus:'passed',overflow:false});
    await page.close();
  }
  for(const {from,href}of internalLinks){
    if(/^(mailto:|tel:|javascript:)/.test(href))continue;
    const url=new URL(href,origin+from);
    if(![new URL(origin).origin,production].includes(url.origin))continue;
    if(routeIds.has(url.pathname)){
      if(url.hash && !routeIds.get(url.pathname).has(decodeURIComponent(url.hash.slice(1))))report.brokenLinks.push({from,href});
    }else if(!/\.[a-z0-9]+$/i.test(url.pathname))report.brokenLinks.push({from,href});
    else assetUrls.add(origin+url.pathname);
  }
  for(const url of assetUrls){const r=await fetch(url);if(!r.ok)report.failedResponses.push({url,status:r.status});}
  assert.equal((await fetch(origin+'/news/2026-11-05-service-notice/')).status,404);
  assert.equal((await fetch(origin+'/verification-does-not-exist-20261112/')).status,404);
  assert.deepEqual(report.missingImages,[]);
  assert.deepEqual(report.brokenLinks,[]);
  assert.deepEqual(report.failedResponses,[]);
  report.checkedAssets=assetUrls.size;
  await mkdir('artifacts/public-site',{recursive:true});
  await writeFile('artifacts/public-site/verification.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({origin,pages:routes.length,viewportChecks:report.pages.length,assets:assetUrls.size,brokenLinks:0,missingImages:0,withdrawnNotice:404}));
}finally{await browser.close();}
