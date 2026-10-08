import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "migration-source", "manifest.json"), "utf8"));
const visibleText = (html) => html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;|&#\d+;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const count = (html, pattern) => [...html.matchAll(pattern)].length;
const hrefs = (html) => new Set([...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((match) => match[1]));
const rows = [];
for (const page of manifest.pages) {
  const source = await readFile(join(root, "migration-source", "site", page.file), "utf8");
  const output = await readFile(join(root, "dist", page.file), "utf8");
  const sourceText = visibleText(source).replace(/バックアップ・複製環境です。[\s\S]*$/u, "").trim();
  const outputText = visibleText(output);
  const contentMatchPercent = sourceText && outputText.includes(sourceText) ? 100 : Math.round(100 * Math.min(sourceText.length, outputText.length) / Math.max(sourceText.length, outputText.length));
  const sourceHrefs = hrefs(source);
  const outputHrefs = hrefs(output);
  const preservedLinksPercent = sourceHrefs.size ? Math.round(100 * [...sourceHrefs].filter((href) => outputHrefs.has(href)).length / sourceHrefs.size) : 100;
  rows.push({ url: page.url, contentMatchPercent, titleMatch: /<title>[\s\S]*?<\/title>/i.exec(source)?.[0] === /<title>[\s\S]*?<\/title>/i.exec(output)?.[0], links: { production: count(source, /<a\b/gi), astro: count(output, /<a\b/gi), preservedLinksPercent }, images: { production: count(source, /<img\b/gi), astro: count(output, /<img\b/gi) }, canonical: /<link rel="canonical" href="https:\/\/coketsu\.fund\//.test(output), jsonLd: /application\/ld\+json/.test(output) });
}
const average = (key) => Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
const summary = { pages: rows.length, rawContentMatchPercent: average("contentMatchPercent"), titleMatchPercent: Math.round(100 * rows.filter((row) => row.titleMatch).length / rows.length), preservedLinksPercent: Math.round(rows.reduce((sum, row) => sum + row.links.preservedLinksPercent, 0) / rows.length), imagesMatchPercent: Math.round(100 * rows.filter((row) => row.images.production === row.images.astro).length / rows.length), intentionalDifferences: ["WordPress forms replaced with production handoff", "skip link added", "SEO metadata corrected"] };
await mkdir(join(root, "reports"), { recursive: true });
await writeFile(join(root, "reports", "astro-audit.json"), JSON.stringify({ generatedAt: new Date().toISOString(), source: "latest production capture", preview: "Astro dist", pages: rows, summary }, null, 2) + "\n");
console.log(JSON.stringify(summary));
