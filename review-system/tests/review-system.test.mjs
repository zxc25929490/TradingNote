import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

const sandbox = { console, window:{TradingNotePartialExit:{realizedR:value=>Number(value)===1?.2:Number(value)}} };
vm.createContext(sandbox);
vm.runInContext(`
  const ATTR=[['missedTradeR','漏單'],['earlyExitR','提早出場'],['extraTradeR','額外亂做'],['lateEntryR','太晚進場'],['slippageR','滑價／成本'],['marketDriftR','市場狀態差異']];
  const CLASS_LABELS={correct_execution:'符合策略且執行正確',execution_error:'符合策略但執行錯誤',rule_violation:'不符合策略卻進場',missed_trade:'符合策略但漏單'};
  let replaySessions=[];
  ${extractFunction("classLabel")}
  ${extractFunction("gapTotal")}
  ${extractFunction("tradeDirection")}
  ${extractFunction("maximumToRealized")}
  ${extractFunction("timeToSeconds")}
  ${extractFunction("compareReplay")}
  ${extractFunction("sessionKey")}
  ${extractFunction("findReplaySession")}
  ${extractFunction("effectiveReviewClass")}
  ${extractFunction("matchSessionTrades")}
`, sandbox);

assert.equal(sandbox.classLabel("missed_trade"), "符合策略但漏單");
assert.equal(sandbox.classLabel(""), "待復盤");
assert.equal(sandbox.gapTotal({ missedTradeR: 1.2, earlyExitR: ".5", extraTradeR: -3 }), 1.7);
assert.equal(sandbox.tradeDirection({ entry: 100, stopLoss: 95 }), "Long");
assert.equal(sandbox.tradeDirection({ entry: 100, stopLoss: 105 }), "Short");
assert.equal(sandbox.compareReplay("Long", "22:30:00", 1.5, "entry", "Long", "22:30:45", 1.58).status, "same");
assert.equal(sandbox.compareReplay("Long", "22:30:00", 1.5, "entry", "Long", "22:34:00", 1.8).status, "partial");
assert.equal(sandbox.compareReplay("Long", "22:30:00", 1.5, "entry", "Short", "22:30:00", 1.5).status, "different");
assert.equal(sandbox.compareReplay("Long", "22:30:00", 1.5, "skip", "", "", "").status, "different");
assert.equal(sandbox.compareReplay("Long", "22:30:00", .2, "entry", "Long", "22:30:00", 1).status, "same");
const matched = sandbox.matchSessionTrades(
  [{ pair: "US100", direction: "Long", time: "22:31:00" }, { pair: "US30", direction: "Short", time: "22:35:00" }],
  [{ symbol: "US30", direction: "Short", time: "22:36:00", r: 1 }, { symbol: "US100", direction: "Long", time: "22:30:00", r: -1 }]
);
assert.deepEqual(JSON.parse(JSON.stringify(matched.matches)), [
  { actualIndex: 0, decisionIndex: 1, score: 60 },
  { actualIndex: 1, decisionIndex: 0, score: 60 }
]);
vm.runInContext(`replaySessions=[{key:'live-default::2026-08-26',manualStatus:'same'}]`,sandbox);
assert.equal(sandbox.effectiveReviewClass({batchId:'live-default',date:'2026-08-26',reviewClass:'execution_error'}),'correct_execution');
vm.runInContext(`replaySessions=[{key:'live-default::2026-08-26',manualStatus:'different'}]`,sandbox);
assert.equal(sandbox.effectiveReviewClass({batchId:'live-default',date:'2026-08-26',reviewClass:'correct_execution'}),'execution_error');
vm.runInContext(`replaySessions=[{key:'live-default::2026-08-26',manualStatus:'partial'}]`,sandbox);
assert.equal(sandbox.effectiveReviewClass({batchId:'live-default',date:'2026-08-26',reviewClass:'correct_execution'}),'correct_execution');
assert.match(html, /href="\.\.\/web-prototype\/index\.html"/);
assert.match(html, /href="\.\.\/research-system\/index\.html"/);
assert.match(html, /id="reviewForm"/);
assert.match(source, /openReviewView/);
assert.match(source, /hashchange/);
assert.match(html, /id="tradeContext"/);
assert.match(html, /class="opportunity-only"/);
assert.match(html, /name="improvement"/);
assert.match(html, /name="replayEntryTime"/);
assert.match(html, /name="replayR"/);
assert.match(html, /name="replayDecision"/);
assert.match(html, /name="replayDirection"/);
assert.match(html, /id="sessionReplayDialog"/);
assert.match(html, /id="addReplayDecision"/);
assert.match(source, /name="sessionSymbol"/);
assert.match(source, /data-session-status/);
assert.match(source, /manualStatus/);
assert.match(source, /function effectiveReviewClass/);
assert.match(source, /正確（含人工判定）/);
assert.match(source, /已恢復自動判定/);
assert.match(html, /提交並比較/);
assert.match(source, /form\.dataset\.mode=isOpportunity\?'opportunity':'trade-review'/);
assert.match(source, /values=isOpportunity\?/);
assert.match(source, /原始方向、進場時間與結果將在提交後揭曉/);

console.log("Standalone review system tests passed");
