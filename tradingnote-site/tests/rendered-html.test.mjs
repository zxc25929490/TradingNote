import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server renders the TradingNote application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>TradingNote/i);
  assert.match(html, /src="\/tradingnote\/index\.html"/i);
  assert.match(html, /title="TradingNote/i);
});

test("static application exposes breakpoint and grouped data controls", async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL("../public/tradingnote/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/tradingnote/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/tradingnote/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="breakpointMenu"/);
  assert.match(html, /id="deleteLiveBatchButton"/);
  assert.match(html, /id="dataMenu"/);
  assert.match(script, /function deleteActiveLiveBatch\(\)/);
  assert.match(script, /至少需要保留一個斷點/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@keyframes menu-in/);
});
