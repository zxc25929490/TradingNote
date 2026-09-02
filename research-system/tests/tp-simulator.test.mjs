import assert from "node:assert/strict";
import fs from "node:fs";

await import("../tp-simulator-core.js");
const simulator = globalThis.TradingNoteTpSimulator;
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.ok(simulator, "TP simulator core must be available");
assert.deepEqual(simulator.normalizePlan([
  { target: 3, weight: 40 },
  { target: 1, weight: 30 },
  { target: 2, weight: 30 },
]), [
  { target: 1, weight: 0.3 },
  { target: 2, weight: 0.3 },
  { target: 3, weight: 0.4 },
]);

const fixed = simulator.targetStats([3, 2, 1, 0], 2, 1);
assert.equal(fixed.hits, 2);
assert.equal(fixed.hitRate, 50);
assert.equal(fixed.expectancy, 0.5);

const protectedPlan = simulator.simulatePlan([3, 2, 1, 0], [
  { target: 1, weight: 30 },
  { target: 2, weight: 30 },
  { target: 3, weight: 40 },
], 1, true);
assert.deepEqual(protectedPlan.values.map(value => Number(value.toFixed(2))), [2.1, 0.9, 0.3, -1]);
assert.equal(Number(protectedPlan.expectancy.toFixed(3)), 0.575);

const unprotectedPlan = simulator.simulatePlan([1], [
  { target: 1, weight: 30 },
  { target: 2, weight: 30 },
  { target: 3, weight: 40 },
], 1, false);
assert.equal(Number(unprotectedPlan.values[0].toFixed(2)), -0.4);

assert.match(html, /data-view="tpsimulator"/);
assert.match(html, /id="tpSimulatorForm"/);
assert.match(html, /最高 R 無法判斷同一根 K 棒內 TP 與 SL 的先後順序/);
assert.match(app, /TradingNoteTpSimulator\.scanTargets/);
assert.match(app, /renderTpSimulator\(\)/);

console.log("TP simulator tests passed");
