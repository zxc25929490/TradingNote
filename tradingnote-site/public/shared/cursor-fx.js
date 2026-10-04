// Shared cursor effects for every TradingNote system: comet trail, click shockwave + sparks,
// and a lagging focus ring that reacts to interactive elements. Load after the page's own scripts.
(() => {
  if (window.__tradingNoteCursorFx) return;
  window.__tradingNoteCursorFx = true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;

  const PALETTES = {
    analysis: ["#b094ff", "#73e2ff", "#ffffff"],
    review: ["#27d3b4", "#f2b84b", "#ffffff"],
    research: ["#25d7b2", "#6b8cff", "#ffffff"],
    live: ["#25d7b2", "#ffb43a", "#ffffff"],
  };
  const path = window.location.pathname;
  const key = path.includes("/analysis-system/") ? "analysis" : path.includes("/review-system/") ? "review" : path.includes("/research-system/") ? "research" : "live";
  const [primary, secondary, white] = PALETTES[key];
  document.documentElement.style.setProperty("--fx-cursor-primary", primary);
  document.documentElement.style.setProperty("--fx-cursor-secondary", secondary);

  const canvas = document.createElement("canvas");
  canvas.className = "fx-cursor-canvas";
  const ring = document.createElement("i");
  ring.className = "fx-cursor-ring";
  const core = document.createElement("i");
  core.className = "fx-cursor-core";
  document.body.append(canvas, ring, core);
  const ctx = canvas.getContext("2d");

  // <dialog>.showModal() renders in the browser's top layer, above any z-index. Promote our overlay
  // into the top layer too, and re-raise it whenever a dialog opens so effects stay visible inside modals.
  const layers = [canvas, ring, core];
  const supportsPopover = typeof canvas.showPopover === "function";
  const raise = () => {
    if (!supportsPopover) return;
    for (const layer of layers) {
      try {
        if (layer.matches(":popover-open")) layer.hidePopover();
        layer.showPopover();
      } catch (_) { /* element not connected yet */ }
    }
  };
  if (supportsPopover) {
    layers.forEach((layer) => layer.setAttribute("popover", "manual"));
    raise();
    let raisePending = false;
    new MutationObserver(() => {
      if (raisePending) return;
      raisePending = true;
      requestAnimationFrame(() => { raisePending = false; raise(); });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  }

  let dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
  };
  resize();
  window.addEventListener("resize", resize);

  // Pre-rendered soft glows keep drawing cheap with hundreds of particles.
  const sprites = new Map();
  const sprite = (color) => {
    if (sprites.has(color)) return sprites.get(color);
    const size = 64;
    const buffer = document.createElement("canvas");
    buffer.width = buffer.height = size;
    const g = buffer.getContext("2d");
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(0.18, color);
    gradient.addColorStop(0.55, `${color}55`);
    gradient.addColorStop(1, `${color}00`);
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    sprites.set(color, buffer);
    return buffer;
  };

  const MAX_PARTICLES = 420;
  const particles = [];
  const rand = (min, max) => min + Math.random() * (max - min);
  const pickColor = () => [primary, primary, secondary, white][Math.floor(Math.random() * 4)];

  let pointerX = -100;
  let pointerY = -100;
  let ringX = -100;
  let ringY = -100;
  let lastEmitX = null;
  let lastEmitY = null;
  let dragging = false;
  let running = false;
  let lastFrame = 0;

  const spawn = (particle) => {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ age: 0, delay: 0, drag: 1, spin: 0, ...particle });
  };

  const emitTrail = (x, y, speed) => {
    if (lastEmitX === null) { lastEmitX = x; lastEmitY = y; return; }
    const dx = x - lastEmitX;
    const dy = y - lastEmitY;
    const distance = Math.hypot(dx, dy);
    const step = dragging ? 5 : 8;
    const count = Math.min(10, Math.floor(distance / step));
    for (let i = 1; i <= count; i += 1) {
      const t = i / count;
      const px = lastEmitX + dx * t;
      const py = lastEmitY + dy * t;
      const sparkle = Math.random() < (dragging ? 0.28 : 0.14);
      spawn({
        kind: sparkle ? "star" : "dot",
        x: px + rand(-2, 2),
        y: py + rand(-2, 2),
        vx: -dx / Math.max(distance, 1) * rand(0, 0.35) + rand(-0.25, 0.25),
        vy: -dy / Math.max(distance, 1) * rand(0, 0.35) + rand(-0.25, 0.25) - 0.05,
        size: (sparkle ? rand(9, 17) : rand(6, 12) + Math.min(8, speed * 0.25)) * (dragging ? 1.4 : 1),
        life: rand(480, 820) * (dragging ? 1.25 : 1),
        color: pickColor(),
        spin: rand(-0.006, 0.006),
        rotation: rand(0, Math.PI),
      });
    }
    if (count) { lastEmitX = x; lastEmitY = y; }
  };

  const emitBurst = (x, y) => {
    spawn({ kind: "ring", x, y, size: 56, life: 520, color: primary, width: 2.5 });
    spawn({ kind: "ring", x, y, size: 96, life: 760, color: secondary, width: 1.5, delay: 70 });
    spawn({ kind: "dot", x, y, vx: 0, vy: 0, size: 54, life: 260, color: white });
    for (let i = 0; i < 22; i += 1) {
      const angle = (Math.PI * 2 * i) / 22 + rand(-0.12, 0.12);
      const speed = rand(2.2, 6.4);
      spawn({
        kind: i % 4 === 0 ? "star" : "dot",
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 0.93,
        size: i % 4 === 0 ? rand(12, 20) : rand(5, 10),
        life: rand(560, 980),
        color: pickColor(),
        rotation: rand(0, Math.PI),
        spin: rand(-0.01, 0.01),
      });
    }
  };

  const drawStar = (x, y, radius, rotation) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const r = i % 2 === 0 ? radius : radius * 0.22;
      const angle = (Math.PI / 4) * i;
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const frame = (now) => {
    const dt = Math.min(40, now - lastFrame || 16);
    lastFrame = now;

    ringX += (pointerX - ringX) * Math.min(1, dt * 0.014);
    ringY += (pointerY - ringY) * Math.min(1, dt * 0.014);
    ring.style.transform = `translate3d(${ringX}px,${ringY}px,0)`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = "lighter";

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      const progress = p.age / p.life;
      if (progress >= 1) { particles.splice(i, 1); continue; }
      const fade = 1 - progress;
      if (p.kind === "ring") {
        const eased = 1 - Math.pow(1 - progress, 3);
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * fade + 0.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * eased, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const frameScale = dt / 16;
      p.x += p.vx * frameScale;
      p.y += p.vy * frameScale;
      p.vx *= Math.pow(p.drag, frameScale);
      p.vy *= Math.pow(p.drag, frameScale);
      p.rotation = (p.rotation || 0) + p.spin * dt;
      if (p.kind === "star") {
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        drawStar(p.x, p.y, p.size * (0.4 + fade * 0.6), p.rotation);
      } else {
        const size = p.size * (0.35 + fade * 0.65) * 2.4;
        ctx.globalAlpha = fade * 0.95;
        ctx.drawImage(sprite(p.color), p.x - size / 2, p.y - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    const settling = Math.abs(pointerX - ringX) + Math.abs(pointerY - ringY) > 0.4;
    if (particles.length || settling) requestAnimationFrame(frame);
    else running = false;
  };
  const wake = () => {
    if (running || document.hidden) return;
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  };

  const INTERACTIVE = "button, a, summary, select, input, textarea, label, [role='button'], [tabindex]:not([tabindex='-1']), [data-id], .card, tbody tr";
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (ringX < 0) { ringX = pointerX; ringY = pointerY; }
    core.style.transform = `translate3d(${pointerX}px,${pointerY}px,0)`;
    ring.classList.add("visible");
    core.classList.add("visible");
    ring.classList.toggle("interactive", Boolean(event.target.closest?.(INTERACTIVE)));
    emitTrail(pointerX, pointerY, Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0));
    wake();
  }, { passive: true });

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    dragging = true;
    ring.classList.add("pressed");
    emitBurst(event.clientX, event.clientY);
    wake();
  });
  const release = () => { dragging = false; ring.classList.remove("pressed"); };
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  document.documentElement.addEventListener("pointerleave", () => {
    ring.classList.remove("visible");
    core.classList.remove("visible");
    lastEmitX = null;
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) particles.length = 0; });
})();
