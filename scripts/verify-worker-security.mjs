import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Pure handler tests: every provider call is intercepted; no credentials or mail.
const source = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const calls = [];
let turnstile = { success: true, action: 'request', hostname: 'coketsu.fund' };
let limited = false;
let mailStatus = 202;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith('/siteverify')) return Response.json(turnstile);
  if (String(url).endsWith('/token')) {
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ access_token: 'test-only-not-a-credential', expires_in: 3600 });
  }
  if (String(url).endsWith('/sendMail')) return new Response(null, { status: mailStatus });
  throw new Error(`Unexpected network destination: ${url}`);
};
const env = {
  ASSETS: { fetch: async () => new Response('<html>test</html>', { headers: { 'content-type': 'text/html' } }) },
  FORM_RATE_LIMITER: { limit: async () => ({ success: !limited }) },
  TURNSTILE_SECRET: 'test-only', GRAPH_TENANT_ID: 'test-tenant', GRAPH_CLIENT_ID: 'test-client',
  GRAPH_CLIENT_SECRET: 'test-only', GRAPH_SENDER_EMAIL: 'sender@example.invalid', FORM_RECIPIENT_EMAIL: 'recipient@example.invalid',
};
const send = async ({ body = 'email=test%40example.invalid&cf-turnstile-response=test', headers = {}, host = 'coketsu.fund', action = 'request' } = {}) => worker.fetch(new Request(`https://${host}/api/forms/${action}`, {
  method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(body)), origin: `https://${host}`, ...headers },
}), env);
try {
  assert.equal((await send({ host: 'evil.invalid' })).status, 403);
  assert.equal((await send({ headers: { origin: 'https://evil.invalid' } })).status, 403);
  assert.equal((await send({ headers: { origin: 'null' } })).status, 403);
  assert.equal((await send({ headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await send({ headers: { 'content-length': '' } })).status, 411);
  assert.equal((await send({ body: 'x'.repeat(65537) })).status, 413);
  assert.equal((await send({ body: 'x'.repeat(65537), headers: { 'content-length': '1' } })).status, 413);
  assert.equal((await send({ headers: { 'content-type': 'application/json' } })).status, 415);
  limited = true;
  assert.equal((await send()).status, 429);
  limited = false;
  assert.equal((await send({ body: 'name=test' })).status, 400);
  assert.equal((await send({ body: 'company-url=spam' })).status, 200);
  assert.equal(calls.length, 0, 'Rejected requests must not contact providers');
  turnstile = { success: true, action: 'contact', hostname: 'coketsu.fund' };
  assert.equal((await send()).status, 400);
  turnstile = { success: true, action: 'request', hostname: 'evil.invalid' };
  assert.equal((await send()).status, 400);
  turnstile = { success: false, action: 'request', hostname: 'coketsu.fund' };
  assert.equal((await send()).status, 400);
  assert.ok(calls.every(call => call.url.endsWith('/siteverify')));
  for (const action of ['contact', 'request', 'institutional']) {
    for (const host of ['coketsu.fund', 'coketsu-fund.system-f78.workers.dev']) {
      turnstile = { success: true, action, hostname: host };
      const response = await send({ action, host, body: 'email=test%40example.invalid&name=%3Cscript%3Ebad%3C%2Fscript%3E&cf-turnstile-response=test' });
      assert.equal(response.status, 200);
      const mail = JSON.parse(calls.at(-1).init.body).message;
      assert.equal(mail.toRecipients[0].emailAddress.address, 'recipient@example.invalid');
      assert.ok(mail.body.content.includes('&lt;script&gt;bad&lt;/script&gt;'));
      assert.ok(!mail.body.content.includes('<script>'));
      assert.equal(mail.replyTo[0].emailAddress.address, 'test@example.invalid');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  const multipart = new FormData();
  multipart.set('email', 'test@example.invalid'); multipart.set('cf-turnstile-response', 'test');
  multipart.set('request_material', '資料請求');
  multipart.set('request_consultation', '無料相談');
  multipart.set('investment_experience', 'なし');
  const encoded = new Response(multipart);
  const body = await encoded.text();
  turnstile = { success: true, action: 'request', hostname: 'coketsu.fund' };
  assert.equal((await send({ body, headers: { 'content-type': encoded.headers.get('content-type') } })).status, 200);
  const requestMail = JSON.parse(calls.at(-1).init.body).message.body.content;
  for (const value of ['request_material', '資料請求', 'request_consultation', '無料相談', 'investment_experience', 'なし']) assert.ok(requestMail.includes(value), `Mail must preserve ${value}`);
  mailStatus = 503;
  const failed = await send();
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes('Graph'));
  const method = await worker.fetch(new Request('https://coketsu.fund/api/forms/request'), env);
  assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'POST');
  for (const host of ['coketsu.fund', 'coketsu-fund.system-f78.workers.dev']) {
    const response = await worker.fetch(new Request(`https://${host}/`), env);
    assert.ok(response.headers.get('content-security-policy').includes("object-src 'none'"));
    assert.equal(response.headers.get('content-security-policy-report-only'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-robots-tag'), host.endsWith('.workers.dev') ? 'noindex, nofollow' : null);
  }
  console.log('Worker security checks passed: origin, actual/declared size, method, rate, Turnstile gates, multipart/urlencoded delivery, escaping, provider errors, headers and preview noindex. All provider calls mocked; no real mail sent.');
} finally { globalThis.fetch = originalFetch; }
