import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL("../breakpoint-manager.js", import.meta.url), "utf8"), sandbox);
const M = sandbox.TradingNoteBreakpointManager;
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---- Selection: date range, time of day, weekday, market, result ----
const view = [
  { id: 1, date: "2026-10-19", time: "21:30:00", pair: "US30", outcome: "loss", r: -1, profit: -100, batchId: "a" }, // Monday
  { id: 2, date: "2026-10-20", time: "21:34:00", pair: "US100", outcome: "win", r: 2, profit: 200, batchId: "a" },
  { id: 3, date: "2026-10-21", time: "22:10:00", pair: "US30", outcome: "loss", r: -1, profit: -90, batchId: "a" },
  { id: 4, date: "2026-10-24", time: "21:31:00", pair: "US30", outcome: "win", r: 1, profit: 95, batchId: "a" }, // Saturday
  { id: 5, date: "2026-10-20", time: "21:30:00", pair: "US30", outcome: "win", r: 1, profit: 100 }, // default breakpoint
];
const ids = (list) => list.map((trade) => trade.id);
assert.deepEqual(ids(M.selectTrades(view, { batchId: "a" })), [1, 2, 3, 4]);
assert.deepEqual(ids(M.selectTrades(view, { batchId: "live-default" })), [5], "trades without batchId belong to the default breakpoint");
assert.deepEqual(ids(M.selectTrades(view, { batchId: "a", from: "2026-10-20", to: "2026-10-21" })), [2, 3], "dates are inclusive");
assert.deepEqual(ids(M.selectTrades(view, { batchId: "a", timeFrom: "21:30", timeTo: "21:35" })), [1, 2, 4], "time of day");
assert.deepEqual(ids(M.selectTrades(view, { batchId: "a", pair: "US30", outcome: "loss" })), [1, 3]);
assert.deepEqual(ids(M.selectTrades(view, { batchId: "a", weekdays: [1, 2, 3, 4, 5] })), [1, 2, 3], "weekdays only");

// ---- Operations ----
const fingerprint = (trade, batchId) => `${batchId}::${trade.date}::${trade.time}::${trade.pair}`;
let counter = 0;
const newId = () => `new-${++counter}`;
const cloneImported = (trade, batchId) => ({ localId: newId(), batchId, date: trade.date, time: trade.time, pair: trade.pair, r: trade.r });
const legA = { localId: "L1", batchId: "a", externalId: "MT4:1", date: "2026-10-20", time: "21:34:00", pair: "US100", r: 1 };
const legB = { localId: "L2", batchId: "a", externalId: "MT4:2", date: "2026-10-20", time: "21:34:00", pair: "US100", r: 1 };
const unrelated = { localId: "L3", batchId: "a", date: "2026-10-21", time: "22:10:00", pair: "US30", r: -1 };
const sameIdOtherBatch = { localId: "L9", batchId: "b", externalId: "MT4:1", date: "2026-10-20", time: "21:34:00", pair: "US100" };
const local = [legA, legB, unrelated, sameIdOtherBatch];
// On screen, the MT4 position is one trade carrying both legs.
const position = { ...legA, origin: "local", partialExits: [legA, legB] };
const imported = { origin: "excel", baseKey: "TradingNote::5::2026-10-19", date: "2026-10-19", time: "21:30:00", pair: "US30", r: -1, batchId: "a" };

// Every stored leg behind a trade is found, but only inside its own breakpoint.
assert.deepEqual(M.storedEntries(position, local).map((item) => item.localId).sort(), ["L1", "L2"]);

// Delete: both legs go; an imported row is hidden through deletedTrades.
let result = M.applyOperation({ op: "delete", selected: [position, imported], localTrades: local, deletedTrades: new Set(), fingerprint });
assert.deepEqual(result.localTrades.map((item) => item.localId), ["L3", "L9"]);
assert.deepEqual([...result.deletedTrades], [imported.baseKey]);
assert.equal(result.changed, 2);
assert.equal(local.length, 4, "inputs are not modified");

// Move: both legs change breakpoint together; an imported row becomes a local record there.
result = M.applyOperation({ op: "move", selected: [position, imported], localTrades: local, deletedTrades: new Set(), target: "c", fingerprint, cloneImported, newId });
const byId = Object.fromEntries(result.localTrades.map((item) => [item.localId, item]));
assert.equal(byId.L1.batchId, "c");
assert.equal(byId.L2.batchId, "c");
assert.equal(byId.L3.batchId, "a", "unselected trades stay");
assert.ok(result.localTrades.some((item) => item.batchId === "c" && item.date === "2026-10-19"), "imported row cloned into the target");
assert.deepEqual([...result.deletedTrades], [imported.baseKey], "and hidden from the source");

// Move into a breakpoint that already has the trade: merged, not duplicated.
result = M.applyOperation({ op: "move", selected: [position], localTrades: local, deletedTrades: new Set(), target: "b", destinationTrades: [sameIdOtherBatch], fingerprint, cloneImported, newId });
assert.equal(result.merged, 1);
assert.deepEqual(result.localTrades.map((item) => item.localId).sort(), ["L3", "L9"], "source legs removed, destination copy kept");

// Copy: the source keeps its legs; the target gets new copies with new ids.
result = M.applyOperation({ op: "copy", selected: [position], localTrades: local, deletedTrades: new Set(), target: "c", fingerprint, cloneImported, newId });
assert.equal(result.localTrades.filter((item) => item.batchId === "a").length, 3);
const copies = result.localTrades.filter((item) => item.batchId === "c");
assert.equal(copies.length, 2);
assert.ok(copies.every((item) => item.localId.startsWith("new-")));

// Summary for the preview line.
assert.deepEqual(plain(M.summarize(view.slice(0, 2))), { count: 2, totalR: 1, profit: 100, start: "2026-10-19", end: "2026-10-20" });

// ---- Wiring ----
assert.match(html, /<section id="breakpoints" class="page" data-page="breakpoints">/);
assert.match(html, /data-page-link="breakpoints"/);
assert.match(html, /href="#breakpoints" role="menuitem"/, "reachable from the breakpoint menu");
assert.ok(html.indexOf("breakpoint-manager.js") < html.indexOf('src="app.js'));
assert.match(app, /breakpoints: "斷點管理"/);
assert.match(app, /nextPage === "breakpoints"/);

console.log("Breakpoint manager tests passed");
