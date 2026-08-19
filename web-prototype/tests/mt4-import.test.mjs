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
  "parseMt4Journal",
  "mt4Number",
  "mt4PositiveNumber",
  "captureQualityLabel",
  "normalizeMt4JournalRows",
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
  "comment", "capture_quality",
];

const values = {
  record_version: "1",
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
assert.equal(trades[0].mfeR, 2.4);
assert.equal(trades[0].maeR, -0.4);
assert.equal(trades[0].exitEfficiencyPct, 67.58);
assert.equal(sandbox.tradeIdentityFingerprint(trades[0]), sandbox.tradeIdentityFingerprint(trades[1]));

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
assert.equal(missingRiskTrade.mfeR, null);
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
