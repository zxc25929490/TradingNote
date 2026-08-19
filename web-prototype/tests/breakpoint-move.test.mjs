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
  "fingerprintNumber",
  "normalizeDateValue",
  "normalizeTimeValue",
  "tradeIdentityFingerprint",
  "smartTradeFingerprint",
  "moveTradeKey",
  "moveSelectedTradesToBreakpoint",
].map(extractFunction).join("\n"), sandbox);

vm.runInContext(`
  var activeLiveBatch = "source";
  var localTrades = [{ localId: "L-1", batchId: "source", date: "2026-08-19", time: "09:30:00", pair: "NAS100", profit: 100, r: 1 }];
  var trades = [{ ...localTrades[0], id: 1, origin: "local" }];
  var deletedTrades = new Set();
  var moveTradeCandidates = new Map([["local:L-1", trades[0]]]);
  var els = { moveTradesTarget: { value: "target" }, moveTradesDialog: { close() {} } };
  function selectedMoveTradeKeys() { return ["local:L-1"]; }
  function cloneTradeForBatch(trade, batchId) { return { ...trade, localId: "CLONE", batchId }; }
  function saveLocalTrades() {}
  function saveLiveBatches() {}
  function refreshAfterDataChange() {}
  function animateBatchControl() {}
`, sandbox);

const result = sandbox.moveSelectedTradesToBreakpoint();
assert.deepEqual(JSON.parse(JSON.stringify(result)), { moved: 1, merged: 0 });
assert.equal(sandbox.localTrades[0].batchId, "target");
assert.equal(sandbox.activeLiveBatch, "target");

console.log("Breakpoint move tests passed");
