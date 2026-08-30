import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    const char = appSource[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return appSource.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

const functionNames = [
  "normalizeHeader",
  "pickRowValue",
  "normalizeDateValue",
  "normalizeTimeValue",
  "fingerprintNumber",
  "backupTradeRecord",
  "tradeIdentityFingerprint",
  "smartTradeFingerprint",
  "prepareBackupTrade",
  "prepareTradeForActiveBatch",
  "tradesInActiveBatch",
  "enrichTradeFields",
  "parseMt4Journal",
  "mt4Number",
  "mt4PositiveNumber",
  "captureQualityLabel",
  "normalizeMt4JournalRows",
  "isMt4Trade",
  "mt4PositionGroupKey",
  "mt4TradeLegs",
  "mt4WeightedValue",
  "consolidateMt4Position",
  "consolidateMt4Trades",
];

const sandbox = {
  activeLiveBatch: "live-default",
  crypto: { randomUUID: () => "test-uuid" },
  console,
};
vm.createContext(sandbox);
vm.runInContext(`const ALL_LIVE_BATCH_ID = "live-all";\n${extractFunction("isAllLiveView")}\n${functionNames.map(extractFunction).join("\n")}`, sandbox);

const headers = [
  "record_version", "source", "account", "ticket", "magic", "date", "time", "close_time", "symbol", "direction",
  "lots", "entry", "stop_loss", "take_profit", "exit_price", "initial_risk_points", "initial_risk_money", "gross_profit",
  "commission", "swap", "net_profit", "gross_r", "net_r", "mfe_price", "mfe_r", "mae_price", "mae_r",
  "exit_efficiency_pct", "entry_spread_points", "exit_spread_points", "max_spread_points", "spread_cost_estimate",
  "exit_reason", "exit_slippage_points", "regime", "volatility", "htf_alignment", "session", "broker_utc_offset",
  "comment", "capture_quality", "tracking_started_at", "tracking_delay_seconds", "monitored_seconds", "monitoring_gap_seconds",
  "monitoring_coverage_pct", "sample_count", "holding_seconds", "mfe_time", "mfe_seconds", "mae_time", "mae_seconds",
  "first_0_5r_seconds", "first_1r_seconds", "first_1_5r_seconds", "first_2r_seconds", "first_2_5r_seconds", "first_3r_seconds",
  "first_minus_0_5r_seconds", "first_minus_1r_seconds", "final_stop_loss", "final_take_profit", "stop_change_count",
  "first_stop_change_time", "breakeven_time", "take_profit_change_count", "favorable_seconds", "adverse_seconds", "favorable_time_pct",
  "planned_rr", "max_locked_r", "max_risk_r", "max_giveback_r", "sl_tighten_count", "sl_widen_count",
  "entry_atr_points", "entry_adx", "entry_ema_gap_points", "entry_previous_day_position_pct", "balance_at_entry",
  "equity_at_entry", "free_margin_at_entry", "risk_pct_equity", "open_trades_at_entry", "same_symbol_trades_at_entry",
];

const values = {
  record_version: "2",
  source: "TradingNote MT4 EA",
  account: "123456",
  ticket: "987654",
  magic: "0",
  date: "2026-08-18",
  time: "09:31:22",
  close_time: "2026-08-18 10:12:00",
  symbol: "NAS100",
  direction: "Long",
  lots: "0.50",
  entry: "23100.5",
  stop_loss: "23050.5",
  take_profit: "23200.5",
  exit_price: "23180.5",
  initial_risk_points: "500.0",
  initial_risk_money: "250.00",
  gross_profit: "410.00",
  commission: "-3.50",
  swap: "-1.00",
  net_profit: "405.50",
  gross_r: "1.6400",
  net_r: "1.6220",
  mfe_price: "23220.5",
  mfe_r: "2.4000",
  mae_price: "23080.5",
  mae_r: "-0.4000",
  exit_efficiency_pct: "67.58",
  entry_spread_points: "12.0",
  exit_spread_points: "15.0",
  max_spread_points: "18.0",
  spread_cost_estimate: "6.00",
  exit_reason: "manual_or_ea_close",
  exit_slippage_points: "",
  regime: "trend_up",
  volatility: "normal_volatility",
  htf_alignment: "aligned",
  session: "London",
  broker_utc_offset: "3.0",
  comment: "manual setup",
  capture_quality: "complete",
  tracking_started_at: "2026-08-18 09:31:23",
  tracking_delay_seconds: "1",
  monitored_seconds: "2420",
  monitoring_gap_seconds: "0",
  monitoring_coverage_pct: "99.20",
  sample_count: "1800",
  holding_seconds: "2440",
  mfe_time: "2026-08-18 10:05:00",
  mfe_seconds: "2020",
  mae_time: "2026-08-18 09:35:00",
  mae_seconds: "218",
  first_0_5r_seconds: "300",
  first_1r_seconds: "720",
  first_1_5r_seconds: "1200",
  first_2r_seconds: "1800",
  first_2_5r_seconds: "",
  first_3r_seconds: "",
  first_minus_0_5r_seconds: "",
  first_minus_1r_seconds: "",
  final_stop_loss: "23100.5",
  final_take_profit: "23200.5",
  stop_change_count: "2",
  first_stop_change_time: "2026-08-18 09:50:00",
  breakeven_time: "2026-08-18 09:55:00",
  take_profit_change_count: "1",
  favorable_seconds: "1700",
  adverse_seconds: "720",
  favorable_time_pct: "70.25",
  planned_rr: "2.0000",
  max_locked_r: "1.0000",
  max_risk_r: "1.2000",
  max_giveback_r: "1.3500",
  sl_tighten_count: "2",
  sl_widen_count: "1",
  entry_atr_points: "450.0",
  entry_adx: "27.5",
  entry_ema_gap_points: "125.0",
  entry_previous_day_position_pct: "72.5",
  balance_at_entry: "10000.0",
  equity_at_entry: "9950.0",
  free_margin_at_entry: "9200.0",
  risk_pct_equity: "2.5126",
  open_trades_at_entry: "2",
  same_symbol_trades_at_entry: "1",
};

const row = headers.map((header) => values[header] ?? "").join("\t");
const journal = `${headers.join("\t")}\r\n${row}\r\n${row}\r\n`;
const parsedRows = sandbox.parseMt4Journal(journal);
assert.equal(parsedRows.length, 2);

const trades = sandbox.normalizeMt4JournalRows(parsedRows);
assert.equal(trades.length, 2);
assert.equal(trades[0].externalId, "MT4:123456:987654");
assert.equal(trades[0].pair, "NAS100");
assert.equal(trades[0].direction, "Long");
assert.equal(trades[0].profit, 405.5);
assert.equal(trades[0].r, 1.622);
assert.equal(trades[0].mfePrice, 23220.5);
assert.equal(trades[0].mfeR, 2.4);
assert.equal(trades[0].maePrice, 23080.5);
assert.equal(trades[0].maeR, -0.4);
assert.equal(trades[0].exitEfficiencyPct, 67.58);
assert.equal(trades[0].holdingSeconds, 2440);
assert.equal(trades[0].first20RSeconds, 1800);
assert.equal(trades[0].monitoringCoveragePct, 99.2);
assert.equal(trades[0].stopChangeCount, 2);
assert.equal(trades[0].breakevenTime, "2026-08-18 09:55:00");
assert.equal(trades[0].plannedRR, 2);
assert.equal(trades[0].maxLockedR, 1);
assert.equal(trades[0].maxGivebackR, 1.35);
assert.equal(trades[0].entryAdx, 27.5);
assert.equal(trades[0].riskPctEquity, 2.5126);
assert.equal(trades[0].sameSymbolTradesAtEntry, 1);
assert.equal(sandbox.tradeIdentityFingerprint(trades[0]), sandbox.tradeIdentityFingerprint(trades[1]));

const partialExitValues = {
  ...values,
  ticket: "987656",
  lots: "0.25",
  close_time: "2026-08-18 10:35:00",
  exit_price: "23200.5",
  initial_risk_money: "125.00",
  gross_profit: "250.00",
  commission: "-1.75",
  swap: "-0.50",
  net_profit: "247.75",
  net_r: "1.9820",
  mfe_price: "23250.5",
  mae_price: "23070.5",
};
const partialJournal = `${headers.join("\t")}\n${row}\n${headers.map((header) => partialExitValues[header] ?? "").join("\t")}\n`;
const partialTrades = sandbox.normalizeMt4JournalRows(sandbox.parseMt4Journal(partialJournal));
const [consolidated] = sandbox.consolidateMt4Trades(partialTrades);
assert.equal(consolidated.partialExitCount, 2);
assert.deepEqual(Array.from(consolidated.partialExitTickets), ["987654", "987656"]);
assert.equal(consolidated.lots, 0.75);
assert.equal(consolidated.profit, 653.25);
assert.equal(consolidated.initialRiskMoney, 375);
assert.equal(consolidated.r, 1.742);
assert.equal(consolidated.closeTime, "2026-08-18 10:35:00");
assert.equal(consolidated.mfePrice, 23250.5);
assert.equal(consolidated.mfeR, 3);
assert.equal(consolidated.maePrice, 23070.5);
assert.equal(consolidated.maeR, -0.6);
assert.equal(consolidated.maxGivebackR, 1.35);
assert.equal(consolidated.riskPctEquity, 2.5126);
assert.match(consolidated.review, /分批出場已合併：2 段/);
const oldImportedLeg = {
  ...partialTrades[0],
  localId: "keep-existing-id",
  mfePrice: null,
  maePrice: null,
  mfeR: 0.4,
  maeR: -0.2,
  lesson: "保留既有復盤",
};
const refreshedExistingTicket = sandbox.consolidateMt4Position([oldImportedLeg, partialTrades[0]]);
assert.equal(refreshedExistingTicket.mfePrice, 23220.5, "re-importing the same ticket must backfill its favorable price");
assert.equal(refreshedExistingTicket.maePrice, 23080.5, "re-importing the same ticket must backfill its adverse price");
assert.equal(refreshedExistingTicket.mfeR, 2.4);
assert.equal(refreshedExistingTicket.localId, "keep-existing-id");
assert.equal(refreshedExistingTicket.lesson, "保留既有復盤");
const reconstructedPartial = sandbox.consolidateMt4Position([
  partialTrades[0],
  { ...partialTrades[1], captureQuality: "attached_mid_trade" },
]);
assert.equal(reconstructedPartial.captureQuality, "complete_partial_exit");
assert.equal(
  sandbox.consolidateMt4Trades([
    { ...partialTrades[0], batchId: "live-a" },
    { ...partialTrades[1], batchId: "live-b" },
  ]).length,
  2,
  "same position in different breakpoints must remain separate",
);

const missingRiskValues = {
  ...values,
  ticket: "987655",
  stop_loss: "0",
  take_profit: "0",
  initial_risk_points: "0",
  initial_risk_money: "0",
  gross_r: "",
  net_r: "",
  mfe_r: "",
  mae_r: "",
  exit_efficiency_pct: "",
  capture_quality: "complete",
};
const missingRiskJournal = `${headers.join("\t")}\n${headers.map((header) => missingRiskValues[header] ?? "").join("\t")}\n`;
const [missingRiskTrade] = sandbox.normalizeMt4JournalRows(sandbox.parseMt4Journal(missingRiskJournal));
assert.equal(missingRiskTrade.stopLoss, null);
assert.equal(missingRiskTrade.takeProfit, null);
assert.equal(missingRiskTrade.slPips, null);
assert.equal(missingRiskTrade.initialRiskMoney, null);
assert.equal(missingRiskTrade.r, null);
assert.equal(missingRiskTrade.mfePrice, 23220.5);
assert.equal(missingRiskTrade.mfeR, null);
assert.equal(missingRiskTrade.maePrice, 23080.5);
assert.equal(missingRiskTrade.maeR, null);
assert.equal(missingRiskTrade.exitEfficiencyPct, null);
assert.equal(missingRiskTrade.riskUnavailable, true);
assert.equal(missingRiskTrade.captureQuality, "missing_initial_sl");
assert.match(missingRiskTrade.review, /缺少初始 SL/);

const reassigned = sandbox.prepareTradeForActiveBatch({
  ...trades[0],
  localId: "old-local-id",
  batchId: "old-breakpoint",
});
assert.equal(reassigned.batchId, "live-default");
assert.equal(reassigned.localId, "test-uuid");
assert.deepEqual(
  Array.from(sandbox.tradesInActiveBatch([reassigned, { ...reassigned, batchId: "another-breakpoint" }])),
  [reassigned],
);
assert.notEqual(
  sandbox.smartTradeFingerprint(reassigned),
  sandbox.smartTradeFingerprint({ ...reassigned, batchId: "another-breakpoint" }),
);

assert.throws(
  () => sandbox.parseMt4Journal("date\tsymbol\n2026-08-18\tNAS100"),
  /account、ticket 或 symbol/,
);

console.log("MT4 journal import tests passed");
