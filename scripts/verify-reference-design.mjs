import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const { chromium } = require('playwright');
const base = process.env.LP_TEST_URL || 'http://127.0.0.1:4328/';
const reference = 'https://coketsu-fund-mobile-nov.jtrust-inc.chatgpt.site/';
const out='artifacts/reference-match';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={base,reference,checkedAt:new Date().toISOString(),sections:[],pages:[]};
const setup=async(width,url)=>{const page=await browser.newPage({viewport:{width,height:960},deviceScaleFactor:1});await page.route('https://www.googletagmanager.com/**',r=>r.abort());await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({status:200,body:''}));await page.goto(url,{waitUntil:'networkidle'});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(async i=>{i.loading='eager';await i.decode().catch(()=>{});}));});return page;};
try{
  for(const width of [390,1440]){
    const ref=await setup(width,reference),local=await setup(width,base);
    assert.equal(await local.locator('img[src*="/assets/lp/reference/mechanism"],img[src*="/assets/lp/reference/operation"],img[src*="/assets/lp/reference/priority"]').count(),0);
    assert.equal(await local.locator('#flow article').count(),6);
    assert.equal(await local.locator('form').count(),1);
    for(const [name,selector] of [['risk-chart','.risk-return'],['comparison','main > section.tint'],['mechanism','#mechanism'],['flow','#flow'],['faq','#faq']]){
      const a=ref.locator(selector).first(),b=local.locator(selector).first();
      assert.equal((await a.innerText()).replace(/\s+/g,' ').trim(),(await b.innerText()).replace(/\s+/g,' ').trim(),`${name} text differs`);
      const options={animations:'disabled',style:'header,.sticky{visibility:hidden!important}'};
      // Different real-form heights place later sections on fractional pixels.
      // Align only the screenshot origin, not layout or content, for raster comparison.
      for(const element of [a,b]) await element.evaluate(el=>{el.scrollIntoView({behavior:'instant',block:'start'});const y=el.getBoundingClientRect().top;el.style.transform=`translateY(${Math.round(y)-y}px)`;});
      const ar=await a.screenshot({...options,path:`${out}/reference-${name}-${width}.png`});
      const br=await b.screenshot({...options,path:`${out}/candidate-${name}-${width}.png`});
      const ab=await a.boundingBox(),bb=await b.boundingBox();
      assert.ok(Math.abs(ab.width-bb.width)<1&&Math.abs(ab.height-bb.height)<1,`${name} geometry differs at ${width}: ${JSON.stringify({ab,bb})}`);
      report.sections.push({name,width,textMatch:true,geometryMatch:true,screenshotOriginAligned:true,screenshotBytesEqual:ar.equals(br)});
      for(const element of [a,b]) await element.evaluate(el=>el.style.removeProperty('transform'));
    }
    await ref.close();await local.close();
  }
  for(const route of (process.env.LP_SECTIONS_ONLY ? [] : ['news','contact','request','institutional-step1','cooling-off','electronic-document','information-system-policy','privacy-policy'])){
    for(const width of [320,1440]){
      const page=await setup(width,new URL(`/${route}/`,base).href);
      const info=await page.evaluate(()=>({h1s:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth+1,legacyCss:[...document.querySelectorAll('link[rel=stylesheet]')].some(l=>l.href.includes('wp-content/themes')),brokenImages:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),forms:[...document.forms].map(f=>({action:f.getAttribute('action'),fields:[...f.elements].filter(e=>e.name).map(e=>e.name)})),text:document.querySelector('.site-body').textContent.replace(/\s+/g,' ').trim()}));
      assert.equal(info.h1s,1);assert.equal(info.overflow,false,`${route} overflow at ${width}`);assert.equal(info.legacyCss,false);assert.deepEqual(info.brokenImages,[]);
      assert.equal(await page.locator('.header-login').getAttribute('href'),'https://invest.coketsu.fund/#/login');
      if(!process.env.LP_TEST_URL){const prod=await setup(width,`https://coketsu.fund/${route}/`);const before=await prod.locator('.site-body').textContent();assert.equal(info.text,before.replace(/\s+/g,' ').trim(),`${route} content changed`);const fields=await prod.locator('form').evaluateAll(fs=>fs.map(f=>({action:f.getAttribute('action'),fields:[...f.elements].filter(e=>e.name).map(e=>e.name)})));assert.deepEqual(info.forms,fields,`${route} form contract changed`);await prod.close();}
      await page.screenshot({path:`${out}/${route}-${width}.png`,fullPage:true});
      report.pages.push({route,width,...info,text:undefined});await page.close();
    }
  }
  await writeFile(`${out}/${process.env.LP_SECTIONS_ONLY ? 'sections-only' : 'verification'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
