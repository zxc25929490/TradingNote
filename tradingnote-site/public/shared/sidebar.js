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

  for (const link of sidebar.querySelectorAll(".system-switcher a")) link.title = link.querySelector("b")?.textContent || "";

  const brand = sidebar.querySelector(".brand");
  [...(brand?.children || [])].slice(1).forEach((child) => child.classList.add("sidebar-brand-text"));
  const railButton = document.createElement("button");
  railButton.type = "button";
  railButton.className = "sidebar-rail-toggle";
  (brand || sidebar).appendChild(railButton);

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
