import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "migration-source", "manifest.json"), "utf8"));
const disabledFormRoutes = new Set(["/contact/", "/institutional-step1/", "/request/"]);
const failures = [];
for (const page of manifest.pages) {
  const output = join(root, "dist", page.file);
  try { await access(output); } catch { failures.push(`${page.url}: output missing`); continue; }
  const html = await readFile(output, "utf8");
  if (!html.includes('data-astro-migrated="true"')) failures.push(`${page.url}: Astro marker missing`);
  if (html.includes("backup-mirror-notice")) failures.push(`${page.url}: old mirror notice remains`);
  if (html.includes("�")) failures.push(`${page.url}: replacement character detected`);
  if (!/<link rel="canonical" href="https:\/\/coketsu\.fund\//.test(html)) failures.push(`${page.url}: canonical missing`);
  if (!/application\/ld\+json/.test(html)) failures.push(`${page.url}: JSON-LD missing`);
  if ((html.match(/<h1\b/gi) ?? []).length !== 1) failures.push(`${page.url}: expected exactly one H1`);
  const route = new URL(page.url).pathname;
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  if (disabledFormRoutes.has(route)) {
    if (forms.length !== 1) failures.push(`${page.url}: expected one disabled preview form`);
    const form = forms[0] ?? "";
    if (!/data-preview-disabled=["']true["']/i.test(form) || !/onsubmit=["']return false["']/i.test(form)) failures.push(`${page.url}: preview form is not safely disabled`);
    if (/\sname=["']/i.test(form)) failures.push(`${page.url}: disabled form still contains serializable field names`);
    if (/\btype=["']submit["']/i.test(form)) failures.push(`${page.url}: enabled submit control remains`);
  } else if (forms.length) failures.push(`${page.url}: unexpected form remains`);
  if (/contact-form-7[^"']*\.js|var\s+wpcf7|cf7msm\.min\.js/i.test(html)) failures.push(`${page.url}: WordPress form runtime remains`);
  const refs = [...html.matchAll(/(?:href|src)=["']([^"'#?]+)["']/gi)].map((item) => item[1]);
  for (const ref of refs.filter((value) => value.startsWith("/") && !value.startsWith("//"))) {
    if (/\.(?:php|xml)$/.test(ref) || ref.startsWith("/wp-json") || ref.startsWith("/feed")) continue;
    const target = ref.endsWith("/") ? join(root, "dist", ref, "index.html") : join(root, "dist", ref);
    try { await access(target); } catch { failures.push(`${page.url}: broken local reference ${ref}`); }
  }
}
for (const required of ["robots.txt", "sitemap.xml"]) {
  try { await access(join(root, "dist", required)); } catch { failures.push(`${required}: missing`); }
}
try { await access(join(root, "dist", "_headers")); } catch { failures.push("_headers: missing"); }
if (manifest.pages.length !== 9) failures.push(`Expected 9 public pages, found ${manifest.pages.length}`);
if (failures.length) throw new Error(`Verification failed:\n${[...new Set(failures)].join("\n")}`);
console.log(`Verified Astro migration: ${manifest.pages.length} pages, ${manifest.assets.length} captured assets, no broken local references`);
