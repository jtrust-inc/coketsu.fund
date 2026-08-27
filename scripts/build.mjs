import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBackupGuards } from "./guard.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "migration-source", "site");
const dist = join(root, "dist");
await normalizeBackupGuards(source);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(source, dist, { recursive: true });
await mkdir(join(dist, "mirror-status"), { recursive: true });
await writeFile(join(dist, "mirror-status", "index.html"), '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Mirror status</title><p>Coketsu fund backup mirror is ready.</p></html>');
const manifest = JSON.parse(await readFile(join(root, "migration-source", "manifest.json"), "utf8"));
console.log(`Built ${manifest.pages.length} pages and ${manifest.assets.length} assets in ${dist}`);
