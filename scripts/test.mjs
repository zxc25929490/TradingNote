// Runs every *.test.mjs under the four systems and shared/.
//   node scripts/test.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FOLDERS = ["shared", "live-system", "research-system", "review-system", "analysis-system"];

const tests = FOLDERS.flatMap((folder) => {
  const dir = path.join(root, folder, "tests");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).sort().map((name) => path.join(dir, name));
});

let failed = 0;
for (const file of tests) {
  const label = path.relative(root, file).split(path.sep).join("/");
  const result = spawnSync(process.execPath, [file], { cwd: path.dirname(file), encoding: "utf8" });
  if (result.status === 0) {
    console.log(`ok    ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
    console.log(`${result.stdout}${result.stderr}`.trim().split("\n").slice(-12).map((line) => `      ${line}`).join("\n"));
  }
}

console.log(`\n${tests.length - failed} / ${tests.length} test files passed`);
process.exit(failed ? 1 : 0);
