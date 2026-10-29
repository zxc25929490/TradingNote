import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const theme = read("shared/theme.css");
const sidebar = read("shared/sidebar.js");

// One palette, light and dark, that re-points every system's own token names.
assert.match(theme, /html\[data-theme="light"\] \{/);
assert.match(theme, /html\[data-theme="dark"\] \{/);
for (const token of ["--bg", "--surface", "--panel", "--line", "--ink", "--muted", "--accent", "--teal", "--win", "--loss", "--red"]) {
  assert.match(theme, new RegExp(`\\n  ${token}: var\\(--tn-`), `theme.css aliases ${token}`);
}
// A universal scrollbar-color rule froze Chrome on long pages; keep it on the root only.
assert.doesNotMatch(theme, /\* \{ scrollbar-color/);

for (const system of ["live-system", "research-system", "review-system", "analysis-system"]) {
  const page = read(`${system}/index.html`);
  // The theme is applied before first paint, and theme.css is the last stylesheet so it wins.
  assert.match(page, /document\.documentElement\.dataset\.theme=localStorage\.getItem\('tradingnote\.theme'\)==='light'\?'light':'dark'/, `${system} restores the theme early`);
  const sheets = [...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);
  assert.match(sheets.at(-1), /^\.\.\/shared\/theme\.css\?v=/, `${system} loads theme.css last`);
  assert.match(page, /fonts\.googleapis\.com\/css2\?family=Inter/, `${system} loads Inter`);
  // The system's own stylesheet no longer defines its own colour palette.
  const styles = read(`${system}/styles.css`);
  assert.doesNotMatch(styles, /:root\s*\{[^}]*--(bg|ink|surface|panel)\s*:\s*#/, `${system} has no legacy palette`);
}

// The sidebar switch keeps html[data-theme] and live-system's body.dark in step, and tells pages to redraw.
assert.match(sidebar, /window\.TradingNoteSetTheme = \(theme\) =>/);
assert.match(sidebar, /document\.body\.classList\.toggle\("dark", theme === "dark"\);/);
assert.match(sidebar, /new CustomEvent\("tradingnote:themechange"/);
assert.match(read("live-system/app.js"), /window\.addEventListener\("tradingnote:themechange"/);
assert.match(read("analysis-system/app.js"), /window\.addEventListener\("tradingnote:themechange"/);

console.log("Theme tests passed");
