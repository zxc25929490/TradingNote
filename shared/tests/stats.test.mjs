import assert from "node:assert/strict";

await import("../stats.js");
const S = globalThis.TradingNoteStats;
const close = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected} ± ${tolerance}, got ${actual}`);

// Student t p-values against known table values.
close(S.tTwoSidedP(2.228, 10), 0.05, 0.001, "t=2.228 df=10");
close(S.tTwoSidedP(2.0, 10), 0.0734, 0.001, "t=2 df=10");
close(S.tTwoSidedP(1.96, 100000), 0.05, 0.001, "t=1.96 large df");
assert.equal(S.tTwoSidedP(0, 5), 1);

// Welch test: identical groups are not different, far-apart groups are.
assert.ok(S.welch([1, 2, 3, 4], [1, 2, 3, 4]).p > 0.99);
assert.ok(S.welch([5, 6, 7, 8, 9], [1, 2, 3, 4, 5]).p < 0.01);

// Basics.
const basics = S.basics([2, -1, -1, 2]);
assert.equal(basics.total, 2);
assert.equal(basics.winRate, 50);
assert.equal(basics.payoff, 2);
assert.equal(basics.profitFactor, 2);

// Drawdown profile: equity 1,-1,0,-1,2 -> drawdowns 0,-2,-1,-2,0.
const profile = S.drawdownProfile([1, -2, 1, -1, 3]);
assert.deepEqual(profile.equity, [1, -1, 0, -1, 2]);
assert.deepEqual(profile.drawdown, [0, -2, -1, -2, 0]);
assert.equal(profile.maxDrawdown, -2);
assert.equal(profile.maxDrawdownIndex, 1);
assert.equal(profile.episodes.length, 1);
assert.equal(profile.episodes[0].length, 3);
assert.equal(profile.episodes[0].recovered, true);
assert.equal(profile.recoveryFactor, 1);
assert.equal(S.drawdownProfile([1, -1, -1]).longest.recovered, false);

// Risk-adjusted metrics use daily R for Sharpe/Sortino.
const days = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"];
const adjusted = S.riskAdjusted(days.map((date, index) => ({ date, r: index % 3 === 2 ? -1 : 1.5 })));
assert.equal(adjusted.tradingDays, 6);
assert.ok(adjusted.sharpeDaily > 0 && adjusted.sortinoDaily > adjusted.sharpeDaily);
assert.ok(adjusted.sqn > 0);
assert.ok(adjusted.empiricalKelly > 0 && adjusted.halfKelly === adjusted.empiricalKelly / 2);
assert.equal(S.riskAdjusted([{ date: "2026-01-01", r: -1 }]).sharpeDaily, null);
assert.equal(S.empiricalKelly([1, 2, 3]).fraction, 0, "no losses -> no meaningful Kelly");

// Edge significance is deterministic and sensible.
const strong = Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? -1 : 1.5));
const edgeA = S.edgeSignificance(strong);
const edgeB = S.edgeSignificance(strong);
assert.deepEqual(edgeA, edgeB);
assert.ok(edgeA.p < 0.001 && edgeA.ci95[0] > 0 && edgeA.probPositive > 0.99);
assert.ok(S.edgeSignificance([1, -1, 1, -1, 1, -1, 0.1, -0.1]).p > 0.5);

// Prop-firm survival simulation.
const sure = S.breachProbability([1, 1, 1, 1, 1], { riskPct: 1, maxLossPct: 3, targetPct: 5, trades: 10, runs: 200 });
assert.equal(sure.staticBreach, 0);
assert.equal(sure.passRate, 1);
assert.equal(sure.medianTradesToTarget, 5);
const doomed = S.breachProbability([-1, -1, -1, -1, -1], { riskPct: 1, maxLossPct: 3, targetPct: 5, trades: 10, runs: 200 });
assert.equal(doomed.staticBreach, 1);
assert.equal(doomed.passRate, 0);
assert.equal(S.breachProbability([1, 2], {}), null, "too little data");

// Sequence analysis.
const alternating = Array.from({ length: 20 }, (_, i) => (i % 2 ? -1 : 1));
const runs = S.runsTest(alternating);
assert.equal(runs.runs, 20);
assert.equal(runs.pattern, "alternating");
const clustered = [...Array(10).fill(1), ...Array(10).fill(-1)];
assert.equal(S.runsTest(clustered).pattern, "clustered");
assert.equal(S.runsTest([1, -1, 1]), null);

const after = S.afterLosses([1, -1, -1, 2, -1, 3]);
assert.equal(after[1].n, 2); // trades following a single loss
assert.equal(after[2].n, 1); // trade following two losses
assert.equal(after[2].mean, 2);
assert.equal(after[0].label, "贏單之後");

const rolling = S.rollingMetrics([1, 1, -1, -1, 1, 1], 3);
assert.equal(rolling.rows.length, 4);
assert.equal(rolling.rows[0].mean, 1 / 3);
const decay = S.edgeDecay([...Array(30).fill(0).map((_, i) => (i % 2 ? 1 : 2)), ...Array(10).fill(0).map((_, i) => (i % 2 ? -1 : -0.5))], 10);
assert.equal(decay.declining, true);
assert.equal(S.edgeDecay([1, 2, 3], 10), null);

// Exit quality.
const exits = S.exitQuality([
  { r: 2, mfeR: 3, maeR: -0.3 },
  { r: -1, mfeR: 1.2, maeR: -1 },
  { r: 1, mfeR: 1, maeR: -0.8 },
  { r: 0.5 }, // no MFE recorded
]);
assert.equal(exits.total, 4);
assert.equal(exits.covered, 3);
assert.equal(exits.avgMfeWin, 2);
assert.equal(exits.lostAfterOneR.count, 1);
assert.equal(exits.lostAfterHalfR.count, 1);
assert.equal(exits.reachedOneR, 3);
close(exits.leftOnTable, 0.5, 1e-9, "left on table");
const stop08 = exits.stopSimulation.find((row) => row.stop === 0.8);
close(stop08.delta, -1.6, 1e-9, "tighter stop net effect");
assert.equal(stop08.stoppedWinners, 1);
assert.equal(stop08.stoppedLosers, 1);
assert.equal(S.exitQuality([{ r: 1 }]).covered, 0);

// Holding time.
const hold = S.holdingAnalysis([
  { r: 1, holdingSeconds: 120 }, { r: -1, holdingSeconds: 7200 }, { r: 2, holdingSeconds: 600 }, { r: -1, holdingSeconds: 3000 }, { r: 1 },
]);
assert.equal(hold.covered, 4);
assert.equal(hold.medianWin, 360);
assert.equal(hold.medianLoss, 5100);
assert.ok(hold.lossToWinRatio > 10);
assert.equal(hold.buckets[0].n, 1);
assert.ok(hold.correlation < 0, "longer holds correlate with worse R here");

// Costs.
const cost = S.costAnalysis([
  { r: 1, grossR: 1.2, commission: -2, swap: -1, grossProfit: 120, profit: 117, pair: "A", initialRiskMoney: 100 },
  { r: -1, grossR: -0.9, commission: -2, swap: 0, grossProfit: -88, profit: -90, pair: "B", initialRiskMoney: 100 },
  { r: 1 },
], { pair: (trade) => trade.pair });
assert.equal(cost.covered, 2);
assert.equal(cost.costMoney, 5);
close(cost.avgCostR, 0.15, 1e-9, "avg cost R");
assert.equal(cost.groups.pair[0].label, "A");
close(cost.costPctOfGross, (5 / 32) * 100, 1e-9, "cost share of gross");
assert.equal(S.costAnalysis([{ r: 1 }]).covered, 0);

// Exposure / revenge trading.
const exposure = S.exposureAnalysis([
  { date: "2026-02-01", time: "10:00:00", r: -1, riskPctEquity: 1, openTradesAtEntry: 0, sameSymbolTradesAtEntry: 0 },
  { date: "2026-02-01", time: "10:10:00", r: -1, riskPctEquity: 1.5, openTradesAtEntry: 1, sameSymbolTradesAtEntry: 1 },
  { date: "2026-02-01", time: "10:15:00", r: -1, riskPctEquity: 1, openTradesAtEntry: 2, sameSymbolTradesAtEntry: 1 },
  { date: "2026-02-02", time: "09:00:00", r: 2, riskPctEquity: 1, openTradesAtEntry: 0, sameSymbolTradesAtEntry: 0 },
  { date: "2026-02-03", time: "09:00:00", r: 1, riskPctEquity: 1, openTradesAtEntry: 0, sameSymbolTradesAtEntry: 0 },
]);
assert.equal(exposure.revenge.quick.n, 2);
assert.equal(exposure.revenge.other.n, 2);
assert.equal(exposure.openTrades.multiple.n, 1);
assert.equal(exposure.sameSymbol.stacked.n, 2);
assert.equal(exposure.perDay.three.days, 1);
assert.equal(exposure.perDay.one.days, 2);
assert.equal(exposure.risk.covered, 5);
assert.equal(S.exposureAnalysis([{ r: 1 }]).risk, null);

// Cross tab: Bonferroni threshold shrinks with the number of tested cells.
const sample = [];
for (let i = 0; i < 10; i += 1) sample.push({ s: "Asia", d: "Mon", r: 2 + (i % 2) * 0.1 });
for (let i = 0; i < 10; i += 1) sample.push({ s: "NY", d: "Mon", r: -1 + (i % 2) * 0.1 });
for (let i = 0; i < 3; i += 1) sample.push({ s: "NY", d: "Tue", r: -0.5 });
const table = S.crossTab(sample, (trade) => trade.s, (trade) => trade.d, { minN: 5 });
assert.deepEqual(table.rows.sort(), ["Asia", "NY"]);
assert.equal(table.testedCells, 2);
assert.equal(table.adjustedAlpha, 0.025);
assert.equal(table.cell("NY", "Tue").enough, false, "thin cells are not tested");
assert.equal(table.cell("Asia", "Mon").significant, true);
assert.equal(table.cell("Asia", "Tue"), null);

// Strategy versions: a clearly better version is significant after correction, a thin one is not tested.
const versionTrades = [];
for (let i = 0; i < 12; i += 1) versionTrades.push({ v: "V2", r: 1.5 + (i % 3) * 0.1 });
for (let i = 0; i < 12; i += 1) versionTrades.push({ v: "V1", r: -0.5 + (i % 3) * 0.1 });
for (let i = 0; i < 3; i += 1) versionTrades.push({ v: "V3", r: 9 });
const versions = S.versionComparison(versionTrades, (trade) => trade.v);
assert.equal(versions.rows[0].label, "V3", "rows sorted by mean R");
assert.equal(versions.rows.find((row) => row.label === "V3").enough, false);
assert.equal(versions.rows.find((row) => row.label === "V3").vsRest, null);
assert.equal(versions.pairs.length, 1, "only versions with enough trades are compared");
assert.equal(versions.pairs[0].significant, true);
assert.ok(versions.pairs[0].diff !== 0);
assert.equal(S.versionComparison([{ r: 1 }], () => null).rows.length, 0);

// Partial exits: contribution per leg and scale-out vs single-exit comparison.
const scaled = (profits, risk = 100) => ({ r: profits.reduce((a, b) => a + b, 0) / risk, initialRiskMoney: risk, partialExits: profits.map((profit, index) => ({ profit, closeTime: `2026.01.01 1${index}:00` })) });
const partial = S.partialExitAnalysis([
  scaled([100, 200]), scaled([50, 150]), scaled([100, -50, 250]),
  { r: 1 }, { r: -1 }, { r: 2 },
]);
assert.equal(partial.scaled, 3);
assert.equal(partial.single, 3);
assert.equal(partial.legs[0].n, 3);
assert.equal(partial.legs[0].mean, (1 + 0.5 + 1) / 3);
assert.equal(partial.legs[2].n, 1);
assert.ok(Math.abs(partial.legs.reduce((sum, row) => sum + row.share, 0) - 1) < 1e-9, "leg shares add to 100%");
assert.ok(partial.comparison, "enough trades on both sides to compare");
assert.equal(S.partialExitAnalysis([{ r: 1 }]).scaledStats, null);

// The dashboard must load the maths module before the panel and hand it the filtered trades.
import fs from "node:fs";
const html = fs.readFileSync(new URL("../../web-prototype/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../../web-prototype/app.js", import.meta.url), "utf8");
assert.ok(html.indexOf("shared/stats.js") > 0 && html.indexOf("shared/stats.js") < html.indexOf("advanced-analytics.js"), "stats.js loads first");
assert.match(html, /id="advancedAnalytics"/);
for (const tab of ["risk", "sequence", "exit", "hold", "cost", "exposure", "cross", "versions"]) assert.match(html, new RegExp(`data-adv-tab="${tab}"`));
assert.match(app, /TradingNoteAdvancedAnalytics\?\.render\(items/);

console.log("Stats tests passed");
