import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const route of ['contact','request','institutional-step1']){
 const page=await browser.newPage({viewport:{width:390,height:960}});
 await page.route('https://www.googletagmanager.com/**',r=>r.abort());await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({status:200,body:''}));
 let status=200,calls=0;await page.route('**/api/forms/**',r=>{calls++;return r.fulfill({status,contentType:'application/json',body:JSON.stringify({message:status===200?'検証成功':'検証エラー'})});});
 await page.goto(new URL(`/${route}/`,process.env.LP_TEST_URL||'http://127.0.0.1:4328').href,{waitUntil:'networkidle'});
 const form=page.locator('form[data-astro-form]');
 const fill=async()=>{for(const input of await form.locator('input:not([type=submit]):not([type=hidden]),textarea,select').all()){
  const name=await input.getAttribute('name');if(name==='company-url'||!name)continue;
  const tag=await input.evaluate(e=>e.tagName),type=await input.getAttribute('type');
  if(tag==='SELECT'){await input.selectOption({index:1});continue;}
  if(type==='checkbox'||type==='radio'){await input.check();continue;}
  await input.fill(type==='email'?'test@example.invalid':type==='number'||type==='tel'||/number|postal/.test(name)?'1234567':'テスト');
 }};
 await fill();await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.astro-form-status').textContent==='検証成功');assert.equal(calls,1);
 status=400;await fill();await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.astro-form-status').textContent==='検証エラー');assert.equal(calls,2);assert.ok(await form.locator('[type=submit]').isEnabled());
 console.log(JSON.stringify({route,mockedSuccessAndError:true,realEmailSent:false}));await page.close();
}}finally{await browser.close();}
