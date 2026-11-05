import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const { chromium } = require('playwright');
const output = 'artifacts/design-section-review';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
const report = [];
try {
  for(const [label,url] of [['reference','https://coketsu-fund-mobile-nov.jtrust-inc.chatgpt.site/'],['production','https://coketsu.fund/'],['draft','http://127.0.0.1:4328/']]) {
    const page = await browser.newPage({viewport:{width:1280,height:960}});
    await page.route('https://www.googletagmanager.com/**',r=>r.abort());
    await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({status:200,body:''}));
    await page.goto(url,{waitUntil:'networkidle'});
    await page.evaluate(async()=>{await Promise.all([...document.images].map(async img=>{img.loading='eager';await img.decode().catch(()=>{});}));});
    const sections = [];
    for(const [name,selector] of [['about','#about'],['comparison','main > section.tint'],['mechanism','#mechanism'],['projects','#projects'],['flow','#flow'],['faq','#faq'],['footer','footer']]) {
      const el = page.locator(selector).first();
      sections.push({name,text:await el.innerText(),images:await el.locator('img').evaluateAll(imgs=>imgs.map(img=>({src:img.getAttribute('src'),alt:img.alt})))});
      await el.screenshot({path:`${output}/${label}-${name}.png`});
    }
    report.push({label,url,sections});await page.close();
  }
  await writeFile(`${output}/comparison.json`,JSON.stringify(report,null,2));
  console.log('Captured reference, production and draft across seven sections.');
}finally{await browser.close();}
