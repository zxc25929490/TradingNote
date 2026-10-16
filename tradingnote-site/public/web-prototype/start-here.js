// "今天從這裡開始": turns the current data into a short, ordered to-do list with a link for each item,
// plus a fixed daily/weekly workflow so a new user knows which page answers which question.
(function (root) {
  const DAY = 86400000;
  const finiteR = (trade) => trade && trade.r !== null && trade.r !== "" && trade.r !== undefined && Number.isFinite(Number(trade.r));
  const dayOf = (trade) => {
    const time = Date.parse(`${trade?.date || ""}T00:00:00`);
    return Number.isNaN(time) ? null : time;
  };
  const isTrade = (trade) => trade && trade.recordType !== "missed_opportunity";

  // Pure: everything it needs is passed in, so it can be unit-tested.
  function buildTasks({ trades = [], now = Date.now(), lastBackupAt = null, edgeDecay = null, drawdown = null, mfeCoverage = null } = {}) {
    const list = trades.filter(isTrade);
    const tasks = [];
    const dated = list.map(dayOf).filter((value) => value !== null);
    const latest = dated.length ? Math.max(...dated) : null;
    const recent = (days) => list.filter((trade) => latest !== null && dayOf(trade) !== null && latest - dayOf(trade) < days * DAY);

    const unreviewedRecent = recent(7).filter((trade) => !trade.reviewClass);
    const unreviewedAll = list.filter((trade) => !trade.reviewClass);
    if (unreviewedRecent.length) {
      tasks.push({
        id: "review", level: "todo", title: `${unreviewedRecent.length} 筆最近的交易還沒復盤`,
        detail: `最後交易日往前 7 天內。全部未復盤共 ${unreviewedAll.length} 筆，先處理最近的，記憶還清楚。`,
        action: "去復盤", href: "../review-system/index.html#queue",
      });
    }

    const unassigned = recent(30).filter((trade) => !trade.strategyVersionId);
    if (unassigned.length) {
      tasks.push({
        id: "strategy", level: "todo", title: `${unassigned.length} 筆交易沒有綁定策略版本`,
        detail: "沒綁定就無法比較不同版本的績效，也會把不同策略混在一起算。",
        action: "到交易紀錄補上", page: "trades",
      });
    }

    if (edgeDecay && edgeDecay.declining) {
      tasks.push({
        id: "decay", level: "warn", title: "近期期望值明顯下滑",
        detail: `最近 ${edgeDecay.window} 筆平均 ${edgeDecay.recent.toFixed(2)}R，之前 ${edgeDecay.earlier.toFixed(2)}R（p = ${edgeDecay.p.toFixed(3)}）。先查是執行問題還是市場變了。`,
        action: "看序列與衰退", page: "advanced-stats", tab: "sequence",
      });
    }

    if (drawdown && drawdown.current <= -3) {
      tasks.push({
        id: "drawdown", level: "warn", title: `目前回撤 ${drawdown.current.toFixed(2)}R`,
        detail: `最大回撤紀錄是 ${drawdown.max.toFixed(2)}R。回撤中最容易加大風險或亂做，先確認單筆風險沒有被放大。`,
        action: "看回撤與存活機率", page: "advanced-stats", tab: "risk",
      });
    }

    const backupAge = lastBackupAt ? Math.floor((now - Date.parse(lastBackupAt)) / DAY) : null;
    if (backupAge === null || Number.isNaN(backupAge) || backupAge >= 7) {
      tasks.push({
        id: "backup", level: backupAge === null || Number.isNaN(backupAge) || backupAge >= 14 ? "warn" : "todo",
        title: backupAge === null || Number.isNaN(backupAge) ? "還沒有完整備份紀錄" : `已經 ${backupAge} 天沒備份`,
        detail: "資料只存在這個瀏覽器裡，清除瀏覽資料或換電腦就會不見。",
        action: "立即備份", command: "backup",
      });
    }

    if (mfeCoverage !== null && list.length && mfeCoverage === 0) {
      tasks.push({
        id: "ea", level: "info", title: "匯入 EA 紀錄可以解鎖出場品質分析",
        detail: "目前的交易沒有 MFE / MAE（最大有利／不利）資料，出場效率、止損是否太寬都無法分析。",
        action: "看可以分析什麼", page: "advanced-stats", tab: "exit",
      });
    }

    const order = { warn: 0, todo: 1, info: 2 };
    return tasks.sort((a, b) => order[a.level] - order[b.level]);
  }

  // The fixed routine: which page answers which question, in the order you would use them.
  const WORKFLOW = [
    { step: "盤前", question: "今天可以做嗎？能做多大？", links: [["交易檢查", { page: "checklist" }], ["風控計算", { page: "calculator" }], ["挑戰目標", { page: "objectives" }]] },
    { step: "盤後", question: "今天做得對不對？", links: [["記錄交易", { command: "add-trade" }], ["實盤復盤", { href: "../review-system/index.html#queue" }]] },
    { step: "每週", question: "這週表現和錯誤在哪？", links: [["週月績效", { page: "period" }], ["改善追蹤", { href: "../review-system/index.html#loop" }], ["深度分析", { page: "analytics" }]] },
    { step: "每月", question: "策略還有優勢嗎？", links: [["進階統計", { page: "advanced-stats" }], ["差異分析", { href: "../analysis-system/index.html" }], ["歷史回測", { href: "../research-system/index.html" }]] },
  ];

  const api = { buildTasks, WORKFLOW };
  root.TradingNoteStartHere = api;
  if (typeof document === "undefined") return;

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  const target = (spec) => (spec.href ? `href="${esc(spec.href)}"` : `href="${spec.page ? `#${esc(spec.page)}` : "#"}" data-start-page="${esc(spec.page || "")}" data-start-tab="${esc(spec.tab || "")}" data-start-command="${esc(spec.command || "")}"`);
  const LEVEL_LABEL = { warn: "注意", todo: "待辦", info: "提示" };

  function render(container, input) {
    const tasks = buildTasks(input);
    container.innerHTML = `
      <div class="start-here-head">
        <div><p class="eyebrow">START HERE</p><h2>今天從這裡開始</h2></div>
        <span class="start-here-count ${tasks.length ? "" : "done"}">${tasks.length ? `${tasks.length} 件事` : "都處理好了"}</span>
      </div>
      ${tasks.length ? `<ol class="start-tasks">${tasks.map((task) => `
        <li class="start-task ${task.level}">
          <span class="start-level">${LEVEL_LABEL[task.level]}</span>
          <div><strong>${esc(task.title)}</strong><p>${esc(task.detail)}</p></div>
          <a class="start-action" ${target(task)}>${esc(task.action)} →</a>
        </li>`).join("")}</ol>` : `<p class="start-clear">沒有待辦事項：最近的交易都復盤了、備份也是新的。照下面的流程繼續就好。</p>`}
      <div class="start-flow" aria-label="使用流程">${WORKFLOW.map((stage, index) => `
        <div class="start-stage"><span class="start-step">${index + 1} · ${stage.step}</span><b>${stage.question}</b>
          <div>${stage.links.map(([label, spec]) => `<a ${target(spec)}>${label}</a>`).join("")}</div></div>`).join("")}
      </div>`;
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("[data-start-page], [data-start-command]");
    if (!link || !link.closest(".start-here")) return;
    const command = link.dataset.startCommand;
    const page = link.dataset.startPage;
    if (!command && !page) return;
    event.preventDefault();
    if (command === "backup") window.exportFullBackup?.();
    else if (command === "add-trade") document.querySelector("#newTradeButton")?.click();
    else {
      if (link.dataset.startTab) window.TradingNoteAdvancedAnalytics?.openTab?.(link.dataset.startTab);
      window.location.hash = `#${page}`;
    }
  });

  api.render = render;
})(typeof window !== "undefined" ? window : globalThis);
