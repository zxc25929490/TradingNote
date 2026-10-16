import assert from "node:assert/strict";
import fs from "node:fs";

await import("../backtest-r.js");
const B = globalThis.TradingNoteBacktestR;

// Without a partial-exit plan the realised R equals the stored maximum.
assert.equal(B.maximumR({ r: 3 }), 3);
assert.equal(B.realizedR({ r: 3 }), 3);
assert.equal(B.realizedR({ r: -1 }), -1);
assert.equal(B.realizedR({ r: 0 }), 0, "a real break-even trade stays 0R");

// No trade / nothing recorded is "no R", never 0R (0R would count as a break-even trade).
for (const empty of [{ r: "" }, { r: null }, {}, { r: "abc" }, { r: 2, mine: "No Trade" }]) {
  assert.equal(B.maximumR(empty), null);
  assert.equal(B.realizedR(empty), null);
}

// With a plan: 50% at 1R, 50% at 3R; trades that do not reach a TP keep 0R on that part.
globalThis.TradingNotePartialExit = {
  realizedR(value) {
    const raw = Number(value);
    if (raw <= 0) return raw;
    return (raw >= 1 ? 0.5 : 0) + (raw >= 3 ? 1.5 : 0);
  },
};
assert.equal(B.realizedR({ r: 5 }), 2);
assert.equal(B.realizedR({ r: 2 }), 0.5);
assert.equal(B.realizedR({ r: -1 }), -1);

// normalize() is idempotent: converting twice must not apply the plan twice
// (that double conversion caused the TP simulator to show -0.5R per trade).
const once = B.normalize({ r: 5, date: "2026-01-01" });
const twice = B.normalize(once);
assert.deepEqual(once, { r: 2, maximumR: 5, date: "2026-01-01" });
assert.deepEqual(twice, once);
delete globalThis.TradingNotePartialExit;

// Every system that reads backtest records uses the shared helper instead of raw `trade.r`.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
for (const system of ["web-prototype", "research-system", "analysis-system"]) {
  assert.match(read(`../../${system}/index.html`), /\.\.\/shared\/backtest-r\.js\?v=/, `${system} loads backtest-r.js`);
}
assert.match(read("../../research-system/app.js"), /TradingNoteBacktestR\.normalize/);
assert.match(read("../../analysis-system/app.js"), /TradingNoteBacktestR\.normalize/);
assert.match(read("../../web-prototype/app.js"), /TradingNoteBacktestR\.normalize/);

console.log("Backtest R tests passed");
