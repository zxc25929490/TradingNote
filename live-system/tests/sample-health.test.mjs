import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL("../sample-health.js", import.meta.url), "utf8"), sandbox);
const H = sandbox.TradingNoteSampleHealth;

const trades = (values, start = "2026-01-05", perWeek = 5, extra = {}) => values.map((r, index) => {
  const date = new Date(Date.parse(start) + Math.floor(index / perWeek) * 7 * 86400000);
  return { r, date: date.toISOString().slice(0, 10), ...extra };
});
const repeat = (pattern, times) => Array.from({ length: times }, () => pattern).flat();

// A clear backtest edge with plenty of trades is decided.
let health = H.sampleHealth({ backtest: trades(repeat([2, -1], 60)) });
assert.equal(health.backtest.state, "positive");
assert.equal(health.backtest.n, 120);

// A small, noisy live edge is not decided yet: target from (2.8 sd / mean)^2, weeks from the pace.
const noisy = repeat([3, -1, -1, 2.5, -1, -1, 1.5, -1], 5); // 40 trades, mean ~0.25R
health = H.sampleHealth({ live: trades(noisy, "2026-01-05", 5) });
assert.equal(health.live.state, "collecting");
assert.ok(health.live.needed > 40, `needs more than it has (${health.live.needed})`);
assert.equal(health.live.remaining, health.live.needed - 40);
assert.equal(Math.round(health.live.pace), 5, "about 5 trades a week");
assert.equal(health.live.weeksLeft, Math.ceil(health.live.remaining / health.live.pace));

// Fewer than 20 trades never counts as decided, however good they look.
assert.equal(H.sampleHealth({ live: trades([2, 2, 2, 2, 2]) }).live.state, "collecting");

// Pairs: live R minus Replay R on the same trade; a consistent gap is found with few pairs.
const pairs = trades(repeat([-0.4, -0.5, -0.3, -0.45], 5)).map((trade, index) => ({ ...trade, r: trade.r, replayR: [0.1, 0, 0.2, 0.05][index % 4] }));
health = H.sampleHealth({ live: pairs });
assert.equal(health.paired.n, 20);
assert.ok(health.paired.target <= 20, `low-noise gap needs few pairs (${health.paired.target})`);
assert.equal(health.paired.state, "behind");
assert.equal(H.sampleHealth({ live: trades([1, -1]) }).paired.state, "none", "no replay yet");

// Wiring.
assert.match(html, /<div id="accountOverview"><\/div>\s*<div id="sampleHealth"><\/div>/);
assert.ok(html.indexOf("sample-health.js") < html.indexOf('src="app.js'));
assert.match(app, /function renderSampleHealth\(\)/);
assert.match(app, /renderSampleHealth\(\);/);

console.log("Sample health tests passed");
