import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "migration-source", "manifest.json"), "utf8"));
const productionOrigin = "https://coketsu.fund";
const previewOrigin = "https://coketsu-fund.system-f78.workers.dev";
const auditLocalBuild = process.env.AUDIT_LOCAL === "1";

function decode(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;/g, " ").trim();
}

function visibleText(html) {
  return decode(html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).normalize("NFKC").toLowerCase();
}

function tokens(value) {
  return new Set(value.match(/[\p{L}\p{N}]{2,}/gu) ?? []);
}

function similarity(source, target) {
  const left = tokens(visibleText(source));
  const right = tokens(visibleText(target));
  const intersection = [...left].filter((token) => right.has(token)).length;
  return Math.round(intersection / Math.max(1, new Set([...left, ...right]).size) * 100);
}

function count(html, tag) {
  return (html.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;
}

function meta(html, attribute, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<meta[^>]+${attribute}=["']${escaped}["'][^>]+content=["']([^"']*)`, "i"))?.[1] ?? null;
}

async function get(url) {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "JT-Site-Auditor/0.2", "cache-control": "no-cache" } });
  return { requestedUrl: url, finalUrl: response.url, status: response.status, html: await response.text() };
}

async function getBuild(file, url) {
  return { requestedUrl: url, finalUrl: url, status: 200, html: await readFile(join(root, "dist", file), "utf8") };
}

const pages = [];
for (const entry of manifest.pages) {
  const path = new URL(entry.url).pathname;
  const [production, preview] = await Promise.all([get(`${productionOrigin}${path}`), auditLocalBuild ? getBuild(entry.file, `${previewOrigin}${path}`) : get(`${previewOrigin}${path}`)]);
  const textSimilarity = similarity(production.html, preview.html);
  const productionTokens = tokens(visibleText(production.html));
  const previewTokens = tokens(visibleText(preview.html));
  const sourceImages = count(production.html, "img");
  const targetImages = count(preview.html, "img");
  const sourceLinks = count(production.html, "a");
  const targetLinks = count(preview.html, "a");
  const sourceForms = count(production.html, "form");
  const targetForms = count(preview.html, "form");
  const differences = [];
  if (production.status !== preview.status) differences.push(`HTTP ${production.status}→${preview.status}`);
  if (textSimilarity < 90) differences.push(`本文一致率 ${textSimilarity}%`);
  if (sourceImages !== targetImages) differences.push(`画像 ${sourceImages}→${targetImages}`);
  if (sourceLinks !== targetLinks) differences.push(`リンク ${sourceLinks}→${targetLinks}`);
  if (sourceForms !== targetForms) differences.push(`フォーム ${sourceForms}→${targetForms}`);
  pages.push({ path, productionStatus: production.status, previewStatus: preview.status, productionFinalUrl: production.finalUrl, previewFinalUrl: preview.finalUrl, textSimilarity, sourceImages, targetImages, sourceLinks, targetLinks, sourceForms, targetForms, titleMatch: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(production.html)?.[1] === /<title[^>]*>([\s\S]*?)<\/title>/i.exec(preview.html)?.[1], descriptionMatch: meta(production.html, "name", "description") === meta(preview.html, "name", "description"), sourceOnlyTokens: [...productionTokens].filter((token) => !previewTokens.has(token)).slice(0, 40), targetOnlyTokens: [...previewTokens].filter((token) => !productionTokens.has(token)).slice(0, 40), differences });
}

const report = { auditedAt: new Date().toISOString(), productionOrigin, previewOrigin: auditLocalBuild ? "Astro dist" : previewOrigin, pages, summary: { pageCount: pages.length, averageTextSimilarity: Math.round(pages.reduce((sum, page) => sum + page.textSimilarity, 0) / pages.length), allHttp200: pages.every((page) => page.productionStatus === 200 && page.previewStatus === 200), zeroPercentPages: pages.filter((page) => page.textSimilarity === 0).map((page) => page.path), formDifferencePages: pages.filter((page) => page.sourceForms !== page.targetForms).map((page) => page.path) } };
await mkdir(join(root, "reports"), { recursive: true });
await writeFile(join(root, "reports", "live-parity.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary));
