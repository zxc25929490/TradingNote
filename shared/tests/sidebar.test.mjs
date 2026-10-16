import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../sidebar.css");
const js = read("../sidebar.js");

// Every system loads the same collapsible sidebar.
for (const system of ["web-prototype", "research-system", "review-system", "analysis-system"]) {
  const html = read(`../../${system}/index.html`);
  assert.match(html, /\.\.\/shared\/sidebar\.css\?v=/, `${system} loads sidebar.css`);
  assert.match(html, /\.\.\/shared\/sidebar\.js\?v=/, `${system} loads sidebar.js`);
  assert.match(html, /<aside class="sidebar">[\s\S]*<nav[\s>]/, `${system} has a sidebar nav`);
}

// The live dashboard's sections each have links to fold.
const live = read("../../web-prototype/index.html");
const nav = live.slice(live.indexOf('<nav aria-label="主要導覽">'), live.indexOf("</nav>"));
const sections = nav.split('<span class="nav-section-title">').slice(1);
assert.deepEqual(sections.map((part) => part.slice(0, part.indexOf("<"))), ["每天", "每週檢討", "每月驗證", "目標規劃"]);
for (const part of sections) assert.ok(/data-page-link=/.test(part));

// Behaviour guarantees.
assert.match(css, /\.nav-group\.collapsed > :not\(\.active\) \{ display: none; \}/, "a folded group keeps the current page");
assert.match(css, /body\.sidebar-rail\.sidebar-rail-capable \.sidebar \{ width: 76px/, "rail only when capable");
assert.match(js, /position === "fixed"/, "rail only for a fixed sidebar column");
assert.match(js, /group\.appendChild\(current\)/, "links are moved, not recreated");
assert.doesNotMatch(js, /cloneNode/);
assert.match(js, /createElement\(glyph \? "nav-icon" : "nav-label"\)/, "labels use custom elements so per-system span rules do not restyle them");

console.log("Sidebar tests passed");
