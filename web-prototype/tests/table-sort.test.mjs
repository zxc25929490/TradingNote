import assert from "node:assert/strict";
import fs from "node:fs";

const liveHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const liveJs = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const researchHtml = fs.readFileSync(new URL("../../research-system/index.html", import.meta.url), "utf8");
const researchJs = fs.readFileSync(new URL("../../research-system/app.js", import.meta.url), "utf8");
const reviewHtml = fs.readFileSync(new URL("../../review-system/index.html", import.meta.url), "utf8");
const reviewJs = fs.readFileSync(new URL("../../review-system/app.js", import.meta.url), "utf8");

assert.match(liveHtml, /data-trade-sort="date"/);
assert.match(liveHtml, /data-trade-sort="profit"/);
assert.match(liveHtml, /data-trade-sort="r"/);
assert.match(liveJs, /function sortTradeTable\(/);

assert.match(researchHtml, /data-journal-sort="date"/);
assert.match(researchHtml, /data-journal-sort="r"/);
assert.match(researchJs, /function sortedJournalRows\(/);

assert.match(reviewHtml, /data-review-sort="date"/);
assert.match(reviewHtml, /data-review-sort="gap"/);
assert.match(reviewJs, /function sortedReviewRows\(/);

console.log("Cross-system table sort tests passed");
