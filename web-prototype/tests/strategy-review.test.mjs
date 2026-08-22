import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const reviewHtml = fs.readFileSync(new URL("../../review-system/index.html", import.meta.url), "utf8");

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
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(`
  const ATTRIBUTION_FIELDS = [
    ["missedTradeR", "漏單"], ["earlyExitR", "提早出場"],
    ["extraTradeR", "額外亂做"], ["lateEntryR", "太晚進場"],
    ["slippageR", "滑價／成本"], ["marketDriftR", "市場狀態差異"]
  ];
  var strategyVersions = [{ id: "S-1", name: "支撐壓力", version: "v1.0", locked: true }];
  ${extractFunction("strategyVersionLabel")}
  ${extractFunction("reviewClassLabel")}
  ${extractFunction("tradeAttributionTotal")}
`, sandbox);

assert.equal(sandbox.strategyVersionLabel("S-1"), "支撐壓力 v1.0");
assert.equal(sandbox.strategyVersionLabel(""), "未綁定策略");
assert.equal(sandbox.reviewClassLabel("execution_error"), "符合策略但執行錯誤");
assert.equal(sandbox.reviewClassLabel(""), "待復盤");
assert.equal(sandbox.tradeAttributionTotal({ missedTradeR: 1, earlyExitR: 0.8, extraTradeR: -2, slippageR: "0.2" }), 2);
assert.match(html, /href="\.\.\/review-system\/index\.html"/);
assert.doesNotMatch(html, /data-page-link="live-review"/);
assert.doesNotMatch(html, /data-page-link="review"/);
assert.doesNotMatch(html, /data-page-link="strategy"/);
assert.match(html, /id="homeComparisonCards"/);
assert.match(reviewHtml, /id="reviewRows"/);
assert.match(reviewHtml, /id="addMissedTrade"/);

console.log("Strategy version and review attribution tests passed");
