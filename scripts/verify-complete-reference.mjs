import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const {chromium} = require('playwright');
const sharp = require('sharp');
const reference = 'https://coketsu-fund-mobile-nov.jtrust-inc.chatgpt.site/';
const candidate = process.env.LP_TEST_URL || 'http://127.0.0.1:4333/';
const out = 'artifacts/complete-reference';
await mkdir(out,{recursive:true});
const sections = [
  ['header','header'],['hero','.hero'],['about','#about'],['comparison','main > .tint'],
  ['mechanism','#mechanism'],['projects','#projects'],['flow','#flow'],['faq','#faq'],
  ['company','#company'],['footer','footer'],
];
const report = { reference, candidate, checkedAt:new Date().toISOString(),
  intentionalDifferences: [
    'Header/footer: user-requested news, features, investor login and existing legal/contact links retained.',
    'Live form: real confirmation/send, privacy-policy link, honeypot and Turnstile replace non-sending demo note.',
    'Company: capital hidden at explicit user request; existing verified エムズクロス人形町10F address retained.',
  ], results:[], failures:[] };
const browser = await chromium.launch({channel:'msedge',headless:true});
const compact = s=>s.replace(/\s+/g,'');
const check = (condition,message)=>{if(!condition)report.failures.push(message);};
try {
  for(const width of [320,390,768,1440]) {
    const pages = [];
    for(const url of [reference,candidate]) {
      const page = await browser.newPage({viewport:{width,height:960},deviceScaleFactor:1});
      await page.route('https://www.googletagmanager.com/**',r=>r.abort());
      await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({status:200,body:''}));
      await page.goto(url,{waitUntil:'networkidle'});
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(async i=>{i.loading='eager';await i.decode().catch(()=>{});}));});
      pages.push(page);
    }
    const [ref,local] = pages;
    check(await ref.locator('main > section').count()===await local.locator('main > section').count(),`Section count differs at ${width}`);
    check(await ref.locator('form').count()===await local.locator('form').count(),`Form count differs at ${width}`);
    const formShape=page=>page.locator('form').evaluateAll(forms=>forms.map(f=>[...f.querySelectorAll('input')].filter(i=>i.type!=='hidden'&&!i.closest('.astro-honeypot,.cf-turnstile')).map(i=>({type:i.type,placeholder:i.placeholder,required:i.required,value:['radio','checkbox'].includes(i.type)&&i.name!=='privacy_agreed'?i.value:null,label:i.labels?.[0]?.textContent.replace(/\s/g,'')}))));
    // The reference consent checkbox has the default "on" value; the live one has a named consent value.
    const shapes = await Promise.all(pages.map(formShape));
    for(const shape of shapes)for(const form of shape)for(const input of form)if(input.label?.includes('個人情報'))input.value=null;
    check(JSON.stringify(shapes[0])===JSON.stringify(shapes[1]),`Form fields differ at ${width}`);
    const ids=await local.locator('[id]').evaluateAll(es=>es.map(e=>e.id));
    check(new Set(ids).size===ids.length,`Duplicate IDs at ${width}`);
    check(await local.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow at ${width}`);
    check((await local.locator('img').evaluateAll(is=>is.filter(i=>!i.naturalWidth).length))===0,`Missing images at ${width}`);
    await ref.screenshot({path:`${out}/reference-full-${width}.png`,fullPage:true});
    await local.screenshot({path:`${out}/candidate-full-${width}.png`,fullPage:true});
    for(const [name,selector] of sections) {
      const a=ref.locator(selector).first(),b=local.locator(selector).first();
      const text=el=>el.evaluate(el=>{
        const copy=el.cloneNode(true);
        copy.querySelectorAll('.astro-honeypot,.cf-turnstile,.astro-form-status,form>.note').forEach(n=>n.remove());
        if(['HEADER','FOOTER'].includes(el.tagName)) copy.querySelectorAll('a').forEach(link=>{if(['/news/','/features/','/contact/','/privacy-policy/','/cooling-off/'].includes(link.getAttribute('href'))||link.href.includes('invest.coketsu.fund'))link.remove();});
        return copy.textContent;
      });
      let [ta,tb]=await Promise.all([text(a),text(b)]);
      if(name==='company') {
        ta=ta.replace('設立 / 資本金','設立').replace('2017年6月 / 1億円','2017年6月').replace('プライム人形町10F','エムズクロス人形町10F');
      }
      const textEqual=compact(ta)===compact(tb);
      check(textEqual,`${name}: unexpected text difference at ${width}`);
      const assets=el=>el.locator('img').evaluateAll(is=>is.map(i=>({file:i.src.split('/').pop(),alt:i.alt})));
      const [assetsA,assetsB]=await Promise.all([assets(a),assets(b)]);
      check(JSON.stringify(assetsA)===JSON.stringify(assetsB),`${name}: image difference at ${width}`);
      const ab=await a.boundingBox(),bb=await b.boundingBox();
      const geometryEqual=Math.abs(ab.width-bb.width)<1&&Math.abs(ab.height-bb.height)<1;
      // Added operational navigation may wrap; the small-screen header has a narrow-width fit override.
      if(!['header','footer'].includes(name))check(geometryEqual,`${name}: dimensions differ at ${width}: ${ab.height}/${bb.height}`);
      for(const el of [a,b])await el.evaluate(el=>{el.scrollIntoView({behavior:'instant',block:'start'});const y=el.getBoundingClientRect().top;el.style.transform=`translateY(${Math.round(y)-y}px)`;});
      const opts={animations:'disabled',style:name==='header'?'.sticky{visibility:hidden!important}':'header,.sticky{visibility:hidden!important}'};
      const pngA=await a.screenshot({...opts,path:`${out}/reference-${name}-${width}.png`});
      const pngB=await b.screenshot({...opts,path:`${out}/candidate-${name}-${width}.png`});
      const pa=await sharp(pngA).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const pb=await sharp(pngB).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      let pixelDifferencePercent=null;
      if(pa.info.width===pb.info.width&&pa.info.height===pb.info.height){let different=0;for(let i=0;i<pa.data.length;i+=4)if(Math.max(Math.abs(pa.data[i]-pb.data[i]),Math.abs(pa.data[i+1]-pb.data[i+1]),Math.abs(pa.data[i+2]-pb.data[i+2]))>16)different++;pixelDifferencePercent=100*different/(pa.info.width*pa.info.height);}
      const entry={width,name,textEqual,geometryEqual,referenceHeight:ab.height,candidateHeight:bb.height,pixelDifferencePercent};
      if(!textEqual)entry.textDifference={reference:compact(ta),candidate:compact(tb)};
      report.results.push(entry);console.log(JSON.stringify({...entry,textDifference:undefined}));
      for(const el of [a,b])await el.evaluate(el=>el.style.removeProperty('transform'));
    }
    for(const page of pages)await page.close();
  }
  // Verify the files actually used on the page, not only their names.
  const files=['style.css','theme-corporate.css','assets/logo.png','assets/tiger.png','assets/project-fukasawa.png','assets/project-azxia.png','assets/hero-skytree.webp','assets/risk-return-corporate.svg'];
  report.assets=[];
  for(const file of files){const bytes=Buffer.from(await(await fetch(new URL(file,reference))).arrayBuffer());const own=await readFile(`static-assets/assets/nov-2026/${file}`);const same=/\.(css|svg)$/.test(file)?bytes.toString().trim().replace(/\r/g,'')===own.toString().trim().replace(/\r/g,''):bytes.equals(own);check(same,`Asset differs: ${file}`);report.assets.push({file,same});}
  await writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks:report.results.length,failures:report.failures},null,2));
  assert.deepEqual(report.failures,[]);
} finally {await browser.close();}
