import assert from "node:assert/strict";

await import("../review-loop.js");
const L = globalThis.TradingNoteReviewLoop;
const FIELDS = [["missedTradeR", "漏單"], ["earlyExitR", "提早出場"], ["extraTradeR", "額外亂做"]];

// ---- costRanking: totals, shares, and 30-day windows anchored on the latest trade date
const ranking = L.costRanking([
  { date: "2026-01-05", earlyExitR: 1 },
  { date: "2026-02-10", earlyExitR: 2, missedTradeR: 0.5 },
  { date: "2026-03-01", earlyExitR: 0.5 },
  { date: "2026-03-20", missedTradeR: 1 },
  { date: "2026-03-25", extraTradeR: -3, earlyExitR: "x" }, // negative / non-numeric ignored
], FIELDS);
assert.equal(ranking[0].field, "earlyExitR");
assert.equal(ranking[0].total, 3.5);
assert.equal(ranking[0].count, 3);
assert.ok(Math.abs(ranking[0].share - 3.5 / 5) < 1e-9);
assert.equal(ranking[2].total, 0);
const missed = ranking.find((row) => row.field === "missedTradeR");
assert.equal(missed.recent, 1); // 03-20 is within 30 days of 03-25
assert.equal(missed.previous, 0.5); // 02-10 falls in the 30 days before that window
const early = ranking.find((row) => row.field === "earlyExitR");
assert.equal(early.recent, 0.5);
assert.equal(early.previous, 2);
assert.equal(early.change, -1.5);
assert.deepEqual(L.costRanking([], FIELDS).map((row) => row.total), [0, 0, 0]);

// ---- monthlyTrend
const months = L.monthlyTrend([
  { date: "2026-01-03", reviewClass: "correct_execution" },
  { date: "2026-01-04", reviewClass: "rule_violation", extraTradeR: 1 },
  { date: "2026-01-05" },
  { date: "2026-02-01", reviewClass: "correct_execution" },
  { date: "bad-date", reviewClass: "execution_error" },
], FIELDS);
assert.deepEqual(months.map((row) => row.month), ["2026-01", "2026-02"]);
assert.equal(months[0].trades, 3);
assert.equal(months[0].reviewed, 2);
assert.equal(months[0].correctRate, 0.5);
assert.equal(months[0].violationRate, 0.5);
assert.equal(months[0].gapPerTrade, 1 / 3);
assert.equal(months[1].correctRate, 1);
assert.equal(months[0].reasons.extraTradeR, 1);
assert.equal(L.monthlyTrend([{ date: "2026-01-01" }], FIELDS)[0].correctRate, null, "no reviews yet");

// ---- halves: improvement is detected from per-trade gap
const history = [];
for (let i = 0; i < 20; i += 1) history.push({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, earlyExitR: i < 10 ? 1 : 0 });
const split = L.halves(history, FIELDS);
assert.equal(split.direction, "improving");
assert.equal(split.earlier.gapPerTrade, 1);
assert.equal(split.later.gapPerTrade, 0);
assert.equal(L.halves(history.slice(0, 6), FIELDS), null, "too little history");
assert.equal(L.halves(history.map((trade) => ({ ...trade, earlyExitR: 0.5 })), FIELDS).direction, "flat");

// ---- improvementTracking
const run = [];
for (let i = 0; i < 30; i += 1) {
  const day = String(i + 1).padStart(2, "0");
  const trade = { date: `2026-03-${day}`, time: "10:00:00", pair: "DJ30" };
  if (i < 15) trade.earlyExitR = 1; // frequent problem before the action
  if (i === 15) { trade.earlyExitR = 1; trade.improvement = "TP1 到了就移動止損，不手動出場"; }
  if (i > 15 && i % 5 === 0) trade.earlyExitR = 1; // much rarer afterwards
  run.push(trade);
}
const tracked = L.improvementTracking(run, FIELDS, { window: 10 });
assert.equal(tracked.length, 1);
assert.equal(tracked[0].reason, "提早出場");
assert.equal(tracked[0].before, 1);
assert.ok(tracked[0].after < 0.3);
assert.equal(tracked[0].verdict, "improved");

// no improvement when the problem keeps happening
const stuck = run.map((trade, index) => (index > 15 ? { ...trade, earlyExitR: 1 } : trade));
assert.equal(L.improvementTracking(stuck, FIELDS, { window: 10 })[0].verdict, "flat");
// worse when it gets more frequent
const worse = run.map((trade, index) => (index < 15 ? { ...trade, earlyExitR: index % 3 === 0 ? 1 : 0 } : trade)).map((trade, index) => (index > 15 ? { ...trade, earlyExitR: 1 } : trade));
assert.equal(L.improvementTracking(worse, FIELDS, { window: 10 })[0].verdict, "worse");
// not enough neighbours on one side
assert.equal(L.improvementTracking(run.slice(14, 18), FIELDS)[0].verdict, "insufficient");
// an action with no attributed mistake cannot be measured
assert.equal(L.improvementTracking([{ date: "2026-01-01", improvement: "多看一眼" }], FIELDS)[0].verdict, "no-reason");
assert.deepEqual(L.improvementTracking([{ date: "2026-01-01" }], FIELDS), [], "trades without an action are ignored");

const summary = L.summarizeActions([{ verdict: "improved" }, { verdict: "improved" }, { verdict: "flat" }, { verdict: "worse" }, { verdict: "insufficient" }]);
assert.equal(summary.judged, 4);
assert.equal(summary.successRate, 0.5);
assert.equal(L.summarizeActions([]).successRate, null);

console.log("Review loop tests passed");
