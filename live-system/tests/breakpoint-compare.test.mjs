import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../breakpoint-compare.js", import.meta.url), "utf8");
const stats = fs.readFileSync(new URL("../../shared/stats.js", import.meta.url), "utf8");

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stats, sandbox);
vm.runInContext(source, sandbox);
const { compareBreakpoints, neededPerSide, MIN_N } = sandbox.TradingNoteBreakpointCompare;

const trade = (r, profit, date = "2026-01-01") => ({ r, profit, date });
const repeat = (pattern, times) => Array.from({ length: times }, () => pattern).flat();

// Same pattern, different risk size: identical R statistics, different money per R.
const small = { id: "a", label: "A", kind: "live", trades: repeat([trade(2, 100), trade(-1, -50)], 10) };
const large = { id: "b", label: "B", kind: "live", trades: repeat([trade(2, 2000), trade(-1, -1000)], 10) };
let result = compareBreakpoints([small, large], { baselineId: "a" });
const [a, b] = result.rows;
assert.equal(result.baseline.id, "a");
assert.equal(a.n, 20);
assert.equal(a.total, 10);
assert.equal(a.mean, 0.5);
assert.equal(a.winRate, 50);
assert.equal(a.profitFactor, 2);
assert.equal(a.maxDrawdown, -1);
assert.equal(a.worstStreak, 1);
assert.deepEqual([a.curve[0], a.curve[1], a.curve[2]], [0, 2, 1]);
assert.equal(a.moneyPerR, 50);
assert.equal(b.moneyPerR, 1000);
assert.equal(a.vsBaseline, null, "the baseline is not compared with itself");
assert.equal(b.vsBaseline.diff, 0);
assert.equal(b.vsBaseline.significant, false);
assert.equal(result.sizeWarning, true, "a 20x difference in money per R is flagged");

// A clear, large difference with enough trades is significant; a tiny sample never is.
const strong = { id: "c", label: "C", kind: "backtest", trades: repeat([trade(2.1), trade(1.9)], 15) };
const weak = { id: "d", label: "D", kind: "live", trades: repeat([trade(-0.9), trade(-1.1)], 15) };
result = compareBreakpoints([weak, strong], { baselineId: "d" });
assert.equal(result.rows[1].vsBaseline.significant, true);
assert.ok(result.rows[1].vsBaseline.diff > 2.9);
assert.equal(result.rows[1].hasMoney, false, "backtest records carry no money");
const tiny = { id: "e", label: "E", kind: "live", trades: [trade(3), trade(3), trade(2.5)] };
result = compareBreakpoints([weak, tiny], { baselineId: "d" });
assert.equal(result.rows[1].vsBaseline.enough, false);
assert.equal(result.rows[1].vsBaseline.significant, false, `fewer than ${MIN_N} trades is never called significant`);

// Trades without a usable R count as trades but not as R samples.
const mixed = { id: "f", label: "F", kind: "live", trades: [trade(1, 10), { profit: 5, date: "2026-01-02" }, { r: 2, riskUnavailable: true }] };
assert.equal(compareBreakpoints([mixed]).rows[0].count, 3);
assert.equal(compareBreakpoints([mixed]).rows[0].n, 1);

// Sample size needed grows as the difference shrinks.
assert.ok(neededPerSide(0.1, 1, 1) > neededPerSide(0.5, 1, 1));
assert.equal(neededPerSide(0, 1, 1), null);

// Wiring: the page, nav entry, script and render hooks exist.
assert.match(html, /data-page-link="breakpoint-compare"/);
assert.match(html, /<section id="breakpoint-compare" class="page" data-page="breakpoint-compare">/);
assert.match(html, /<script src="breakpoint-compare\.js\?v=/);
assert.ok(html.indexOf("breakpoint-compare.js") < html.indexOf('src="app.js'), "loaded before app.js like the other page modules");
assert.match(app, /"breakpoint-compare": "斷點比較"/);
assert.match(app, /nextPage === "breakpoint-compare"\) window\.renderBreakpointCompare/);

console.log("Breakpoint compare tests passed");
