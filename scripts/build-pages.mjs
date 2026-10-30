// Builds the Cloudflare Pages output: the four systems and shared/ (no tests), plus a root page
// that opens the live dashboard. Cloudflare runs this as the build command; output folder: dist.
//
//   node scripts/build-pages.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
const SOURCES = ["live-system", "research-system", "review-system", "analysis-system", "shared"];
const EXCLUDED = new Set(["tests", "node_modules", ".DS_Store", "Thumbs.db"]);

fs.rmSync(out, { recursive: true, force: true });
let files = 0;
function copy(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copy(source, target);
    else {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(source, target);
      files += 1;
    }
  }
}
for (const source of SOURCES) copy(path.join(root, source), path.join(out, source));

fs.writeFileSync(path.join(out, "index.html"), `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TradingNote</title>
  <meta http-equiv="refresh" content="0; url=live-system/index.html">
  <link rel="icon" href="live-system/favicon.svg">
</head>
<body>
  <p><a href="live-system/index.html">開啟 TradingNote</a></p>
</body>
</html>
`);
// Pages would otherwise answer unknown paths with the root page; a real 404 keeps mistakes visible.
fs.writeFileSync(path.join(out, "404.html"), `<!doctype html><meta charset="utf-8"><title>找不到頁面</title><p>找不到這個頁面。<a href="/live-system/index.html">回到 TradingNote</a></p>\n`);
fs.writeFileSync(path.join(out, "_headers"), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  X-Frame-Options: SAMEORIGIN\n`);
console.log(`Built ${files + 3} files into dist/`);
