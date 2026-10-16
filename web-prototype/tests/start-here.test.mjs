import assert from "node:assert/strict";
import fs from "node:fs";

await import("../start-here.js");
const { buildTasks, WORKFLOW } = globalThis.TradingNoteStartHere;
const now = Date.parse("2026-10-16T12:00:00Z");
const fresh = "2026-10-15T12:00:00Z";
const ids = (tasks) => tasks.map((task) => task.id);

// Nothing to do: reviewed, assigned, fresh backup, no warnings.
assert.deepEqual(buildTasks({ trades: [{ date: "2026-10-10", r: 1, reviewClass: "correct_execution", strategyVersionId: "v1" }], now, lastBackupAt: fresh }), []);

// Only the last 7 days of trading count as "recent" reviews, anchored on the latest trade date.
const trades = [
  { date: "2026-10-10", r: 1 },
  { date: "2026-10-08", r: -1 },
  { date: "2026-09-01", r: 2 },
  { date: "2026-10-09", recordType: "missed_opportunity" },
];
const review = buildTasks({ trades, now, lastBackupAt: fresh }).find((task) => task.id === "review");
assert.equal(review.title, "2 筆最近的交易還沒復盤");
assert.match(review.detail, /共 3 筆/);
assert.equal(review.href, "../review-system/index.html#queue");

// Warnings come first; backup reminder appears when stale or missing.
const tasks = buildTasks({
  trades,
  now,
  lastBackupAt: null,
  edgeDecay: { declining: true, window: 30, recent: -0.2, earlier: 0.4, p: 0.03 },
  drawdown: { current: -4.5, max: -8 },
  mfeCoverage: 0,
});
assert.deepEqual(ids(tasks).slice(0, 3).sort(), ["backup", "decay", "drawdown"]);
assert.equal(tasks.at(-1).id, "ea", "info items go last");
assert.equal(tasks.find((task) => task.id === "decay").tab, "sequence");
assert.ok(ids(buildTasks({ trades: [], now, lastBackupAt: "2026-10-05T00:00:00Z" })).includes("backup"), "11 days without backup");
assert.ok(!ids(buildTasks({ trades: [], now, lastBackupAt: "2026-10-12T00:00:00Z" })).includes("backup"));
assert.ok(!ids(buildTasks({ trades, now, lastBackupAt: fresh, drawdown: { current: -1, max: -5 } })).includes("drawdown"));

// Every workflow link points somewhere real.
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
for (const stage of WORKFLOW) {
  for (const [, spec] of stage.links) {
    if (spec.page) assert.match(html, new RegExp(`data-page="${spec.page}"`), `page ${spec.page} exists`);
  }
}
assert.match(html, /id="startHere"/);
assert.match(html, /id="newTradeButton"/);

console.log("Start-here tests passed");
