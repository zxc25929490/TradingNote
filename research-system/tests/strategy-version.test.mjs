import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(html, /data-view="strategies"/);
assert.match(source, /openResearchView/);
assert.match(source, /hashchange/);
assert.match(html, /id="strategyCards"/);
assert.match(html, /id="strategyForm"/);
assert.match(source, /function renderStrategies\(/);
assert.match(source, /localStorage\.setItem\(strategyVersionsKey/);

console.log("Research strategy version tests passed");
