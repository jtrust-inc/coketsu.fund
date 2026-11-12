// Coketsu-only operational helper. Uses existing CLI credentials in memory;
// never writes or logs credentials, changes roles, DNS, Worker secrets or other sites.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const account='f7855b57218e661ad2086c61e7a06518';
const database='587673a4-4459-4dc1-93e5-b7c4bf73ba4b';
const queue='3bb0b0812fd24b3c900617815f68e37e';
const siteId='coketsu-fund';
const mode=process.argv[2]||'inspect';
assert.ok(['inspect','start','result'].includes(mode));
const config=await readFile(join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8');
const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw new Error('Existing Wrangler authentication unavailable');
async function api(path,body){
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  const value=await r.json();
  if(!r.ok||value.success!==true)throw new Error(`Cloudflare operation failed HTTP ${r.status}; error codes ${value.errors?.map(e=>e.code).join(',')||'unknown'}`);
  return value.result;
}
async function query(sql,params=[]){const r=await api(`/d1/database/${database}/query`,{sql,params});assert.ok(r.every(x=>x.success));return r[0];}
const sites=(await query('SELECT id,name,company_name,production_url,preview_url,last_deployed_at FROM sites WHERE id=?',[siteId])).results;
assert.equal(sites.length,1);
assert.equal(sites[0].production_url,'https://coketsu.fund/');
assert.equal(sites[0].preview_url,'https://coketsu-fund.system-f78.workers.dev/');
await mkdir('artifacts/site-control',{recursive:true});
if(mode==='inspect')console.log(JSON.stringify(sites[0]));
if(mode==='start'){
  const deployedAt=process.argv[3];
  assert.ok(deployedAt && Number.isFinite(Date.parse(deployedAt)),'Verified deployment timestamp required');
  const queueInfo=await api(`/queues/${queue}`);
  assert.equal(queueInfo.queue_name,'jt-site-audits');
  const pending=await query("SELECT id FROM audits WHERE site_id=? AND status IN ('queued','running')",[siteId]);
  assert.equal(pending.results.length,0,'An audit is already running; inspect it before creating another');
  const request={auditId:crypto.randomUUID(),siteId,baseUrl:sites[0].production_url,comparisonUrl:sites[0].preview_url,requestedAt:new Date().toISOString(),checks:['seo','llmo','structure','content'],maxPages:100};
  await writeFile('artifacts/site-control/request.json',JSON.stringify(request,null,2));
  const update=await query('UPDATE sites SET company_name=?,last_deployed_at=?,updated_at=? WHERE id=? AND production_url=?',['株式会社ジェイトラスト',deployedAt,request.requestedAt,siteId,sites[0].production_url]);
  assert.equal(update.meta.changes,1);
  await query("INSERT INTO audits (id,site_id,status,requested_at) VALUES (?,?,'queued',?)",[request.auditId,siteId,request.requestedAt]);
  try{await api(`/queues/${queue}/messages`,{body:request,content_type:'json'});}
  catch(error){await query("UPDATE audits SET status='failed',error_message='Queue submission failed; not automatically retried',completed_at=? WHERE id=? AND site_id=?",[new Date().toISOString(),request.auditId,siteId]);throw error;}
  console.log(JSON.stringify({siteId,auditId:request.auditId,status:'queued',metadataUpdated:true}));
}
if(mode==='result'){
  const {auditId}=JSON.parse(await readFile('artifacts/site-control/request.json','utf8'));
  const result=(await query('SELECT id,status,completed_at,seo_score,llmo_score,structure_score,clone_score,comparison_json,report_markdown,error_message FROM audits WHERE id=? AND site_id=?',[auditId,siteId])).results[0];
  assert.ok(result);
  const issues=(await query('SELECT related_url,severity,title,evidence FROM issues WHERE audit_id=? AND site_id=?',[auditId,siteId])).results;
  await writeFile('artifacts/site-control/result.json',JSON.stringify({result,issues},null,2));
  const comparison=result.comparison_json?JSON.parse(result.comparison_json):null;
  console.log(JSON.stringify({auditId,status:result.status,completedAt:result.completed_at,seo:result.seo_score,llmo:result.llmo_score,structure:result.structure_score,clone:result.clone_score,pages:comparison?.sourcePages??null,issues:issues.length,error:result.error_message}));
}
