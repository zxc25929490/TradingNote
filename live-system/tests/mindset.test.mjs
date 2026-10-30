import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../mindset.js", import.meta.url), "utf8");

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const M = sandbox.TradingNoteMindset;

// Tags: any common separator, trimmed and de-duplicated; unknown emotion / grade values are dropped.
assert.deepEqual([...M.parseTags("突破, 追價，新聞前、突破 ;#早盤")], ["突破", "追價", "新聞前", "早盤"]);
assert.deepEqual(JSON.parse(JSON.stringify(M.normalizeAnnotation({ tags: "a,b", emotion: "angry", grade: "D" }))), { tags: ["a", "b"], emotion: "", grade: "" });

// Tilt flags from the trade sequence alone.
const t = (date, time, r, lots = 1) => ({ date, time, r, profit: r * 100, lots });
const day = [
  t("2026-01-05", "09:00", -1),
  t("2026-01-05", "09:20", -1, 1.5), // 20 min after a loss, size up 50%
  t("2026-01-05", "09:40", 2, 1.5),  // after two straight losses
  t("2026-01-05", "11:00", 1),
  t("2026-01-06", "09:00", 1),
];
const flagged = M.tiltFlags(day);
assert.deepEqual([...flagged[0].flags], []);
assert.deepEqual([...flagged[1].flags], ["quickReentry", "sizeUp"]);
assert.deepEqual([...flagged[2].flags], ["quickReentry", "afterStreak"], "two losses in a row the same day");
assert.deepEqual([...flagged[3].flags], [], "a win resets the after-loss checks");
assert.deepEqual([...flagged[4].flags], [], "a new day starts clean");

// Overtrading: beyond the usual busiest day (90th percentile of trades per day, at least 3).
const quietDays = Array.from({ length: 10 }, (_, i) => t(`2026-02-${String(i + 1).padStart(2, "0")}`, "09:00", 1));
const busyDay = [1, 2, 3, 4].map((n) => t("2026-02-20", `1${n}:00`, 1));
assert.equal(M.dailyLimit([...quietDays, ...busyDay]), 3);
assert.deepEqual([...M.tiltFlags([...quietDays, ...busyDay]).at(-1).flags], ["overtrade"]);

// Two indices opened minutes apart are simultaneous positions, not a re-entry after a loss.
const pair = (time, market, r, lots = 1, closeTime = "") => ({ date: "2026-03-02", time, pair: market, r, lots, closeTime });
assert.deepEqual([...M.tiltFlags([pair("21:30", "US30", -1), pair("21:34", "US100", -1, 2)])[1].flags], []);
// With an MT4 close time, the gap counts from the close, in any market.
assert.deepEqual([...M.tiltFlags([pair("21:30", "US30", -1, 1, "2026.03.02 21:50"), pair("22:10", "US100", -1, 2)])[1].flags], ["quickReentry", "sizeUp"]);
assert.deepEqual([...M.tiltFlags([pair("21:30", "US30", -1, 1, "2026.03.02 22:30"), pair("22:10", "US100", -1, 2)])[1].flags], [], "still open: not a re-entry");

// A loss on the previous day does not make the next morning's first trade a re-entry.
assert.deepEqual([...M.tiltFlags([t("2026-01-05", "23:50", -1), t("2026-01-06", "00:05", -1, 3)])[1].flags], []);

// Annotations feed in: risky emotion and grade C are flags too.
const annotated = M.tiltFlags([t("2026-01-07", "09:00", -1)], () => ({ tags: [], emotion: "revenge", grade: "C" }));
assert.deepEqual([...annotated[0].flags], ["riskyEmotion", "gradeC"]);

// Summary: score is the share of clean trades, and flagged vs clean are compared.
const summary = M.tiltSummary(flagged);
assert.equal(summary.score, 60);
assert.equal(summary.level, "tilt");
assert.equal(summary.flagged.n, 2);
assert.equal(summary.clean.n, 3);
assert.equal(summary.flagged.avgR, 0.5);
assert.equal(summary.byFlag.find((row) => row.id === "sizeUp").n, 1);

// Group performance: a trade with several tags counts in each; sorted by total R.
const tagged = [{ r: 2, profit: 200, tags: ["a", "b"] }, { r: -1, profit: -100, tags: ["b"] }, { r: 1, profit: 100, tags: [] }];
const groups = M.groupPerformance(tagged, (trade) => trade.tags);
assert.deepEqual([...groups.map((row) => row.key)], ["a", "b"]);
assert.equal(groups[1].n, 2);
assert.equal(groups[1].winRate, 50);
assert.equal(groups[1].totalR, 1);

// Wiring.
assert.match(html, /data-page-link="mindset"/);
assert.match(html, /<section id="mindset" class="page" data-page="mindset">/);
assert.match(html, /<select name="grade">/);
assert.match(html, /<select name="emotion">/);
assert.match(html, /<input name="tags"/);
assert.ok(html.indexOf("mindset.js") < html.indexOf('src="app.js'), "loaded before app.js");
assert.match(app, /window\.TradingNoteMindset\?\.setAnnotation\?\.\(trade,/);
assert.match(app, /mindset: "心態與標籤"/);
assert.equal(M.STORE_KEY.startsWith("tradingnote."), true, "annotations are included in full backups");

console.log("Mindset tests passed");
