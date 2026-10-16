// Collapsible sidebar: nav groups fold under their section title, and the whole sidebar can shrink to
// an icon rail. Both choices are remembered per browser.
(() => {
  const sidebar = document.querySelector(".sidebar");
  const nav = sidebar?.querySelector("nav");
  if (!sidebar || !nav) return;

  const STORAGE_KEY = "tradingnote.sidebar";
  const read = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (_) { return {}; }
  };
  const state = { rail: false, collapsed: [], ...read() };
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage unavailable */ }
  };

  // Turn each section title into a toggle that owns the links after it. The link elements themselves are
  // moved, not recreated, so app.js keeps its references to them.
  for (const title of [...nav.querySelectorAll(".nav-section-title")]) {
    const name = title.textContent.trim();
    const group = document.createElement("div");
    group.className = "nav-group";
    group.id = `nav-group-${[...nav.querySelectorAll(".nav-section-title")].indexOf(title)}`;
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
  }

  // Icon-rail labels: every link gets a tooltip with its text.
  for (const link of nav.querySelectorAll("a")) {
    const label = link.textContent.replace(link.querySelector("span")?.textContent || "", "").trim();
    link.title = label;
    link.setAttribute("aria-label", label);
  }
  for (const link of sidebar.querySelectorAll(".system-switcher a")) link.title = link.querySelector("b")?.textContent || "";

  const railButton = document.createElement("button");
  railButton.type = "button";
  railButton.className = "sidebar-rail-toggle";
  sidebar.querySelector(".brand")?.appendChild(railButton);

  function apply() {
    document.body.classList.toggle("sidebar-rail", Boolean(state.rail));
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

  apply();
})();
