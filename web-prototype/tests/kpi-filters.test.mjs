import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

// A strategy-version filter exists and actually filters, counts as an active condition, and resets.
assert.match(html, /<select id="strategyFilter">/);
assert.match(app, /return yearOk && pairOk && outcomeOk && strategyOk && queryOk;/);
assert.match(app, /\(els\.strategyFilter\?\.value \|\| "all"\) !== "all"/);
assert.match(app, /if \(els\.strategyFilter\) els\.strategyFilter\.value = "all";/);

// Mixed strategies / all breakpoints are flagged above the numbers.
assert.match(html, /id="mixWarning"/);
assert.match(app, /function renderMixWarning\(items\)/);
assert.match(app, /renderMixWarning\(items\);\n  renderMetrics\(items\);/);

// Headline KPIs carry sample size and 95% intervals.
assert.match(html, /id="expectancyCi"/);
assert.match(app, /wilson\(stats\.wins, stats\.decided\)/);
assert.match(app, /meanInterval\(rList\)/);
assert.match(app, /尚不能確定為正/);

// The unreachable research-lab duplicate stays removed.
assert.doesNotMatch(html, /id="research-lab"/);
assert.doesNotMatch(app, /function runMonteCarloSimulation/);

console.log("KPI and filter tests passed");
