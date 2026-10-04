import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../cursor-fx.js", import.meta.url), "utf8");

function createHarness(pathname, { reduced = false, fine = true, popover = true } = {}) {
  const topLayer = [];
  const observers = [];
  const draws = { drawImage: 0, arc: 0, fill: 0, stroke: 0 };
  const makeCtx = () => new Proxy({}, {
    get: (_, name) => {
      if (name in draws) return () => { draws[name] += 1; };
      if (name === "getContext") return undefined;
      if (name === "createRadialGradient") return () => ({ addColorStop() {} });
      return () => {};
    },
    set: () => true,
  });
  const makeElement = () => {
    const classes = new Set();
    const element = {
      style: { setProperty() {} },
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
        has: (c) => classes.has(c),
      },
      getContext: makeCtx,
      width: 0,
      height: 0,
      setAttribute() {},
    };
    if (popover) {
      element.matches = () => topLayer.includes(element);
      element.showPopover = () => { topLayer.push(element); };
      element.hidePopover = () => { topLayer.splice(topLayer.indexOf(element), 1); };
    }
    return element;
  };
  const listeners = {};
  const rafQueue = [];
  const document = {
    hidden: false,
    documentElement: { style: { setProperty() {} }, addEventListener() {} },
    body: { append() {} },
    createElement: makeElement,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  const window = {
    location: { pathname },
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    matchMedia: (query) => ({ matches: query.includes("reduce") ? reduced : fine }),
    addEventListener() {},
  };
  const context = {
    window, document, performance: { now: () => now }, Math, Number, Map, Set, Boolean, Array,
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
  };
  context.globalThis = context;
  let now = 0;
  vm.runInNewContext(source, context);
  const fire = (type, init = {}) => (listeners[type] || []).forEach((fn) => fn({
    pointerType: "mouse", button: 0, movementX: 10, movementY: 4, target: { closest: () => null }, ...init,
  }));
  const step = (ms = 16) => {
    now += ms;
    const queued = rafQueue.splice(0);
    queued.forEach((fn) => fn(now));
    return queued.length;
  };
  return { draws, fire, step, listeners, rafQueue, window, topLayer, observers };
}

// Each system loads the same module and gets its own palette without throwing.
for (const path of ["/web-prototype/index.html", "/research-system/index.html", "/review-system/index.html", "/analysis-system/index.html"]) {
  const h = createHarness(path);
  assert.ok(h.listeners.pointermove?.length, `${path} must register pointer handlers`);
}

// Movement + click produce visible drawing, then everything settles and the loop stops.
const h = createHarness("/web-prototype/index.html");
for (let i = 0; i < 20; i += 1) h.fire("pointermove", { clientX: 100 + i * 12, clientY: 200 });
h.fire("pointerdown", { clientX: 340, clientY: 200 });
assert.ok(h.rafQueue.length > 0, "pointer activity must schedule animation");
let frames = 0;
while (h.step() && frames < 400) frames += 1;
assert.ok(h.draws.drawImage > 20, "trail glow sprites must be drawn");
assert.ok(h.draws.arc >= 2, "click shockwave rings must be drawn");
assert.ok(h.draws.fill > 0, "sparkle stars must be drawn");
assert.ok(frames < 400, "animation loop must stop once particles fade out");

// Overlay lives in the top layer and is re-raised above any dialog that opens later.
const modal = createHarness("/web-prototype/index.html");
assert.equal(modal.topLayer.length, 3, "canvas, ring and core must be promoted to the top layer");
const original = [...modal.topLayer];
modal.topLayer.push({ id: "dialog" }); // a modal <dialog> opened after the overlay
modal.observers.forEach((notify) => notify([]));
modal.step();
assert.equal(modal.topLayer.length, 4, "no duplicates after re-raise");
assert.deepEqual(modal.topLayer.slice(-3), original, "overlay must sit above the newly opened dialog");

// Browsers without the Popover API keep working with the plain fixed overlay.
const legacy = createHarness("/web-prototype/index.html", { popover: false });
assert.equal(legacy.observers.length, 0);
assert.ok(legacy.listeners.pointermove?.length);

// Reduced motion and touch-only devices get no effects at all.
assert.equal(createHarness("/web-prototype/index.html", { reduced: true }).listeners.pointermove, undefined);
assert.equal(createHarness("/web-prototype/index.html", { fine: false }).listeners.pointermove, undefined);

console.log("Cursor FX tests passed");
