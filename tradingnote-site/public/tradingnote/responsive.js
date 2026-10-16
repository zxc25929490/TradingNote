// Phone-only helpers for the live dashboard (layout rules live in responsive.css).
(() => {
  // The five filter selects take ~300px on a phone; fold them behind one button. The summary line
  // ("顯示 N / M 筆交易 · K 個條件") and the mixed-strategy warning stay visible.
  const filters = document.querySelector(".filters");
  if (filters && !filters.querySelector(".filters-toggle")) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "filters-toggle";
    toggle.setAttribute("aria-expanded", "false");
    filters.prepend(toggle);
    const summary = document.querySelector("#filterSummary");
    const label = () => {
      const match = /(\d+) 個條件/.exec(summary?.textContent || "");
      const open = filters.classList.contains("open");
      toggle.innerHTML = `<span>篩選條件${match ? `<b>${match[1]}</b>` : ""}</span><i aria-hidden="true">${open ? "▴" : "▾"}</i>`;
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", () => {
      filters.classList.toggle("open");
      label();
    });
    if (summary) new MutationObserver(label).observe(summary, { childList: true, characterData: true, subtree: true });
    label();
  }
})();
