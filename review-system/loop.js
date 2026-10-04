// "改善追蹤" view: renders the closed-loop analytics from shared/review-loop.js.
(() => {
  const L = window.TradingNoteReviewLoop;
  const root = document.querySelector("#loopContent");
  if (!L || !root) return;

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  const r = (value, digits = 2) => `${value.toFixed(digits)}R`;
  const pct = (value) => (value === null || value === undefined ? "—" : `${(value * 100).toFixed(0)}%`);
  const MONTH_LABEL = (month) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
  const VERDICTS = {
    improved: ["改善中", "good"],
    flat: ["沒有變化", "warn"],
    worse: ["惡化", "bad"],
    insufficient: ["資料不足", "mute"],
    "no-reason": ["未歸因", "mute"],
  };

  const card = (label, value, note, tone = "") => `<div class="loop-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
  const panel = (title, hint, content) => `<article class="panel loop-panel"><div class="panel-head"><h3>${title}</h3><p>${hint}</p></div>${content}</article>`;
  const empty = (message) => `<div class="empty-inline">${message}</div>`;

  function arrow(change) {
    if (!change) return `<span class="loop-flat">持平</span>`;
    // For a cost, lower is better: a drop is good news.
    return change < 0 ? `<span class="loop-good">▼ ${r(Math.abs(change))}</span>` : `<span class="loop-bad">▲ ${r(change)}</span>`;
  }

  function renderRanking(ranking) {
    const used = ranking.filter((row) => row.total > 0);
    if (!used.length) return empty("還沒有歸因資料。在復盤時填入「漏單、提早出場…」損失的 R，這裡就會排出最貴的錯誤。");
    const max = Math.max(...used.map((row) => row.total));
    return `<div class="loop-table-wrap"><table class="loop-table"><thead><tr><th>#</th><th>錯誤類型</th><th>累計損失</th><th>占比</th><th>次數</th><th>平均每次</th><th>近 30 天</th><th>前 30 天</th><th>變化</th></tr></thead><tbody>${used.map((row, index) => `
      <tr><td>${index + 1}</td><td><b>${esc(row.label)}</b></td>
      <td><span class="loop-bar"><i style="width:${(row.total / max) * 100}%"></i></span><b class="loop-bad">-${r(row.total)}</b></td>
      <td>${pct(row.share)}</td><td>${row.count}</td><td>${r(row.average)}</td><td>${r(row.recent)}</td><td>${r(row.previous)}</td><td>${arrow(row.change)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderMonths(months) {
    if (!months.length) return empty("需要帶有日期的交易才能整理月度趨勢。");
    const maxGap = Math.max(0.01, ...months.map((row) => row.gapPerTrade));
    return `<div class="loop-table-wrap"><table class="loop-table"><thead><tr><th>月份</th><th>筆數</th><th>已復盤</th><th>執行正確率</th><th>違規率</th><th>每筆執行損失</th><th>執行損失合計</th></tr></thead><tbody>${[...months].reverse().map((row) => `
      <tr><td><b>${MONTH_LABEL(row.month)}</b></td><td>${row.trades}</td><td>${row.reviewed}</td>
      <td class="${row.correctRate !== null && row.correctRate >= 0.7 ? "loop-good" : ""}">${pct(row.correctRate)}</td>
      <td class="${row.violationRate !== null && row.violationRate >= 0.2 ? "loop-bad" : ""}">${pct(row.violationRate)}</td>
      <td><span class="loop-bar"><i class="amber" style="width:${(row.gapPerTrade / maxGap) * 100}%"></i></span>${row.gapPerTrade ? `-${r(row.gapPerTrade)}` : "—"}</td>
      <td>${row.gapTotal ? `-${r(row.gapTotal)}` : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderActions(tracked) {
    if (!tracked.length) return empty("還沒有填寫「下次行動」的復盤。寫下改善行動後，系統會比較行動前後同類錯誤有沒有減少。");
    return `<div class="loop-table-wrap"><table class="loop-table actions"><thead><tr><th>日期</th><th>問題</th><th>改善行動</th><th>行動前平均損失</th><th>行動後平均損失</th><th>變化</th><th>判定</th></tr></thead><tbody>${tracked.slice(0, 40).map((item) => {
      const [label, tone] = VERDICTS[item.verdict];
      const measured = item.before !== undefined;
      return `<tr><td>${esc(item.date || "—")}<small>${esc(item.pair)}</small></td><td>${item.reason ? `<b>${esc(item.reason)}</b>` : "—"}</td>
        <td class="loop-action">${esc(item.action)}</td>
        <td>${measured ? `${r(item.before)}<small>前 ${item.beforeN} 筆</small>` : "—"}</td>
        <td>${measured ? `${r(item.after)}<small>後 ${item.afterN} 筆</small>` : "—"}</td>
        <td>${measured ? arrow(item.delta) : "—"}</td>
        <td><span class="loop-chip ${tone}">${label}</span></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  window.TradingNoteReviewLoopView = {
    render(trades, { fields, classOf }) {
      const list = Array.isArray(trades) ? trades : [];
      if (!list.length) { root.innerHTML = empty("目前的紀錄還沒有交易。"); return; }
      const ranking = L.costRanking(list, fields);
      const months = L.monthlyTrend(list, fields, classOf);
      const halves = L.halves(list, fields, classOf);
      const tracked = L.improvementTracking(list, fields);
      const summary = L.summarizeActions(tracked);
      const top = ranking.find((row) => row.total > 0);
      const totalGap = ranking.reduce((sum, row) => sum + row.total, 0);

      const trendCard = !halves || (!halves.earlier.gapPerTrade && !halves.later.gapPerTrade)
        ? card("執行趨勢", "—", halves ? "尚無歸因資料" : "至少需要 10 筆交易")
        : card("執行趨勢", { improving: "進步中", worsening: "退步中", flat: "持平" }[halves.direction],
          `每筆損失 ${r(halves.earlier.gapPerTrade)} → ${r(halves.later.gapPerTrade)}（前半 → 後半）`,
          { improving: "good", worsening: "bad", flat: "" }[halves.direction]);
      const actionCard = summary.judged
        ? card("改善行動成效", pct(summary.successRate), `${summary.judged} 個行動中 ${summary.improved} 個確實減少該類錯誤`, summary.successRate >= 0.5 ? "good" : "warn")
        : card("改善行動成效", "—", summary.total ? "行動後的交易還不夠多，無法判定" : "還沒有填寫改善行動");

      root.innerHTML = `
        <div class="loop-cards">
          ${card("已歸因執行損失", totalGap ? `-${r(totalGap)}` : "—", `${list.length} 筆交易`, totalGap ? "bad" : "")}
          ${card("最貴的錯誤", top ? esc(top.label) : "—", top ? `累計 -${r(top.total)}（${pct(top.share)}）` : "尚無歸因資料")}
          ${trendCard}
          ${actionCard}
        </div>
        ${panel("錯誤的 R 成本排名", "哪一種錯誤害你少賺最多 R；近 30 天與前 30 天比較（以最後一筆交易日為準），降低才是好消息。", renderRanking(ranking))}
        ${panel("逐月執行品質", "違規率＝已復盤中「不符合策略卻進場」的比例。Rule Book 條款在研究系統記錄，實盤這裡以此作為紀律指標。", renderMonths(months))}
        ${panel("改善行動追蹤", "比較每個行動前、後各 10 筆交易中，該筆主要錯誤平均損失的 R。降低 30% 以上算改善，增加 30% 以上算惡化。", renderActions(tracked))}`;
    },
  };
})();
