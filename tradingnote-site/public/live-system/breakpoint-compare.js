// Breakpoint comparison: puts live and backtest breakpoints side by side in R, and says whether a
// difference is large enough to trust. Computation (compareBreakpoints) is pure and tested; the page
// reads app.js globals (trades, liveBatches, readResearchBreakpoints, sortByDate, escapeHtml).
(function initBreakpointCompare(root) {
  const STATE_KEY = "tradingnote.breakpointCompare";
  const MIN_N = 10;
  const finite = (value) => value !== "" && value != null && Number.isFinite(Number(value));
  const sum = (values) => values.reduce((total, value) => total + value, 0);

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function sampleSd(values) {
    if (values.length < 2) return 0;
    const mean = sum(values) / values.length;
    return Math.sqrt(sum(values.map((value) => (value - mean) ** 2)) / (values.length - 1));
  }

  // Trades per side needed to tell a difference of `diff` apart (two-sided 5%, 80% power).
  function neededPerSide(diff, sdA, sdB) {
    if (!diff) return null;
    const pooled = Math.sqrt((sdA ** 2 + sdB ** 2) / 2);
    return pooled ? Math.ceil(2 * ((1.96 + 0.84) * pooled / Math.abs(diff)) ** 2) : null;
  }

  function summarize(group, S) {
    const rTrades = group.trades.filter((trade) => !trade.riskUnavailable && finite(trade.r));
    const values = rTrades.map((trade) => Number(trade.r));
    const core = S.basics(values);
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let streak = 0;
    let worstStreak = 0;
    const curve = [0];
    for (const value of values) {
      equity += value;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, equity - peak);
      streak = value < 0 ? streak + 1 : 0;
      worstStreak = Math.max(worstStreak, streak);
      curve.push(equity);
    }
    const money = group.trades.filter((trade) => finite(trade.profit));
    // Typical money per 1R; tiny R values (break-even exits) would blow the ratio up.
    const perR = rTrades.filter((trade) => finite(trade.profit) && Math.abs(Number(trade.r)) >= 0.25)
      .map((trade) => Math.abs(Number(trade.profit) / Number(trade.r)));
    const dates = group.trades.map((trade) => String(trade.date || "")).filter(Boolean).sort();
    return {
      id: group.id,
      label: group.label,
      kind: group.kind,
      count: group.trades.length,
      values,
      ...core,
      sd: sampleSd(values),
      ci95: S.meanInterval(values),
      maxDrawdown,
      worstStreak,
      curve,
      start: dates[0] || "",
      end: dates.at(-1) || "",
      hasMoney: money.length > 0,
      totalProfit: sum(money.map((trade) => Number(trade.profit))),
      profitPerTrade: money.length ? sum(money.map((trade) => Number(trade.profit))) / money.length : null,
      moneyPerR: median(perR),
    };
  }

  function compareBreakpoints(groups, { baselineId, stats } = {}) {
    const S = stats || root.TradingNoteStats;
    const rows = groups.map((group) => summarize(group, S));
    const baseline = rows.find((row) => row.id === baselineId) || rows[0] || null;
    for (const row of rows) {
      if (!baseline || row === baseline) { row.vsBaseline = null; continue; }
      const test = row.n >= 2 && baseline.n >= 2 ? S.welch(row.values, baseline.values) : { diff: row.mean - baseline.mean, p: 1 };
      const enough = row.n >= MIN_N && baseline.n >= MIN_N;
      row.vsBaseline = {
        diff: row.mean - baseline.mean,
        p: test.p,
        enough,
        significant: enough && test.p < 0.05,
        neededPerSide: neededPerSide(row.mean - baseline.mean, row.sd, baseline.sd),
      };
    }
    const sized = rows.filter((row) => row.moneyPerR);
    const moneyPerR = sized.map((row) => row.moneyPerR);
    const sizeSpread = moneyPerR.length >= 2 ? Math.max(...moneyPerR) / Math.min(...moneyPerR) : 1;
    return { rows, baseline, sizeWarning: sizeSpread >= 2, sizeRange: moneyPerR.length ? [Math.min(...moneyPerR), Math.max(...moneyPerR)] : null };
  }

  root.TradingNoteBreakpointCompare = { compareBreakpoints, neededPerSide, MIN_N };

  // ---------------------------------------------------------------- page
  if (typeof document === "undefined") return;
  const $ = (selector) => document.querySelector(selector);
  const SERIES = ["--tn-accent", "--tn-warn", "--tn-violet", "--tn-info", "--tn-muted"];
  const fmtR = (value, digits = 2) => (finite(value) ? `${value > 0 ? "+" : ""}${Number(value).toFixed(digits)}R` : "—");
  const fmtMoney = (value) => (finite(value) ? `${value < 0 ? "-" : value > 0 ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}` : "—");
  const fmtPct = (value) => (finite(value) ? `${Number(value).toFixed(1)}%` : "—");
  const fmtNum = (value, digits = 2) => (finite(value) ? (value === Infinity ? "∞" : Number(value).toFixed(digits)) : "—");
  const tone = (value) => (finite(value) && value !== 0 ? (value > 0 ? "pos" : "neg") : "");
  const marketOf = (trade) => String(trade.pair || trade.market || trade.symbol || "").trim().toUpperCase();
  const esc = (value) => (typeof escapeHtml === "function" ? escapeHtml(value) : String(value));
  const chronological = (list) => (typeof sortByDate === "function" ? sortByDate(list) : list);

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}") || {}; } catch (_) { return {}; }
  }
  function saveState(state) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) { /* storage unavailable */ }
  }

  function availableGroups() {
    const live = (typeof liveBatches !== "undefined" ? liveBatches : []).map((batch) => ({
      id: `live:${batch.id}`,
      label: batch.name,
      kind: "live",
      trades: chronological(trades.filter((trade) => (trade.batchId || "live-default") === batch.id && trade.recordType !== "missed_opportunity")),
    }));
    const research = typeof readResearchBreakpoints === "function" ? readResearchBreakpoints().batches : [];
    const backtest = research.map((batch) => ({
      id: `bt:${batch.id}`,
      label: batch.name || batch.id,
      kind: "backtest",
      trades: [...batch.trades].sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))),
    }));
    return [...live, ...backtest];
  }

  function chooseDefaults(groups) {
    const live = groups.filter((group) => group.kind === "live" && group.trades.length);
    const backtest = groups.filter((group) => group.kind === "backtest" && group.trades.length);
    const active = typeof readResearchBreakpoints === "function" ? `bt:${readResearchBreakpoints().activeBatch}` : "";
    const picked = [...live.slice(0, 3), ...(backtest.find((group) => group.id === active) ? [backtest.find((group) => group.id === active)] : backtest.slice(0, 1))];
    return picked.map((group) => group.id);
  }

  function renderControls(groups, state) {
    const chip = (group) => `<label class="bc-chip"><input type="checkbox" value="${esc(group.id)}" ${state.selected.includes(group.id) ? "checked" : ""} /><span><b>${esc(group.label)}</b><small>${group.trades.length} 筆</small></span></label>`;
    const live = groups.filter((group) => group.kind === "live");
    const backtest = groups.filter((group) => group.kind === "backtest");
    $("#bcPicker").innerHTML = `
      <div class="bc-picker-group"><span>實盤斷點</span><div>${live.map(chip).join("") || '<small class="bc-none">尚無實盤斷點</small>'}</div></div>
      <div class="bc-picker-group"><span>回測斷點</span><div>${backtest.map(chip).join("") || '<small class="bc-none">尚無回測斷點</small>'}</div></div>`;
    const chosen = groups.filter((group) => state.selected.includes(group.id));
    $("#bcBaseline").innerHTML = chosen.map((group) => `<option value="${esc(group.id)}" ${group.id === state.baseline ? "selected" : ""}>${esc(group.label)}</option>`).join("");
    const markets = [...new Set(chosen.flatMap((group) => group.trades.map(marketOf)).filter(Boolean))].sort();
    $("#bcMarket").innerHTML = `<option value="all">全部商品</option>${markets.map((market) => `<option value="${esc(market)}" ${market === state.market ? "selected" : ""}>${esc(market)}</option>`).join("")}`;
  }

  function verdictFor(row, baseline) {
    const v = row.vsBaseline;
    const name = `「${esc(row.label)}」`;
    const base = `「${esc(baseline.label)}」`;
    if (!v.enough) {
      return { level: "warn", text: `${name} 對比 ${base}：至少一邊不到 ${MIN_N} 筆有 R 的交易（${row.n} / ${baseline.n}），先不要下結論。` };
    }
    const direction = v.diff >= 0 ? "高" : "低";
    if (v.significant) {
      return { level: v.diff >= 0 ? "pos" : "neg", text: `${name} 平均每筆比 ${base} ${direction} ${Math.abs(v.diff).toFixed(2)}R，p = ${v.p.toFixed(3)}，差異達統計顯著，不太像只是運氣。` };
    }
    const need = v.neededPerSide ? `以目前的波動，每邊大約要 ${v.neededPerSide} 筆才分得出來。` : "";
    return { level: "muted", text: `${name} 平均每筆比 ${base} ${direction} ${Math.abs(v.diff).toFixed(2)}R，但 p = ${v.p.toFixed(2)}，可能只是運氣。${need}` };
  }

  function renderVerdicts(result) {
    const items = result.rows.filter((row) => row.vsBaseline).map((row) => verdictFor(row, result.baseline));
    if (result.sizeWarning) {
      items.push({ level: "warn", text: `各斷點每 1R 的金額差很多（約 $${result.sizeRange[0].toFixed(0)} ～ $${result.sizeRange[1].toFixed(0)}），金額的好壞會被部位大小扭曲；判斷策略請看 R。` });
    }
    $("#bcVerdicts").innerHTML = items.map((item) => `<li class="bc-verdict ${item.level}">${item.text}</li>`).join("");
    $("#bcVerdicts").hidden = !items.length;
  }

  function renderTable(result) {
    const cols = result.rows;
    const head = `<tr><th>指標</th>${cols.map((row, index) => `<th><span class="bc-swatch" style="background:var(${SERIES[index % SERIES.length]})"></span>${esc(row.label)}<small>${row.kind === "live" ? "實盤" : "回測"}${row === result.baseline ? " · 基準" : ""}</small></th>`).join("")}</tr>`;
    const line = (label, cell, hint = "") => `<tr><th scope="row">${label}${hint ? `<small>${hint}</small>` : ""}</th>${cols.map((row) => `<td>${cell(row)}</td>`).join("")}</tr>`;
    const delta = (row) => {
      if (!row.vsBaseline) return '<span class="bc-dim">基準</span>';
      const v = row.vsBaseline;
      return `<span class="${tone(v.diff)}">${fmtR(v.diff)}</span><small>p = ${v.enough ? v.p.toFixed(3) : "樣本不足"}</small>`;
    };
    const body = [
      line("期間", (row) => (row.start ? `${row.start}<small>至 ${row.end}</small>` : "—")),
      line("交易筆數", (row) => `${row.count}<small>${row.n} 筆有 R</small>`),
      line("平均 R（期望值）", (row) => `<b class="${tone(row.mean)}">${row.n ? fmtR(row.mean) : "—"}</b><small>${row.ci95 ? `95%：${fmtR(row.ci95[0])} ～ ${fmtR(row.ci95[1])}` : "樣本太少"}</small>`, "每筆平均賺幾 R"),
      line("與基準差距", delta, "平均 R 的差"),
      line("勝率", (row) => fmtPct(row.n ? row.winRate : null), "R > 0 的比例"),
      line("總 R", (row) => `<span class="${tone(row.total)}">${fmtR(row.total)}</span>`),
      line("獲利因子", (row) => fmtNum(row.profitFactor), "總賺 R ÷ 總賠 R"),
      line("平均賺 / 平均賠", (row) => (row.n ? `${fmtR(row.avgWin)} / ${fmtR(-row.avgLoss)}` : "—")),
      line("最大回撤", (row) => `<span class="neg">${row.n ? fmtR(row.maxDrawdown) : "—"}</span>`, "累積 R 從高點最深跌幅"),
      line("最長連虧", (row) => (row.n ? `${row.worstStreak} 筆` : "—")),
      line("總損益", (row) => (row.hasMoney ? `<span class="${tone(row.totalProfit)}">${fmtMoney(row.totalProfit)}</span>` : '<span class="bc-dim">回測無金額</span>')),
      line("每 1R 約等於", (row) => (row.moneyPerR ? `$${row.moneyPerR.toFixed(0)}` : "—"), "反映每筆風險大小"),
    ].join("");
    $("#bcTable").innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  }

  function renderCurves(result) {
    const target = $("#bcChart");
    const rows = result.rows.filter((row) => row.n);
    if (!rows.length) { target.innerHTML = '<p class="bc-dim">沒有可畫的 R 資料。</p>'; return; }
    const width = Math.max(320, Math.round(target.clientWidth || 760));
    const height = width < 600 ? 220 : 300;
    const pad = { left: 52, right: 16, top: 16, bottom: 28 };
    const maxN = Math.max(...rows.map((row) => row.curve.length - 1), 1);
    const all = rows.flatMap((row) => row.curve);
    const low = Math.min(0, ...all);
    const high = Math.max(0, ...all);
    const span = high - low || 1;
    const x = (index) => pad.left + (index / maxN) * (width - pad.left - pad.right);
    const y = (value) => pad.top + (1 - (value - low) / span) * (height - pad.top - pad.bottom);
    const ticks = [low, low + span / 2, high];
    const grid = ticks.map((tick) => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}" class="bc-grid"/><text x="${pad.left - 8}" y="${y(tick) + 4}" class="bc-axis" text-anchor="end">${fmtR(tick, 1)}</text>`).join("");
    const zero = `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(0)}" y2="${y(0)}" class="bc-zero"/>`;
    const lines = result.rows.map((row, index) => {
      if (!row.n) return "";
      const points = row.curve.map((value, step) => `${x(step).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="var(${SERIES[index % SERIES.length]})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><title>${esc(row.label)}：${fmtR(row.total)}</title></polyline>`;
    }).join("");
    const xAxis = `<text x="${pad.left}" y="${height - 6}" class="bc-axis">第 1 筆</text><text x="${width - pad.right}" y="${height - 6}" class="bc-axis" text-anchor="end">第 ${maxN} 筆</text>`;
    target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="各斷點累積 R">${grid}${zero}${lines}${xAxis}</svg>`;
  }

  function renderBreakpointCompare() {
    if (!$("#bcPicker") || typeof trades === "undefined") return;
    const groups = availableGroups();
    const stored = readState();
    const ids = new Set(groups.map((group) => group.id));
    const state = {
      selected: (Array.isArray(stored.selected) ? stored.selected : chooseDefaults(groups)).filter((id) => ids.has(id)),
      baseline: stored.baseline,
      market: stored.market || "all",
    };
    if (!state.selected.includes(state.baseline)) state.baseline = state.selected[0];
    renderControls(groups, state);
    if (![...$("#bcMarket").options].some((option) => option.value === state.market)) state.market = "all";

    const chosen = groups.filter((group) => state.selected.includes(group.id)).map((group) => ({
      ...group,
      trades: state.market === "all" ? group.trades : group.trades.filter((trade) => marketOf(trade) === state.market),
    }));
    const empty = chosen.length < 2;
    $("#bcEmpty").hidden = !empty;
    $("#bcResult").hidden = empty;
    $("#bcEmpty").innerHTML = groups.length < 2
      ? "<strong>目前只有一個斷點</strong><span>到上方「目前實盤斷點」選單建立新斷點（可依日期複製既有交易），或在歷史回測建立回測斷點，就能在這裡比較。</span>"
      : "<strong>請至少勾選兩個斷點</strong><span>第一個勾選的斷點預設當作比較基準，可在右側改。</span>";
    if (empty) return;
    const result = compareBreakpoints(chosen, { baselineId: state.baseline });
    renderVerdicts(result);
    renderTable(result);
    renderCurves(result);
    $("#bcLegend").innerHTML = result.rows.map((row, index) => `<span><i style="background:var(${SERIES[index % SERIES.length]})"></i>${esc(row.label)}</span>`).join("");
  }

  function bind() {
    const picker = $("#bcPicker");
    if (!picker || picker.dataset.bound) return;
    picker.dataset.bound = "true";
    picker.addEventListener("change", () => {
      const state = readState();
      saveState({ ...state, selected: [...picker.querySelectorAll("input:checked")].map((input) => input.value) });
      renderBreakpointCompare();
    });
    $("#bcBaseline").addEventListener("change", (event) => { saveState({ ...readState(), baseline: event.target.value }); renderBreakpointCompare(); });
    $("#bcMarket").addEventListener("change", (event) => { saveState({ ...readState(), market: event.target.value }); renderBreakpointCompare(); });
  }

  root.renderBreakpointCompare = () => { bind(); renderBreakpointCompare(); };
})(typeof window !== "undefined" ? window : globalThis);
