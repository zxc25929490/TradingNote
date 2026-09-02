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
  "enrichTradeFields",
  "summarizePairs",
  "computeStats",
].map(extractFunction).join("\n"), sandbox);

const repaired = sandbox.enrichTradeFields({
  source: "TradingNote MT4 EA",
  externalId: "MT4:test:1",
  batchId: "live-default",
  entry: 53387.05,
  stopLoss: 0,
  takeProfit: 0,
  slPips: 53387.05,
  initialRiskMoney: 0,
  r: 0,
  grossR: 0,
  mfeR: 0,
  maeR: 0,
  exitEfficiencyPct: 0,
  lots: 0.05,
  profit: -0.31,
  captureQuality: "complete",
});

assert.equal(repaired.stopLoss, null);
assert.equal(repaired.takeProfit, null);
assert.equal(repaired.slPips, null);
assert.equal(repaired.initialRiskMoney, null);
assert.equal(repaired.r, null);
assert.equal(repaired.captureQuality, "missing_initial_sl");

const correctedNasR = sandbox.enrichTradeFields({
  source: "TradingNote MT4 EA",
  externalId: "MT4:test:225",
  pair: "NAS100.R",
  entry: 29115.15,
  stopLoss: 29140.15,
  lots: 12,
  slPips: 2500,
  profit: 585,
  grossProfit: 600,
  initialRiskMoney: 30000,
  r: 0.0195,
  grossR: 0.02,
});
assert.equal(correctedNasR.slPips, 25);
assert.equal(correctedNasR.initialRiskMoney, 300);
assert.equal(correctedNasR.r, 1.95);
assert.equal(correctedNasR.grossR, 2);

const correctedDjR = sandbox.enrichTradeFields({
  source: "TradingNote MT4 EA",
  externalId: "MT4:test:small-loss",
  pair: "DJ30.R",
  entry: 53666.31,
  stopLoss: 53636.31,
  lots: 10,
  profit: -25,
  initialRiskMoney: 300,
  r: -0.083333,
  outcome: "loss",
});
assert.equal(correctedDjR.r, -25 / 300);
assert.equal(correctedDjR.outcome, "loss");

const stats = sandbox.computeStats([
  { pair: "NAS100", profit: 100, r: 1, riskUnavailable: false },
  { pair: "US30", profit: -20, r: null, riskUnavailable: true },
]);
assert.equal(stats.totalR, 1);
assert.equal(stats.rTradeCount, 1);
assert.equal(stats.expectancy, 1);

console.log("EA risk quality tests passed");
