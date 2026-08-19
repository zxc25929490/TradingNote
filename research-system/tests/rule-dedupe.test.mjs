import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([
  "normalizeRuleTitle",
  "ruleContentKey",
  "mergeRuleEvidence",
  "dedupeRules",
  "mergeImportedRules",
  "researchTradeCoreKey",
  "researchBackupFingerprint",
  "mapBackupTradeIdsToBatch",
].map(extractFunction).join("\n"), sandbox);

const deduped = sandbox.dedupeRules([
  { id: "R-001", title: "等待 K 棒收線", description: "first", confidence: 60, evidence: ["BT-001"] },
  { id: "R-099", title: "  等待  K 棒收線  ", description: "duplicate", confidence: 85, evidence: ["BT-002", "BT-001"] },
]);
assert.equal(deduped.length, 1);
assert.deepEqual(Array.from(deduped[0].evidence), ["BT-001", "BT-002"]);
assert.equal(deduped[0].confidence, 85);

sandbox.rules = deduped;
vm.runInContext("var rules = globalThis.rules", sandbox);
const idMap = new Map([["OLD-1", "NEW-1"]]);
const result = sandbox.mergeImportedRules([
  { id: "R-001", title: "等待 K 棒收線", evidence: ["OLD-1"] },
  { id: "R-002", title: "重大消息前不進場", evidence: ["OLD-1"] },
], idMap, 123456);
assert.equal(result.added, 1);
assert.equal(result.merged, 1);
assert.equal(sandbox.rules.length, 2);
assert.deepEqual(Array.from(sandbox.rules[0].evidence), ["BT-001", "BT-002", "NEW-1"]);
assert.equal(sandbox.rules[1].title, "重大消息前不進場");

const backup = {
  breakpoint: { name: "Breakout v2", createdAt: "2026-08-19" },
  trades: [
    { id: "OLD-1", date: "2026-08-18", market: "NAS100", session: "New York", setup: "突破", mine: "Long", mentor: "Long", r: 2 },
    { id: "OLD-2", date: "2026-08-19", market: "DJ30", session: "New York", setup: "回撤", mine: "Short", mentor: "No Trade", r: -1 },
  ],
};
const reordered = { breakpoint: { ...backup.breakpoint }, trades: [...backup.trades].reverse() };
assert.equal(sandbox.researchBackupFingerprint(backup), sandbox.researchBackupFingerprint(reordered));
assert.equal(
  sandbox.researchBackupFingerprint(backup),
  sandbox.researchBackupFingerprint({ breakpoint: { ...backup.breakpoint, name: "Breakout v2（匯入）" }, trades: backup.trades }),
);
const mappedIds = sandbox.mapBackupTradeIdsToBatch(backup.trades, [
  { ...backup.trades[0], id: "NEW-101", sourceTradeId: "OLD-1" },
  { ...backup.trades[1], id: "NEW-102" },
]);
assert.equal(mappedIds.get("OLD-1"), "NEW-101");
assert.equal(mappedIds.get("OLD-2"), "NEW-102");

console.log("Rule Book dedupe tests passed");
