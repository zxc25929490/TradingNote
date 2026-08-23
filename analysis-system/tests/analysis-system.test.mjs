import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const monteCarloCss = fs.readFileSync(new URL("../monte-carlo.css", import.meta.url), "utf8");
const siblingPages = [
  new URL("../../web-prototype/index.html", import.meta.url),
  new URL("../../research-system/index.html", import.meta.url),
  new URL("../../review-system/index.html", import.meta.url),
].map(url => fs.readFileSync(url, "utf8"));

assert.match(html, /BACKTEST × REVIEW × LIVE/);
assert.match(html, /三層診斷/);
assert.match(html, /執行落差/);
assert.match(html, /策略與 Edge/);
assert.match(html, /三層 Monte Carlo 尾端風險/);
assert.match(html, /同日期三層績效/);
assert.match(html, /五層研究流程與用途/);
assert.match(html, /交易復盤/);
assert.match(html, /行情重建/);
assert.match(html, /Replay/);
assert.match(html, /research-system\/index\.html#strategies/);
assert.match(html, /research-system\/index\.html#journal/);
assert.match(html, /web-prototype\/index\.html#trades/);
assert.match(html, /review-system\/index\.html#queue/);
assert.match(app, /r:base\+recoverable/);
assert.match(app, /① EXECUTION GAP/);
assert.match(app, /② BACKTEST QUALITY GAP/);
assert.match(app, /③ EDGE REPLICATED/);
assert.match(app, /④ STRATEGY \/ REGIME WATCH/);
assert.match(app, /live\.count>=20&&backtest\.count>=20&&reviewed>=60/);
assert.match(app, /simulateMonteCarlo/);
assert.match(html, /mcLiveChart/);
assert.match(html, /mcReviewChart/);
assert.match(html, /mcBacktestChart/);
assert.match(css, /performance-chain/);
assert.match(css, /triple-curve/);
assert.match(fs.readFileSync(new URL("../workflow-guide.css", import.meta.url), "utf8"), /workflow-path/);
assert.match(monteCarloCss, /mc-layout/);
for (const page of siblingPages) assert.match(page, /analysis-system\/index\.html/);

console.log("Three-layer analysis system tests passed");
