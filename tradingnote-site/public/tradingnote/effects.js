// Visual polish layer (see effects.css). Safe to remove together with the CSS file.
(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const STAGGER_SELECTOR = ".bar-fill, tbody tr, .heat-cell";
  const CARD_SELECTOR = ".metric, .panel, .period-compare-grid > *, .home-comparison-cards a, .strategy-version-card";
  const INDEX_CAP = 24;

  // Rows, bars and calendar cells: index among siblings so CSS can cascade them.
  const assignIndex = (element) => {
    if (element.style.getPropertyValue("--fx-i")) return;
    const siblings = element.parentElement ? Array.from(element.parentElement.children) : [element];
    element.style.setProperty("--fx-i", String(Math.min(siblings.indexOf(element), INDEX_CAP)));
  };
  const indexTree = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches(STAGGER_SELECTOR)) assignIndex(node);
    node.querySelectorAll?.(STAGGER_SELECTOR).forEach(assignIndex);
  };
  indexTree(document.body);
  new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(indexTree);
  }).observe(document.body, { childList: true, subtree: true });

  // Cards: stagger by order inside the page whenever it opens.
  const indexPage = (page) => {
    page.querySelectorAll(CARD_SELECTOR).forEach((element, index) => {
      element.style.setProperty("--fx-i", String(Math.min(index, 10)));
    });
  };
  document.querySelectorAll(".page").forEach((page) => {
    indexPage(page);
    new MutationObserver(() => { if (page.classList.contains("active")) indexPage(page); })
      .observe(page, { attributes: true, attributeFilter: ["class"] });
  });

  // Cursor spotlight on cards, plus a small tilt on KPI cards.
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const card = event.target.closest?.(".metric, .panel");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    card.style.setProperty("--mx", `${x}px`);
    card.style.setProperty("--my", `${y}px`);
    if (card.classList.contains("metric")) {
      card.style.setProperty("--ry", `${((x / rect.width) - 0.5) * 7}deg`);
      card.style.setProperty("--rx", `${(0.5 - (y / rect.height)) * 7}deg`);
    }
  }, { passive: true });
  document.addEventListener("pointerout", (event) => {
    const card = event.target.closest?.(".metric");
    if (card && !card.contains(event.relatedTarget)) {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    }
  });
})();
