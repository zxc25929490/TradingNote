// Mirrors the source systems into tradingnote-site/public so the hosted site serves the same code.
//
//   node scripts/sync-site.mjs          copy changed files and remove stale ones
//   node scripts/sync-site.mjs --check  report differences and exit 1 if the copies are out of date
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "tradingnote-site", "public");
const check = process.argv.includes("--check");

// source directory -> destination folders under tradingnote-site/public
const MIRRORS = [
  ["web-prototype", ["web-prototype", "tradingnote"]],
  ["research-system", ["research-system"]],
  ["review-system", ["review-system"]],
  ["analysis-system", ["analysis-system"]],
  ["shared", ["shared"]],
];
const EXCLUDED_DIRS = new Set(["tests", "node_modules"]);
const EXCLUDED_FILES = new Set([".DS_Store", "Thumbs.db"]);

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return EXCLUDED_DIRS.has(entry.name) ? [] : listFiles(full, base);
    return EXCLUDED_FILES.has(entry.name) ? [] : [path.relative(base, full).split(path.sep).join("/")];
  });
}

const sameContent = (a, b) => fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
const counts = { copied: 0, removed: 0 };
const changes = [];

for (const [source, destinations] of MIRRORS) {
  const sourceDir = path.join(root, source);
  const files = listFiles(sourceDir);
  for (const destination of destinations) {
    const destinationDir = path.join(publicDir, destination);
    for (const file of files) {
      const from = path.join(sourceDir, file);
      const to = path.join(destinationDir, file);
      if (sameContent(from, to)) continue;
      changes.push(`${fs.existsSync(to) ? "update" : "add   "} ${path.relative(root, to).split(path.sep).join("/")}`);
      counts.copied += 1;
      if (!check) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
    const wanted = new Set(files);
    for (const file of listFiles(destinationDir)) {
      if (wanted.has(file)) continue;
      changes.push(`remove ${path.relative(root, path.join(destinationDir, file)).split(path.sep).join("/")}`);
      counts.removed += 1;
      if (!check) fs.rmSync(path.join(destinationDir, file));
    }
  }
}

if (changes.length) console.log(changes.join("\n"));
if (check) {
  if (changes.length) {
    console.error(`\nSite copies are out of date (${counts.copied} to copy, ${counts.removed} stale). Run: node scripts/sync-site.mjs`);
    process.exit(1);
  }
  console.log("Site copies are up to date.");
} else {
  console.log(changes.length ? `\nSynced: ${counts.copied} copied, ${counts.removed} removed.` : "Already in sync.");
}
