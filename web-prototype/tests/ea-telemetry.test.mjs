import assert from "node:assert/strict";
import fs from "node:fs";

const ea = fs.readFileSync(new URL("../../mt4/TradingNoteJournalEA.mq4", import.meta.url), "utf8");

assert.match(ea, /#property version\s+"3\.00"/);
assert.match(ea, /TradingNote_MT4_Journal_v3\.tsv/);
assert.match(ea, /mfe_price\\tmfe_r\\tmae_price\\tmae_r/);
assert.match(ea, /tracking_delay_seconds/);
assert.match(ea, /monitoring_coverage_pct/);
assert.match(ea, /holding_seconds/);
assert.match(ea, /mfe_time/);
assert.match(ea, /first_2r_seconds/);
assert.match(ea, /stop_change_count/);
assert.match(ea, /breakeven_time/);
assert.match(ea, /favorable_time_pct/);
assert.match(ea, /planned_rr/);
assert.match(ea, /max_locked_r/);
assert.match(ea, /max_giveback_r/);
assert.match(ea, /entry_atr_points/);
assert.match(ea, /risk_pct_equity/);
assert.match(ea, /same_symbol_trades_at_entry/);
assert.match(ea, /RecordMilestone\(trackers\[index\]\.first20RSeconds/);
assert.match(ea, /AppendQualityToken\(trackers\[index\]\.captureQuality, "monitoring_gap"\)/);
assert.match(ea, /ArrayResize\(values, 85\)/);
const journalHeader = ea.match(/string header = "([^"]+)";/)?.[1].split("\\t") || [];
const assignedIndexes = [...ea.matchAll(/values\[(\d+)\] =/g)].map((match) => Number(match[1]));
assert.equal(journalHeader.length, 85, "journal header and row width must stay aligned");
assert.equal(new Set(assignedIndexes).size, 85, "every exported column must be assigned exactly once");
assert.equal(Math.max(...assignedIndexes), 84);

console.log("EA telemetry contract tests passed");
