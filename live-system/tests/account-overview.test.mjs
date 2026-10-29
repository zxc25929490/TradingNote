import assert from "node:assert/strict";
import fs from "node:fs";

await import("../account-overview.js");
const overview = globalThis.TradingNoteAccountOverview;
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

// Money statistics are derived from the same trades and balance path the page draws.
const model = {
  initial: 100000,
  stats: { averageWin: 2, averageLoss: -1 },
  trades: [
    { profit: 500, lots: 1, holdingSeconds: 600 },
    { profit: -200, lots: 2, holdingSeconds: 1200 },
    { profit: 300, lots: 1 },
    { profit: -400, lots: 1 },
  ],
  balancePoints: [
    { balance: 100000 }, { balance: 100500 }, { balance: 100300 }, { balance: 100600 }, { balance: 100200 },
  ],
};
const stats = overview.tradeStats(model);
assert.equal(stats.count, 4);
assert.equal(stats.lots, 5);
assert.equal(stats.avgWin, 400);
assert.equal(stats.avgLoss, -300);
assert.equal(stats.best, 500);
assert.equal(stats.worst, -400);
assert.equal(stats.profitFactorMoney, 800 / 600);
assert.equal(stats.expectancyMoney, 50);
assert.equal(stats.maxDrawdown, 400, "peak 100600 -> 100200");
assert.equal(stats.rrr, 2);
assert.equal(stats.avgHold, 900);

// The overview is the landing page and reuses the objectives page's rule evaluation.
assert.match(html, /<section id="account" class="page active" data-page="account">/);
assert.match(html, /href="#account" data-page-link="account"/);
assert.match(app, /function evaluateObjectives\(items\)/);
assert.match(app, /function renderObjectives\(items\) \{\n  const \{[\s\S]*?\} = evaluateObjectives\(items\);/);
assert.match(app, /setPage\(window\.location\.hash\.slice\(1\) \|\| "account"\);/);
// Every name renderObjectives reads from the shared evaluation must be destructured (a missed one broke start-up once).
const block = app.slice(app.indexOf("function renderObjectives(items) {"), app.indexOf("} = evaluateObjectives(items);"));
for (const name of ["positiveProfit", "bestDay", "bestDayPercent", "extraNeeded", "discipline", "maxLossFloor", "dailyLimit"]) {
  assert.ok(block.includes(name), `renderObjectives destructures ${name}`);
}

// Visual effects are opt-in in every system (no html.fx-on unless the user switched them on).
for (const system of ["live-system", "research-system", "review-system", "analysis-system"]) {
  const page = fs.readFileSync(new URL(`../../${system}/index.html`, import.meta.url), "utf8");
  assert.match(page, /localStorage\.getItem\('tradingnote\.effects'\)==='on'/, `${system} restores the effects switch early`);
}
assert.match(fs.readFileSync(new URL("../effects.css", import.meta.url), "utf8"), /html\.fx-on \{/);

console.log("Account overview tests passed");
