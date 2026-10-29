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

const TURNSTILE_SITE_KEY = "0x4AAAAAAFYoRD5PnpO-VDnW";

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

function migrateFooter(footer: string) {
  // The captured WordPress srcset references generated thumbnail files that are
  // not part of the static export. Browsers otherwise select a missing logo
  // candidate and expand its broken-image box to the full footer height.
  return footer
    .replace(/\s+srcset=["'][^"']*["']/gi, "")
    .replace(/\s+sizes=["'][^"']*["']/gi, "");
}

function migrateContent(content: string, route: string) {
  const label = FORM_LABELS[route];
  if (!label) return content;
  const action = route === "/contact/" ? "contact" : route === "/request/" ? "request" : "institutional";
  const statusId = `astro-form-status-${action}`;
  return content.replace(/<form\b[\s\S]*?<\/form>/i, (form) => {
    // Address collection is no longer required for material requests.
    // Keep the captured WordPress source and other forms unchanged.
    if (action === "request") {
      form = form.replace(/<label\b[^>]*class="form-label"[^>]*><span\b[^>]*>必須<\/span>(?:郵便番号|住所)<\/label>\s*<div class="row mb-3"><div\b[^>]*><span\b[^>]*><input\b[^>]*name="your-(?:postal-code|address)"[^>]*\/><\/span><\/div><\/div>/g, "");
    }
    const enabled = form
      .replace(/<form\b([^>]*)>/i, (_match, attributes: string) => {
        const safeAttributes = attributes
          .replace(/\s(?:action|method|onsubmit|data-status|data-backup-disabled)=["'][^"']*["']/gi, "")
          .replace(/\snovalidate(?:=["'][^"']*["'])?/gi, "");
        return `<form${safeAttributes} action="/api/forms/${action}" method="post" data-astro-form="${action}" aria-describedby="${statusId}">`;
      })
      .replace(/<fieldset class="hidden-fields-container">[\s\S]*?<\/fieldset>/i, "")
      .replace(/<input\b[^>]*name=["'](?:_cf7msm_multistep_tag|cf7msm-no-ss)["'][^>]*>/gi, "")
      .replace(/(<(?:input|select|textarea)\b[^>]*aria-required=["']true["'][^>]*)(>)/gi, "$1 required$2")
      .replace(/<div class="wpcf7-response-output"[^>]*><\/div>/i, "")
      .replace(/<\/form>/i, `<div class="astro-honeypot" aria-hidden="true"><label>会社URL<input type="text" name="company-url" tabindex="-1" autocomplete="off"></label></div><div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-action="${action}" data-theme="light"></div><div id="${statusId}" class="astro-form-status" role="status" aria-live="polite"></div></form>`);
    return enabled;
  });
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
