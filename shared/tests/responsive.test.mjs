import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const sidebarCss = read("../sidebar.css");
const sidebarJs = read("../sidebar.js");
const sharedCss = read("../responsive.css");

// Every page declares a mobile viewport and loads the shared phone layout.
for (const system of ["web-prototype", "research-system", "review-system", "analysis-system"]) {
  const html = read(`../../${system}/index.html`);
  assert.match(html, /<meta name="viewport" content="width=device-width, ?initial-scale=1"/, `${system} viewport meta`);
  if (system === "web-prototype") {
    assert.match(html, /responsive\.css\?v=/);
    assert.match(html, /responsive\.js\?v=/);
  } else {
    assert.match(html, /\.\.\/shared\/responsive\.css\?v=/, `${system} loads shared/responsive.css`);
  }
}

// Phones get the same top bar + drawer in every system, switched by one media query.
assert.match(sidebarJs, /matchMedia\("\(max-width: 760px\)"\)/);
assert.match(sidebarJs, /sidebar-menu-toggle/);
assert.match(sidebarJs, /event\.key === "Escape"/, "drawer closes with Escape");
assert.match(sidebarJs, /closest\("nav a, nav button, \.system-switcher a"\)\) setOpen\(false\)/, "choosing a page closes the drawer");
assert.match(sidebarCss, /body\.sidebar-mobile \.sidebar \{[\s\S]*height: 56px !important;/);
assert.match(sidebarCss, /body\.sidebar-mobile\.sidebar-open \.sidebar \{[\s\S]*width: min\(86vw, 320px\) !important;/);
// No rule may shift relatively-positioned headers under the bar (that overlapped the filters once).
assert.doesNotMatch(sidebarCss, /:is\(\.topbar, \.filters\) \{ top: 56px; \}/);

// The review queue becomes cards on phones, with the action reachable without sideways scrolling.
assert.match(sharedCss, /#reviewTableWrap thead \{ display: none; \}/);
assert.match(sharedCss, /#reviewTableWrap tbody td:last-child \{ grid-column: 1 \/ -1; \}/);

// Charts draw at their real width instead of a 640px minimum squeezed onto a phone.
assert.doesNotMatch(read("../../web-prototype/app.js"), /Math\.max\(640, canvas\.clientWidth/);

console.log("Responsive tests passed");
