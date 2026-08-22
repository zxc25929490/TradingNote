import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const siblingPages = [
  new URL("../../web-prototype/index.html", import.meta.url),
  new URL("../../research-system/index.html", import.meta.url),
  new URL("../../review-system/index.html", import.meta.url),
].map(url => fs.readFileSync(url, "utf8"));

assert.match(html, /BACKTEST × REVIEW × LIVE/);
assert.match(html, /三層診斷/);
assert.match(html, /執行落差/);
assert.match(html, /策略與 Edge/);
assert.match(app, /r:base\+recoverable/);
assert.match(app, /① EXECUTION GAP/);
assert.match(app, /② BACKTEST QUALITY GAP/);
assert.match(app, /③ EDGE REPLICATED/);
assert.match(app, /④ STRATEGY \/ REGIME WATCH/);
assert.match(app, /live\.count>=20&&backtest\.count>=20&&reviewed>=60/);
assert.match(css, /performance-chain/);
assert.match(css, /triple-curve/);
for (const page of siblingPages) assert.match(page, /analysis-system\/index\.html/);

console.log("Three-layer analysis system tests passed");
