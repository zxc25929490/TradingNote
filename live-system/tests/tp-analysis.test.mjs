import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../tp-analysis.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../tp-analysis.css", import.meta.url), "utf8");

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const tp = sandbox.TradingNoteTpAnalysis;
assert.ok(tp, "TP analysis API should be exposed");
assert.equal(tp.positionMfe({ mfeR: 1.2, partialExits: [{ mfeR: 1 }, { mfeR: 2.5 }] }), 2.5);
assert.equal(tp.positionMae({ maeR: -0.2, partialExits: [{ maeR: -0.4 }, { maeR: -0.8 }] }), -0.8);
assert.equal(tp.eligibilityReason({ r: 1, mfeR: 2, captureQuality: "complete" }), "eligible");
assert.equal(tp.eligibilityReason({ mfeR: 2, captureQuality: "complete" }), "eligible", "final trade R must not be required");
assert.equal(tp.eligibilityReason({ direction: "Long", entry: 100, stopLoss: 95, mfePrice: 110, riskUnavailable: true, captureQuality: "complete" }), "eligible", "price path plus initial SL must be enough even without final R");
assert.equal(tp.eligibilityReason({ r: 1, mfeR: 2, captureQuality: "resumed_after_restart" }), "partial_capture");
assert.equal(tp.referenceEligible({ r: 1, mfeR: 2, maeR: -0.5, captureQuality: "resumed_after_restart" }), true);
assert.equal(tp.referenceEligible({ r: 1, mfeR: 2, maeR: null, captureQuality: "resumed_after_restart" }), true);
assert.equal(tp.referenceEligible({ r: 1, mfeR: null, maeR: -0.5, captureQuality: "resumed_after_restart" }), false);
const reconstructedPartial = {
  r: 1,
  captureQuality: "partial_capture",
  partialExits: [
    { mfeR: 1.2, maeR: -0.4, captureQuality: "complete" },
    { mfeR: 2.2, maeR: -0.2, captureQuality: "attached_mid_trade" },
  ],
};
assert.equal(tp.partialExitPathIsReconstructable(reconstructedPartial), true);
assert.equal(tp.eligibilityReason(reconstructedPartial), "eligible");
assert.equal(tp.eligibilityReason({
  ...reconstructedPartial,
  partialExits: [
    reconstructedPartial.partialExits[0],
    { ...reconstructedPartial.partialExits[1], captureQuality: "resumed_after_restart" },
  ],
}), "partial_capture");
assert.equal(tp.simulatedTradeR({ r: -1, mfeR: 2.2 }, 2), 2);
assert.equal(tp.simulatedTradeR({ r: 99, mfeR: 1.8 }, 2), -1, "a missed target must use fixed -1R, not actual exits");
const longPriceTrade = {
  direction: "Long",
  entry: 100,
  stopLoss: 95,
  mfePrice: 103,
  mfeR: 99,
  r: -1,
  captureQuality: "complete_partial_exit",
  partialExits: [
    { entry: 100, stopLoss: 95, mfePrice: 103, mfeR: 0.6, maePrice: 98, maeR: -0.4, captureQuality: "complete" },
    { entry: 100, stopLoss: 95, mfePrice: 106, mfeR: 1.2, maePrice: 97, maeR: -0.6, captureQuality: "attached_mid_trade" },
  ],
};
assert.equal(tp.positionFavorablePrice(longPriceTrade), 106);
assert.equal(tp.priceDerivedMfeR(longPriceTrade), 1.2);
assert.equal(tp.positionMfe(longPriceTrade), 1.2, "price-derived MFE should override stale stored MFE values");
assert.equal(tp.positionMae(longPriceTrade), -0.6);
assert.equal(tp.simulatedTradeR(longPriceTrade, 1), 1);
assert.equal(tp.simulatedTradeR(longPriceTrade, 1.25), -1);

const shortPriceTrade = {
  direction: "Short",
  entry: 100,
  stopLoss: 105,
  r: -0.5,
  captureQuality: "complete_partial_exit",
  partialExits: [
    { entry: 100, stopLoss: 105, mfePrice: 98, maePrice: 102, captureQuality: "complete" },
    { entry: 100, stopLoss: 105, mfePrice: 92, maePrice: 103, captureQuality: "attached_mid_trade" },
  ],
};
assert.equal(tp.positionFavorablePrice(shortPriceTrade), 92);
assert.equal(tp.priceDerivedMfeR(shortPriceTrade), 1.6);
assert.equal(tp.positionMfe(shortPriceTrade), 1.6);
assert.equal(tp.positionMae(shortPriceTrade), -0.6);

const priceCandidate = tp.candidateResult([longPriceTrade, shortPriceTrade], 1.5);
assert.equal(priceCandidate.hitCount, 1);
assert.equal(priceCandidate.hitRate, 50);
assert.equal(priceCandidate.avgR, 0.25);
assert.deepEqual(Array.from(tp.buildCandidateLevels(0.5, 1.5, 0.5)), [0.5, 1, 1.5]);

const stats = tp.statsFromValues([2, -1, 1, -1]);
assert.equal(stats.totalR, 1);
assert.equal(stats.avgR, 0.25);
assert.equal(stats.profitFactor, 1.5);
assert.equal(stats.maxDrawdown, -1);

assert.match(html, /data-page-link="tp-analysis"/);
assert.match(html, /id="tpAnalysisForm"/);
assert.match(html, /id="tpIncludeInterrupted"/);
assert.doesNotMatch(html, /id="tpTotalUnits"/);
assert.doesNotMatch(html, /id="tpUseActualSplits"/);
assert.match(html, /不同固定 TP 的純路徑測試/);
assert.match(html, /持倉最有利點/);
assert.match(html, /曾到達比例/);
assert.match(html, /沒碰到算 -1R/);
assert.match(html, /tp-analysis\.js/);
assert.match(app, /"tp-analysis": "TP 統計分析"/);
assert.match(app, /renderTpAnalysis/);
assert.match(css, /tp-reach-chart/);
assert.doesNotMatch(source, /Number\(trade\.r\)/, "TP path analysis must not use actual split-exit R");

console.log("TP analysis tests passed");
