import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url)('playwright');
const root = 'artifacts/full-reference';
await mkdir(root, {recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
const report = [];
try {
  for (const [label,url] of [['reference','https://coketsu-fund-mobile-nov.jtrust-inc.chatgpt.site/'],['candidate',process.env.LP_TEST_URL || 'https://coketsu.fund/']]) {
    const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    await page.route('https://www.googletagmanager.com/**',r=>r.abort());
    await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({status:200,body:''}));
    await page.goto(url,{waitUntil:'networkidle'});
    await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(async i=>{i.loading='eager'; await i.decode().catch(()=>{});}));});
    const data = await page.evaluate(()=>({
      title:document.title,
      styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(el=>el.href),
      sections:[...document.querySelectorAll('main > section,header,footer')].map((el,index)=>({index,tag:el.tagName,id:el.id,classes:el.className,text:el.textContent.replace(/\s+/g,' ').trim(),html:el.outerHTML,rect:{width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height},images:[...el.querySelectorAll('img')].map(i=>({src:i.src,alt:i.alt}))})),
      forms:[...document.forms].map(f=>({id:f.id,action:f.action,html:f.outerHTML,fields:[...f.elements].map(e=>({name:e.name,type:e.type,required:e.required,label:e.labels?.[0]?.textContent?.trim()}))})),
      images:[...document.images].map(i=>({src:i.src,alt:i.alt})),
    }));
    await writeFile(`${root}/${label}.json`,JSON.stringify(data,null,2));
    await writeFile(`${root}/${label}.html`,await page.content());
    for(const width of [390,1440]) {
      await page.setViewportSize({width,height:1000});
      await page.screenshot({path:`${root}/${label}-${width}.png`,fullPage:true});
      for (let i=0;i<data.sections.length;i++) {
        const el=page.locator('main > section,header,footer').nth(i);
        await el.screenshot({path:`${root}/${label}-${width}-section-${i}.png`,animations:'disabled',style:i===0?'.sticky{visibility:hidden!important}':'header,.sticky{visibility:hidden!important}'});
      }
    }
    report.push({label,url,title:data.title,styles:data.styles,sections:data.sections.map(({html,images,...s})=>({...s,images})),forms:data.forms.map(({html,...f})=>f)});
    await page.close();
  }
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
