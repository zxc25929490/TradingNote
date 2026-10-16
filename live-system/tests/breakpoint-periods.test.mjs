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
vm.runInContext(`
  const ALL_LIVE_BATCH_ID = "live-all";
  var activeLiveBatch = ALL_LIVE_BATCH_ID;
  var trades = [
    { batchId: "A", externalId: "MT4:1", date: "2026-08-01", pair: "NAS100", profit: 100 },
    { batchId: "B", externalId: "MT4:1", date: "2026-08-01", pair: "NAS100", profit: 100 },
    { batchId: "B", externalId: "MT4:2", date: "2026-08-02", pair: "XAUUSD", profit: -50 }
  ];
  ${extractFunction("normalizeDateValue")}
  ${extractFunction("normalizeTimeValue")}
  ${extractFunction("fingerprintNumber")}
  ${extractFunction("tradeIdentityFingerprint")}
  ${extractFunction("isAllLiveView")}
  ${extractFunction("uniqueAcrossLiveBatches")}
  ${extractFunction("tradesForActiveView")}
`, sandbox);

assert.equal(sandbox.tradesForActiveView().length, 2, "完整紀錄應跨斷點彙總並去除同一交易副本");
sandbox.activeLiveBatch = "B";
assert.equal(sandbox.tradesForActiveView().length, 2, "一般斷點只顯示自己的交易");

const monthlySource = extractFunction("getMonthlyRows");
const monthItemsSource = extractFunction("tradesForMonth");
assert.match(monthlySource, /baseFilteredTrades\(\)/, "每月列表必須跟隨目前斷點與篩選");
assert.match(monthItemsSource, /baseFilteredTrades\(\)/, "選取月份必須跟隨目前斷點與篩選");
assert.match(source, /liveBatches,\s*\n\s*activeLiveBatch,\s*\n\s*visibleTrades:/, "完整備份必須保留斷點清單與交易歸屬");

console.log("Breakpoint period and aggregate tests passed");
