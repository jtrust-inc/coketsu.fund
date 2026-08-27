import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "migration-source", "site");
const destination = join(root, "public");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
const manifest = JSON.parse(await readFile(join(root, "migration-source", "manifest.json"), "utf8"));
console.log(`Prepared ${manifest.pages.length} pages and ${manifest.assets.length} assets in ${destination}`);
