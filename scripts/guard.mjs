import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const notice = "&#12496;&#12483;&#12463;&#12450;&#12483;&#12503;&#12539;&#35079;&#35069;&#29872;&#22659;&#12391;&#12377;&#12290;&#12501;&#12457;&#12540;&#12512;&#36865;&#20449;&#12289;&#20250;&#21729;&#30331;&#37682;&#12289;&#25237;&#36039;&#30003;&#36796;&#12399;&#28961;&#21177;&#12391;&#12377;&#12290;";

export const backupGuard = `<style id="backup-mirror-style">#backup-mirror-notice{position:fixed;z-index:2147483647;left:0;right:0;bottom:0;padding:10px 16px;background:#132f27;color:#fff;text-align:center;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 -2px 12px #0003}</style><div id="backup-mirror-notice" role="status">${notice}</div><script id="backup-mirror-guard">document.addEventListener("submit",function(e){e.preventDefault();e.stopImmediatePropagation();alert(document.getElementById("backup-mirror-notice").textContent);},true);</script>`;

export async function normalizeBackupGuards(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await normalizeBackupGuards(path);
    } else if (entry.name.endsWith(".html")) {
      const html = await readFile(path, "utf8");
      const normalized = html.replace(/<style id="backup-mirror-style">[\s\S]*?<\/script>/, backupGuard);
      if (normalized !== html) await writeFile(path, normalized, "utf8");
    }
  }
}
