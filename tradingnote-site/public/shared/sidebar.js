// Shared collapsible sidebar for every TradingNote system.
// - Section titles (.nav-section-title) fold the links that follow them; the current page stays visible.
// - The whole sidebar can shrink to an icon rail. The choice is shared by all systems (same storage key).
// - The rail only applies while the sidebar is a fixed column, so each system's own mobile layout is untouched.
(() => {
  const sidebar = document.querySelector(".sidebar");
  const nav = sidebar?.querySelector("nav");
  if (!sidebar || !nav || sidebar.dataset.collapsible) return;
  sidebar.dataset.collapsible = "true";

  const STORAGE_KEY = "tradingnote.sidebar";
  const read = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (_) { return {}; }
  };
  const state = { rail: false, collapsed: [], ...read() };
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), ...state })); } catch (_) { /* storage unavailable */ }
  };
  const isGlyph = (text) => text.length > 0 && text.length <= 2;

  // Normalise every nav item into <icon><label> so the rail can hide labels. Systems differ: some put the
  // icon in a <span> before the text, research puts a bare glyph before a <span> label.
  for (const item of nav.querySelectorAll(":scope > a, :scope > button")) {
    let icon = null;
    for (const node of [...item.childNodes]) {
      const text = node.textContent.trim();
      if (!text) continue;
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "EM") { node.classList.add("nav-badge"); continue; }
      const glyph = !icon && isGlyph(text);
      // Bare text gets a custom element so existing "nav span" rules in each system do not restyle it.
      const wrapper = node.nodeType === Node.ELEMENT_NODE ? node : document.createElement(glyph ? "nav-icon" : "nav-label");
      if (wrapper !== node) { node.replaceWith(wrapper); wrapper.textContent = text; }
      if (glyph) { icon = wrapper; wrapper.classList.add("nav-icon"); }
      else wrapper.classList.add("nav-label");
    }
    const label = [...item.querySelectorAll(".nav-label")].map((node) => node.textContent.trim()).join(" ");
    if (label) { item.title = label; item.setAttribute("aria-label", label); }
  }

  // Fold groups: the link elements are moved, not recreated, so each app keeps its references to them.
  const titles = [...nav.querySelectorAll(":scope > .nav-section-title")];
  titles.forEach((title, index) => {
    const name = title.textContent.trim();
    const group = document.createElement("div");
    group.className = "nav-group";
    group.id = `nav-group-${index}`;
    let next = title.nextElementSibling;
    while (next && !next.classList.contains("nav-section-title")) {
      const current = next;
      next = next.nextElementSibling;
      group.appendChild(current);
    }
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-section-title nav-group-toggle";
    toggle.dataset.group = name;
    toggle.setAttribute("aria-controls", group.id);
    toggle.innerHTML = `<span>${name}</span><i aria-hidden="true">▾</i>`;
    title.replaceWith(toggle);
    toggle.after(group);
  });

  // One consistent line-icon set, keyed by label; anything unmapped keeps its text glyph.
  const ICON_PATHS = {
    grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    today: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18M9 15.5l2 2 4-4"/>',
    check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4M9 12.5l2 2 4-4"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    bars: '<path d="M3 21h18M7 17v-6M12 17V6M17 17v-9"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 6-7"/>',
    sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r=".6"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4"/>',
    diff: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
    book: '<path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2zM5 20a2 2 0 0 0 2 1h12v-3"/>',
    alert: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5"/>',
    gap: '<path d="m3 7 6 6 4-4 8 8M21 11v6h-6"/>',
    loop: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
    inbox: '<path d="M3 13h5l2 3h4l2-3h5M5.5 5h13L21 13v6H3v-6z"/>',
    edge: '<path d="M12 3 21 12 12 21 3 12z"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    compare: '<rect x="3" y="8" width="6" height="12" rx="1.5"/><rect x="15" y="4" width="6" height="16" rx="1.5"/><path d="M12 3v18"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
  };
  const NAV_ICONS = {
    帳戶總覽: "grid", 今日待辦: "today", 交易檢查: "check", 風控計算: "calc", 交易紀錄: "list",
    週月績效: "bars", 深度分析: "chart", 心態與標籤: "tag", 進階統計: "sigma", "TP 統計": "target", 斷點比較: "compare", 斷點管理: "sliders", 收入目標: "flag", 挑戰目標: "trophy",
    研究總覽: "grid", 回測紀錄: "list", 決策差異: "diff", "Rule Book": "book", 錯誤資料庫: "alert",
    策略版本: "layers", "TP 模擬器": "target", "回測 vs 實盤": "diff",
    復盤工作台: "inbox", 執行落差: "gap", 復盤結論: "book", 改善追蹤: "loop",
    三層診斷: "layers", "策略與 Edge": "edge", "Monte Carlo": "dice",
  };
  const svgIcon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  for (const icon of nav.querySelectorAll(".nav-icon")) {
    const name = NAV_ICONS[icon.closest("a, button")?.title];
    if (name) icon.innerHTML = svgIcon(name);
  }

  // The four systems collapse into one row showing the current system; clicking it unfolds the others.
  const switcher = sidebar.querySelector(".system-switcher");
  for (const link of switcher?.querySelectorAll("a") || []) link.title = link.querySelector("b")?.textContent || "";
  if (switcher) {
    const current = switcher.querySelector("a.active") || switcher.querySelector("a");
    const systemButton = document.createElement("button");
    systemButton.type = "button";
    systemButton.className = "system-current";
    systemButton.setAttribute("aria-expanded", "false");
    systemButton.title = "切換系統";
    systemButton.innerHTML = `<span class="system-code">${current.querySelector("span")?.textContent || ""}</span><b class="nav-label">${current.querySelector("b")?.textContent || ""}</b><i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></i>`;
    switcher.before(systemButton);
    const setSystemsOpen = (open) => {
      sidebar.classList.toggle("systems-open", open);
      systemButton.setAttribute("aria-expanded", String(open));
    };
    systemButton.addEventListener("click", () => setSystemsOpen(!sidebar.classList.contains("systems-open")));
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".system-current, .system-switcher")) setSystemsOpen(false);
    });
  }

  const brand = sidebar.querySelector(".brand");
  [...(brand?.children || [])].slice(1).forEach((child) => child.classList.add("sidebar-brand-text"));
  const railButton = document.createElement("button");
  railButton.type = "button";
  railButton.className = "sidebar-rail-toggle";
  (brand || sidebar).appendChild(railButton);


  // Visual effects switch (cursor trail, card tilt, glow). Off by default; shared by all systems.
  const FX_KEY = "tradingnote.effects";
  // Settings live together in one footer: partial-exit setup (shared/partial-exit.js), theme, effects.
  const footer = document.createElement("div");
  footer.className = "sidebar-footer";
  sidebar.appendChild(footer);
  const partialExit = sidebar.querySelector(".partial-exit-sidebar");
  if (partialExit) footer.appendChild(partialExit);
  const fxButton = document.createElement("button");
  fxButton.type = "button";
  fxButton.className = "fx-switch";
  footer.appendChild(fxButton);
  const applyFx = (on) => {
    document.documentElement.classList.toggle("fx-on", on);
    fxButton.setAttribute("aria-pressed", String(on));
    fxButton.innerHTML = `<span class="nav-icon">${svgIcon("sparkle")}</span><span class="fx-switch-track" aria-hidden="true"><i></i></span><span class="nav-label">動態特效</span>`;
    fxButton.title = on ? "關閉動態特效" : "開啟動態特效";
  };
  let fxOn = false;
  try { fxOn = localStorage.getItem(FX_KEY) === "on"; } catch (_) { fxOn = false; }
  applyFx(fxOn);
  fxButton.addEventListener("click", () => {
    fxOn = !document.documentElement.classList.contains("fx-on");
    try { localStorage.setItem(FX_KEY, fxOn ? "on" : "off"); } catch (_) { /* storage unavailable */ }
    applyFx(fxOn);
  });
  window.addEventListener("storage", (event) => { if (event.key === FX_KEY) applyFx(event.newValue === "on"); });

  // Light / dark theme, shared by all systems (html[data-theme], see theme.css). live-system also keys
  // its own styles off body.dark, and redraws its canvases on "tradingnote:themechange".
  const THEME_KEY = "tradingnote.theme";
  const themeButton = document.createElement("button");
  themeButton.type = "button";
  themeButton.className = "theme-switch";
  footer.insertBefore(themeButton, fxButton);
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle("dark", theme === "dark");
    const label = theme === "dark" ? "淺色模式" : "深色模式";
    themeButton.innerHTML = `<span class="nav-icon theme-switch-icon">${svgIcon(theme === "dark" ? "sun" : "moon")}</span><span class="nav-label">${label}</span>`;
    themeButton.title = `切換為${label}`;
  };
  window.TradingNoteSetTheme = (theme) => {
    const next = theme === "light" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* storage unavailable */ }
    applyTheme(next);
    window.dispatchEvent(new CustomEvent("tradingnote:themechange", { detail: { theme: next } }));
  };
  applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  themeButton.addEventListener("click", () => {
    window.TradingNoteSetTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_KEY) return;
    applyTheme(event.newValue === "light" ? "light" : "dark");
    window.dispatchEvent(new CustomEvent("tradingnote:themechange", { detail: { theme: event.newValue } }));
  });

  // Phones: the sidebar becomes a top bar, and the menu opens as a drawer.
  const MOBILE_QUERY = window.matchMedia("(max-width: 760px)");
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "sidebar-menu-toggle";
  sidebar.appendChild(menuButton);
  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  document.body.appendChild(backdrop);
  const setOpen = (open) => {
    document.body.classList.toggle("sidebar-open", open);
    menuButton.textContent = open ? "✕" : "☰";
    menuButton.setAttribute("aria-label", open ? "關閉選單" : "開啟選單");
    menuButton.setAttribute("aria-expanded", String(open));
    if (open) sidebar.scrollTop = 0;
  };
  menuButton.addEventListener("click", () => setOpen(!document.body.classList.contains("sidebar-open")));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) setOpen(false);
  });
  // Choosing a page or another system closes the drawer; folding a group does not.
  sidebar.addEventListener("click", (event) => {
    if (!document.body.classList.contains("sidebar-open")) return;
    if (event.target.closest(".nav-group-toggle, .sidebar-menu-toggle")) return;
    if (event.target.closest("nav a, nav button, .system-switcher a")) setOpen(false);
  });
  setOpen(false);

  // Only a fixed, full-height sidebar can become a rail; stacked mobile sidebars stay as they are.
  const capable = () => getComputedStyle(sidebar).position === "fixed" && window.innerWidth > 760;

  function apply() {
    const mobile = MOBILE_QUERY.matches;
    document.body.classList.toggle("sidebar-mobile", mobile);
    if (!mobile) setOpen(false);
    const canRail = !mobile && capable();
    document.body.classList.toggle("sidebar-rail-capable", canRail);
    document.body.classList.toggle("sidebar-rail", Boolean(state.rail) && canRail);
    railButton.hidden = !canRail;
    railButton.textContent = state.rail ? "»" : "«";
    railButton.title = state.rail ? "展開側欄" : "收合成圖示";
    railButton.setAttribute("aria-label", railButton.title);
    railButton.setAttribute("aria-expanded", String(!state.rail));
    for (const toggle of nav.querySelectorAll(".nav-group-toggle")) {
      const collapsed = state.collapsed.includes(toggle.dataset.group);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.nextElementSibling.classList.toggle("collapsed", collapsed);
    }
  }

  nav.addEventListener("click", (event) => {
    const toggle = event.target.closest(".nav-group-toggle");
    if (!toggle) return;
    const name = toggle.dataset.group;
    state.collapsed = state.collapsed.includes(name) ? state.collapsed.filter((item) => item !== name) : [...state.collapsed, name];
    save();
    apply();
  });
  railButton.addEventListener("click", () => {
    state.rail = !state.rail;
    save();
    apply();
  });
  // The rail button disappears when the sidebar stops being a fixed column; recheck on resize.
  // Classes are toggled before measuring so the check sees the layout without the rail applied.
  window.addEventListener("resize", () => {
    document.body.classList.remove("sidebar-rail", "sidebar-rail-capable");
    apply();
  });
  // Another system tab changed the shared setting.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    Object.assign(state, { rail: false, collapsed: [] }, read());
    apply();
  });

  apply();
})();
