import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../sidebar.css", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../sidebar.js", import.meta.url), "utf8");

// The sidebar script and styles are loaded, and every nav section has links to fold.
assert.match(html, /sidebar\.css\?v=/);
assert.match(html, /sidebar\.js\?v=/);
const nav = html.slice(html.indexOf('<nav aria-label="主要導覽">'), html.indexOf("</nav>"));
const sections = nav.split('<span class="nav-section-title">').slice(1);
assert.deepEqual(sections.map((part) => part.slice(0, part.indexOf("<"))), ["每天", "每週檢討", "每月驗證", "目標規劃"]);
for (const part of sections) assert.ok(/data-page-link=/.test(part), "each section has at least one link");

// A folded group keeps the current page visible; the icon rail only applies on wide screens;
// narrow screens dissolve groups back into the horizontal menu.
assert.match(css, /\.nav-group\.collapsed > a:not\(\.active\) \{ display: none; \}/);
assert.match(css, /@media \(min-width: 981px\)[\s\S]*body\.sidebar-rail \.sidebar \{ width: 76px/);
assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.nav-group \{ display: contents; \}/);
// Links are moved, not recreated, so app.js keeps working references to them.
assert.match(js, /group\.appendChild\(current\)/);
assert.doesNotMatch(js, /cloneNode/);

console.log("Sidebar tests passed");
