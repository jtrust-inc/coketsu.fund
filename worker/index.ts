interface Env {
  ASSETS: Fetcher;
  FORM_RATE_LIMITER: RateLimit;
  TURNSTILE_SECRET: string;
  GRAPH_TENANT_ID?: string;
  GRAPH_CLIENT_ID?: string;
  GRAPH_CLIENT_SECRET?: string;
  GRAPH_SENDER_EMAIL?: string;
  FORM_RECIPIENT_EMAIL?: string;
}

const HOSTS = new Set(["coketsu.fund", "coketsu-fund.system-f78.workers.dev"]);
const ACTIONS = new Set(["contact", "request", "institutional"]);
const MAX_BODY_BYTES = 64 * 1024;
const SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com",
  "connect-src 'self' https://challenges.cloudflare.com https://www.google-analytics.com https://region1.google-analytics.com",
  "frame-src https://challenges.cloudflare.com",
].join("; ");
let graphToken: { value: string; expiresAt: number } | undefined;

function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("strict-transport-security", "max-age=86400");
  headers.set("content-security-policy-report-only", SECURITY_POLICY);
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "SAMEORIGIN");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const json = (body: unknown, status = 200) => withSecurityHeaders(new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
}));

function safeFields(data: FormData) {
  const fields: Record<string, string> = {};
  for (const [key, raw] of data.entries()) {
    if (key === "cf-turnstile-response" || key === "company-url" || key.startsWith("_")) continue;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) continue;
    const value = typeof raw === "string" ? raw.trim() : raw.name;
    fields[key] = value.slice(0, 4000);
  }
  return fields;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] || char));

async function getGraphToken(env: Env) {
  if (graphToken && graphToken.expiresAt > Date.now() + 60_000) return graphToken.value;
  if (!env.GRAPH_TENANT_ID || !env.GRAPH_CLIENT_ID || !env.GRAPH_CLIENT_SECRET) throw new Error("Graph configuration is incomplete");
  const body = new URLSearchParams({
    client_id: env.GRAPH_CLIENT_ID,
    client_secret: env.GRAPH_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Graph authentication failed: ${response.status}`);
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error("Graph authentication returned no access token");
  graphToken = { value: result.access_token, expiresAt: Date.now() + Math.max(300, result.expires_in || 3600) * 1000 };
  return graphToken.value;
}

async function sendFormMail(env: Env, action: string, fields: Record<string, string>) {
  if (!env.GRAPH_SENDER_EMAIL || !env.FORM_RECIPIENT_EMAIL) throw new Error("Mail configuration is incomplete");
  const token = await getGraphToken(env);
  const rows = Object.entries(fields).map(([key, value]) =>
    `<tr><th style="text-align:left;vertical-align:top;padding:6px 12px 6px 0">${escapeHtml(key)}</th><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
  ).join("");
  const replyAddress = fields.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email) ? fields.email : undefined;
  const message = {
    subject: `【Coketsu fund】${action}フォーム送信通知`,
    body: { contentType: "HTML", content: `<p>Coketsu fund のフォームから送信がありました。</p><table>${rows}</table>` },
    toRecipients: [{ emailAddress: { address: env.FORM_RECIPIENT_EMAIL } }],
    ...(replyAddress ? { replyTo: [{ emailAddress: { address: replyAddress } }] } : {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.GRAPH_SENDER_EMAIL)}/sendMail`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Graph sendMail failed: ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyTurnstile(request: Request, env: Env, token: string, action: string) {
  if (!token || token.length > 2048 || !env.TURNSTILE_SECRET) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: controller.signal });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean; action?: string; hostname?: string };
    return result.success === true && result.action === action && !!result.hostname && HOSTS.has(result.hostname);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleForm(request: Request, env: Env, action: string) {
  const url = new URL(request.url);
  if (!HOSTS.has(url.hostname)) return json({ message: "許可されていない送信元です。" }, 403);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateLimit = await env.FORM_RATE_LIMITER.limit({ key: `${ip}:${action}` });
  if (!rateLimit.success) return json({ message: "送信回数が多すぎます。時間をおいて再度お試しください。" }, 429);
  const lengthHeader = request.headers.get("content-length");
  const length = Number(lengthHeader);
  if (!lengthHeader || !Number.isFinite(length) || length < 0) return json({ message: "入力サイズを確認できません。" }, 411);
  if (length > MAX_BODY_BYTES) return json({ message: "入力内容が大きすぎます。" }, 413);
  const type = request.headers.get("content-type") || "";
  if (!type.includes("multipart/form-data") && !type.includes("application/x-www-form-urlencoded")) return json({ message: "不正な形式です。" }, 415);

  let data: FormData;
  try { data = await request.formData(); } catch { return json({ message: "入力内容を読み取れませんでした。" }, 400); }
  if (String(data.get("company-url") || "")) return json({ message: "送信しました。" });
  const token = String(data.get("cf-turnstile-response") || "");
  if (!await verifyTurnstile(request, env, token, action)) return json({ message: "認証を確認できませんでした。もう一度お試しください。" }, 400);

  try {
    await sendFormMail(env, action, safeFields(data));
  } catch (error) {
    console.error("Form delivery failed", error instanceof Error ? error.message : "Unknown error");
    return json({ message: "送信できませんでした。時間をおいて再度お試しください。" }, 502);
  }
  return json({ message: "送信しました。担当者からの連絡をお待ちください。" });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/forms\/(contact|request|institutional)$/);
    if (match) {
      if (request.method !== "POST") return json({ message: "Method Not Allowed" }, 405);
      return handleForm(request, env, match[1]);
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
