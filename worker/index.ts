interface Env {
  ASSETS: Fetcher;
  TURNSTILE_SECRET: string;
  FORM_WEBHOOK_URL?: string;
  FORM_WEBHOOK_TOKEN?: string;
}

const HOSTS = new Set(["coketsu.fund", "coketsu-fund.system-f78.workers.dev"]);
const ACTIONS = new Set(["contact", "request", "institutional"]);
const MAX_BODY_BYTES = 64 * 1024;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});

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
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return json({ message: "入力内容が大きすぎます。" }, 413);
  const type = request.headers.get("content-type") || "";
  if (!type.includes("multipart/form-data") && !type.includes("application/x-www-form-urlencoded")) return json({ message: "不正な形式です。" }, 415);

  let data: FormData;
  try { data = await request.formData(); } catch { return json({ message: "入力内容を読み取れませんでした。" }, 400); }
  if (String(data.get("company-url") || "")) return json({ message: "送信しました。" });
  const token = String(data.get("cf-turnstile-response") || "");
  if (!await verifyTurnstile(request, env, token, action)) return json({ message: "認証を確認できませんでした。もう一度お試しください。" }, 400);

  if (!env.FORM_WEBHOOK_URL) return json({ message: "メール配送設定が完了していません。" }, 503);
  const delivery = await fetch(env.FORM_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...(env.FORM_WEBHOOK_TOKEN ? { authorization: `Bearer ${env.FORM_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({ site: "coketsu.fund", form: action, fields: safeFields(data), receivedAt: new Date().toISOString() }),
  });
  if (!delivery.ok) return json({ message: "送信できませんでした。時間をおいて再度お試しください。" }, 502);
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
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
