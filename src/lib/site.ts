import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = `${root}/migration-source/site`;
const manifestPath = `${root}/migration-source/manifest.json`;

export type CapturedPage = {
  route: string; file: string; title: string; description: string; bodyClass: string;
  headAssets: string; beforeHeader: string; header: string; content: string; footer: string; afterFooter: string;
};

const FORM_LABELS: Record<string, string> = {
  "/contact/": "お問い合わせ",
  "/institutional-step1/": "法人様会員登録",
  "/request/": "資料請求",
};

const match = (value: string, pattern: RegExp) => value.match(pattern)?.[1]?.trim() ?? "";

function cleanHead(head: string) {
  return head
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+|generator)["']|property=["']og:[^"']+["'])[^>]*>/gi, "")
    .replace(/<link\b[^>]*(?:rel=["'](?:canonical|shortlink|EditURI|alternate)["']|rel=["']https:\/\/api\.w\.org\/["'])[^>]*>/gi, "")
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<meta\b[^>]*(?:charset|http-equiv|name=["']viewport["'])[^>]*>/gi, "");
}

function stripPreviewGuard(body: string) {
  return body
    .replace(/<style id="backup-mirror-style">[\s\S]*?<\/style>/gi, "")
    .replace(/<div id="backup-mirror-notice"[\s\S]*?<\/div>/gi, "")
    .replace(/<script id="backup-mirror-guard">[\s\S]*?<\/script>/gi, "");
}

function migrateHeader(header: string) {
  return header
    .replace(/<h1\b([^>]*class=["'][^"']*site-header-logo[^"']*["'][^>]*)>/i, "<div$1>")
    .replace(/<\/h1>/i, "</div>");
}

function migrateContent(content: string, route: string) {
  const label = FORM_LABELS[route];
  if (!label) return content;
  const target = new URL(route, "https://coketsu.fund/").href;
  const replacement = `<section class="astro-form-handoff" aria-labelledby="astro-form-handoff-title"><h2 id="astro-form-handoff-title">${label}フォーム</h2><p>個人情報を安全に取り扱うため、現在稼働中の本番フォームで受け付けています。送信前に<a href="https://jtrust-inc.jp/privacy_protection/" target="_blank" rel="noopener noreferrer">個人情報の取り扱い</a>をご確認ください。</p><p><a class="btn btn-primary" href="${target}">本番サイトの${label}フォームを開く</a></p></section>`;
  return content.replace(/<form\b[\s\S]*?<\/form>/i, replacement);
}

function migrateFooter(footer: string) {
  return footer.replace(/<p>Powered by[\s\S]*?<\/p>/i, "");
}

function cleanRuntime(html: string) {
  return html
    .replace(/<script\b[^>]*(?:contact-form-7|wpcf7|cf7msm)[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*>\s*(?:var\s+wpcf7|var\s+cf7msm)[\s\S]*?<\/script>/gi, "");
}

export async function getCapturedPages(): Promise<CapturedPage[]> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return Promise.all(manifest.pages.map(async (entry: { url: string; file: string }) => {
    const html = await readFile(`${sourceRoot}/${entry.file}`, "utf8");
    const head = match(html, /<head\b[^>]*>([\s\S]*?)<\/head>/i);
    const bodyTag = html.match(/<body\b([^>]*)>/i)?.[1] ?? "";
    const bodyClass = match(bodyTag, /class=["']([^"']*)["']/i);
    const body = stripPreviewGuard(match(html, /<body\b[^>]*>([\s\S]*?)<\/body>/i));
    const headerMatch = body.match(/<header\b[^>]*id=["']site-header["'][^>]*>[\s\S]*?<\/header>/i);
    const footerMatch = body.match(/<footer\b[^>]*class=["'][^"']*site-footer[^"']*["'][^>]*>[\s\S]*?<\/footer>/i);
    const header = headerMatch?.[0] ?? "";
    const footer = footerMatch?.[0] ?? "";
    const headerAt = headerMatch?.index ?? 0;
    const headerEnd = headerAt + header.length;
    const footerAt = footerMatch?.index ?? body.length;
    const footerEnd = footerAt + footer.length;
    const path = new URL(entry.url).pathname;
    return {
      route: path, file: entry.file,
      title: match(head, /<title>([\s\S]*?)<\/title>/i),
      description: match(head, /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["'][^>]*>/i),
      bodyClass, headAssets: cleanHead(head), beforeHeader: body.slice(0, headerAt), header: migrateHeader(header),
      content: migrateContent(body.slice(headerEnd, footerAt), path), footer: migrateFooter(footer), afterFooter: cleanRuntime(body.slice(footerEnd)),
    };
  }));
}
