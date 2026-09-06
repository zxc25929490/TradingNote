import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const localStorage = new MemoryStorage({
  "tradingnote.partialExitPlan.v1": '{"enabled":true}',
  "tradingnote.analysisTolerance": "0.35",
  "tradingnote.replaySessions.v1": '[{"key":"day-a","manualStatus":"same"}]',
  "unrelated.application": "private",
});
const sandbox = { localStorage };
vm.createContext(sandbox);
vm.runInContext(`
  const APP_STORAGE_PREFIXES=["tradingnote.","trading-research.","trs."];
  const STRUCTURED_BACKUP_KEYS=new Set(["tradingnote.localTrades","trs.trades"]);
  const REPLAY_SESSIONS_KEY="tradingnote.replaySessions.v1";
  ${extractFunction("appStorageSnapshot")}
  ${extractFunction("mergeReplaySessions")}
  ${extractFunction("restoreAuxiliaryStorage")}
`, sandbox);

const snapshot = JSON.parse(JSON.stringify(sandbox.appStorageSnapshot()));
assert.equal(snapshot["tradingnote.partialExitPlan.v1"], '{"enabled":true}');
assert.equal(snapshot["tradingnote.analysisTolerance"], "0.35");
assert.equal(snapshot["unrelated.application"], undefined);

sandbox.restoreAuxiliaryStorage({
  "tradingnote.partialExitPlan.v1": '{"enabled":true,"legs":[{"target":1,"weight":1}]}',
  "tradingnote.analysisTolerance": "0.2",
  "tradingnote.replaySessions.v1": '[{"key":"day-b","manualStatus":"different"}]',
}, "merge");
assert.equal(localStorage.getItem("tradingnote.analysisTolerance"), "0.2");
assert.deepEqual(JSON.parse(localStorage.getItem("tradingnote.replaySessions.v1")).map((item) => item.key).sort(), ["day-a", "day-b"]);

localStorage.setItem("tradingnote.futurePreference", "old");
sandbox.restoreAuxiliaryStorage({ "tradingnote.analysisTolerance": "0.5" }, "replace");
assert.equal(localStorage.getItem("tradingnote.analysisTolerance"), "0.5");
assert.equal(localStorage.getItem("tradingnote.futurePreference"), null);

assert.match(source, /version: 5/);
assert.match(source, /storage: appStorageSnapshot\(\)/);
console.log("Full backup settings tests passed");
