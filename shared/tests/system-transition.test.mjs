import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync(new URL("../system-transition.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../system-transition.css", import.meta.url), "utf8");
const pages = [
  new URL("../../web-prototype/index.html", import.meta.url),
  new URL("../../research-system/index.html", import.meta.url),
  new URL("../../review-system/index.html", import.meta.url),
  new URL("../../analysis-system/index.html", import.meta.url),
].map(url => fs.readFileSync(url, "utf8"));

assert.match(script, /\.system-switcher a/);
assert.match(script, /system-is-switching/);
assert.match(script, /window\.location\.assign/);
assert.match(script, /sessionStorage\.setItem/);
assert.match(css, /system-transition-bar/);
assert.match(css, /system-transition-pending/);
assert.match(css, /pointer-events:all/);
for (const html of pages) {
  assert.match(html, /shared\/system-transition\.css/);
  assert.match(html, /shared\/system-transition\.js/);
  assert.match(html, /documentElement\.classList\.add\('system-transition-pending'\)/);
}

console.log("Shared system transition tests passed");
