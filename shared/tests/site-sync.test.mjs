import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/sync-site.mjs", import.meta.url));
const result = spawnSync(process.execPath, [script, "--check"], { encoding: "utf8" });
assert.equal(result.status, 0, `tradingnote-site/public is out of date. Run: node scripts/sync-site.mjs\n${result.stdout}${result.stderr}`);
console.log("Site copies are in sync");
