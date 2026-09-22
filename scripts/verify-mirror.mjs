import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "migration-source", "manifest.json"), "utf8"));
await access(join(root, "dist", "index.html"));
const homepage = await readFile(join(root, "dist", "index.html"), "utf8");
if (!homepage.includes("backup-mirror-notice")) throw new Error("Backup notice missing from homepage");
if (/google-recaptcha-js|wpcf7-recaptcha-js/.test(homepage)) {
  throw new Error("Production reCAPTCHA integration must not run on the mirror hostname");
}
if (manifest.pages.length < 2) throw new Error(`Unexpected page count: ${manifest.pages.length}`);
console.log(`Verified Coketsu mirror: ${manifest.pages.length} pages, ${manifest.assets.length} assets`);
