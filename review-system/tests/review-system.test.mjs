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

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(`
  const ATTR=[['missedTradeR','漏單'],['earlyExitR','提早出場'],['extraTradeR','額外亂做'],['lateEntryR','太晚進場'],['slippageR','滑價／成本'],['marketDriftR','市場狀態差異']];
  const CLASS_LABELS={correct_execution:'符合策略且執行正確',execution_error:'符合策略但執行錯誤',rule_violation:'不符合策略卻進場',missed_trade:'符合策略但漏單'};
  ${extractFunction("classLabel")}
  ${extractFunction("gapTotal")}
`, sandbox);

assert.equal(sandbox.classLabel("missed_trade"), "符合策略但漏單");
assert.equal(sandbox.classLabel(""), "待復盤");
assert.equal(sandbox.gapTotal({ missedTradeR: 1.2, earlyExitR: ".5", extraTradeR: -3 }), 1.7);
assert.match(html, /href="\.\.\/web-prototype\/index\.html"/);
assert.match(html, /href="\.\.\/research-system\/index\.html"/);
assert.match(html, /id="reviewForm"/);
assert.match(source, /openReviewView/);
assert.match(source, /hashchange/);
assert.match(html, /id="tradeContext"/);
assert.match(html, /class="opportunity-only"/);
assert.match(html, /name="improvement"/);
assert.match(source, /form\.dataset\.mode=isOpportunity\?'opportunity':'trade-review'/);
assert.match(source, /values=isOpportunity\?/);
assert.match(source, /原始實盤資料保持不變/);

console.log("Standalone review system tests passed");
