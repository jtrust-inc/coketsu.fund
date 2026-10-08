import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "migration-source", "site");
const destination = join(root, "public");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
async function removeCapturedHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await removeCapturedHtml(path);
    else if (entry.name.endsWith(".html")) await rm(path);
  }
}
await removeCapturedHtml(destination);
const manifest = JSON.parse(await readFile(join(root, "migration-source", "manifest.json"), "utf8"));
console.log(`Prepared ${manifest.assets.length} captured assets; ${manifest.pages.length} routes are rendered by Astro`);
