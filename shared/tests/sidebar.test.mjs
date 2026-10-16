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

// Every system groups its menu, and every group has at least one page to open.
const EXPECTED_GROUPS = {
  "web-prototype": ["每天", "每週檢討", "每月驗證", "目標規劃"],
  "research-system": ["總覽與紀錄", "規則與版本", "驗證分析"],
  "review-system": ["每次復盤", "定期檢討"],
  "analysis-system": ["找出問題", "驗證策略"],
};
for (const [system, expected] of Object.entries(EXPECTED_GROUPS)) {
  const html = read(`../../${system}/index.html`);
  const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
  const sections = nav.split('<span class="nav-section-title">').slice(1);
  assert.deepEqual(sections.map((part) => part.slice(0, part.indexOf("<"))), expected, `${system} groups`);
  for (const part of sections) assert.ok(/data-(page-link|view)=/.test(part), `${system}: every group has a page`);
  // Each nav item's icon should be unique so the icon rail stays readable.
  const icons = [...nav.matchAll(/<(?:a|button)[^>]*>\s*(?:<span[^>]*>)?([^<\s]{1,2})/g)].map((match) => match[1]);
  assert.equal(new Set(icons).size, icons.length, `${system}: duplicate nav icons ${icons}`);
}

// Behaviour guarantees.
assert.match(css, /\.nav-group\.collapsed > :not\(\.active\) \{ display: none; \}/, "a folded group keeps the current page");
assert.match(css, /body\.sidebar-rail\.sidebar-rail-capable \.sidebar \{ width: 76px/, "rail only when capable");
assert.match(js, /position === "fixed"/, "rail only for a fixed sidebar column");
assert.match(js, /group\.appendChild\(current\)/, "links are moved, not recreated");
assert.doesNotMatch(js, /cloneNode/);
assert.match(js, /createElement\(glyph \? "nav-icon" : "nav-label"\)/, "labels use custom elements so per-system span rules do not restyle them");

console.log("Sidebar tests passed");
