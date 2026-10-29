// 帳戶總覽: prop-firm style account dashboard. Rendering only; the numbers come from
// buildAccountOverview() in app.js, which uses the same rules as the 挑戰目標 page.
(function (root) {
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  const num = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
  const money = (value, digits = 2) => (num(value) === null ? "—" : `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`);
  const signedMoney = (value) => (num(value) === null ? "—" : `${value > 0 ? "+" : ""}${money(value)}`);
  const signedPct = (value, digits = 2) => (num(value) === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`);
  const rText = (value) => (num(value) === null ? "—" : `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}R`);
  const tone = (value) => (!num(value) ? "" : value > 0 ? "pos" : "neg");
  const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

  function duration(seconds) {
    if (num(seconds) === null) return "—";
    if (seconds < 3600) return `${Math.round(seconds / 60)} 分`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小時`;
    return `${(seconds / 86400).toFixed(1)} 天`;
  }

  // ---------------------------------------------------------------- derived numbers
  function tradeStats(model) {
    const trades = model.trades;
    const profits = trades.map((trade) => num(trade.profit)).filter((value) => value !== null);
    const wins = profits.filter((value) => value > 0);
    const losses = profits.filter((value) => value < 0);
    const sum = (values) => values.reduce((total, value) => total + value, 0);
    let peak = model.initial;
    let maxDrawdown = 0;
    for (const point of model.balancePoints) {
      peak = Math.max(peak, point.balance);
      maxDrawdown = Math.max(maxDrawdown, peak - point.balance);
    }
    const holds = trades.map((trade) => num(trade.holdingSeconds)).filter((value) => value !== null);
    const r = model.stats;
    const sharpe = root.TradingNoteStats?.riskAdjusted(trades)?.sharpeDaily ?? null;
    return {
      count: trades.length,
      lots: sum(trades.map((trade) => num(trade.lots) || 0)),
      avgWin: wins.length ? sum(wins) / wins.length : null,
      avgLoss: losses.length ? sum(losses) / losses.length : null,
      best: profits.length ? Math.max(...profits) : null,
      worst: profits.length ? Math.min(...profits) : null,
      profitFactorMoney: losses.length ? sum(wins) / Math.abs(sum(losses)) : wins.length ? Infinity : null,
      expectancyMoney: profits.length ? sum(profits) / profits.length : null,
      maxDrawdown,
      maxDrawdownPct: model.initial ? (maxDrawdown / model.initial) * 100 : null,
      rrr: r.averageLoss ? Math.abs(r.averageWin / r.averageLoss) : null,
      avgHold: holds.length ? sum(holds) / holds.length : null,
      sharpe,
    };
  }

  // ---------------------------------------------------------------- sections
  function header(model) {
    const status = model.passed ? ["pass", "已達成目標"] : model.warning ? ["progress", "進行中"] : ["breach", "已違反規則"];
    const first = model.trades[0]?.date;
    const last = model.trades.at(-1)?.date;
    const phase = { challenge: "挑戰階段", verification: "驗證階段", funded: "資金帳戶" }[model.rules.phase] || model.rules.phase || "";
    return `
      <header class="acct-head">
        <div>
          <p class="acct-eyebrow">帳戶總覽 · ${esc(model.batchLabel)}</p>
          <h2>${esc(model.rules.name || "交易帳戶")}</h2>
          <div class="acct-chips">
            <span class="acct-status ${status[0]}">${status[1]}</span>
            ${phase ? `<span class="acct-chip">${esc(phase)}</span>` : ""}
            <span class="acct-chip">初始資金 ${money(model.initial, 0)}</span>
            <span class="acct-chip">${first ? `${esc(first)} – ${esc(last)}` : "尚無交易"}</span>
          </div>
        </div>
        <a class="acct-link" href="#objectives">帳戶規則設定 →</a>
      </header>`;
  }

  function kpis(model, extra) {
    const latest = model.days.at(-1);
    const profitPct = model.initial ? (model.stats.totalProfit / model.initial) * 100 : null;
    const kpi = (label, value, note, cls = "") => `<div class="acct-kpi"><span>${label}</span><strong class="${cls}">${value}</strong><small>${note}</small></div>`;
    return `<section class="acct-kpis">
      ${kpi("帳戶餘額", money(model.currentBalance), `起始 ${money(model.initial, 0)}`)}
      ${kpi("累計損益", signedMoney(model.stats.totalProfit), signedPct(profitPct), tone(model.stats.totalProfit))}
      ${kpi("最近交易日損益", latest ? signedMoney(latest.profit) : "—", latest ? `${esc(latest.date)} · ${latest.count} 筆` : "尚無交易", latest ? tone(latest.profit) : "")}
      ${kpi("最大回撤", extra.maxDrawdown ? `-${money(extra.maxDrawdown)}` : money(0), `${extra.maxDrawdownPct === null ? "—" : `-${extra.maxDrawdownPct.toFixed(2)}%`} · 以結算餘額計`, extra.maxDrawdown ? "neg" : "")}
      ${kpi("勝率", model.stats.decided ? `${model.stats.winRate.toFixed(1)}%` : "—", `${model.stats.wins || 0} 勝 / ${model.stats.decided || 0} 筆有結果`)}
    </section>`;
  }

  function objectives(model) {
    const rules = model.rules;
    const latest = model.days.at(-1);
    const bar = (fraction, state) => `<span class="acct-bar ${state}"><i style="width:${Math.max(0, Math.min(1, fraction)) * 100}%"></i></span>`;
    const row = (ok, pending, title, detail, value, progress = "") => `
      <li class="acct-objective ${ok ? "ok" : pending ? "pending" : "fail"}">
        <span class="acct-mark" aria-label="${ok ? "通過" : pending ? "進行中" : "未通過"}">${ok ? "✓" : pending ? "…" : "✕"}</span>
        <div><b>${title}</b><small>${detail}</small>${progress}</div>
        <strong>${value}</strong>
      </li>`;
    const targetFraction = model.targetAmount ? model.stats.totalProfit / model.targetAmount : 1;
    const dailyFraction = latest ? latest.dailyLossUsed / Math.max(1, model.dailyLimit) : 0;
    const maxFraction = model.maxLossAmount ? model.maxLossUsed / model.maxLossAmount : 0;
    return `<article class="acct-card">
      <div class="acct-card-head"><h3>挑戰目標</h3><span class="acct-muted">${rules.lossMode === "trailing" ? "移動式最大虧損" : "固定式最大虧損"}</span></div>
      <ul class="acct-objectives">
        ${row(model.daysPassed, true, `最少交易天數 ${rules.minimumDays} 天`, `已交易 ${model.days.length} 天`, `${model.days.length} / ${rules.minimumDays}`, bar(rules.minimumDays ? model.days.length / rules.minimumDays : 1, "neutral"))}
        ${row(!model.dailyBreach, false, `每日最大虧損 -${money(model.dailyLimit, 0)}`, latest ? `最近交易日已用 ${money(latest.dailyLossUsed)}` : "尚無交易", model.dailyBreach ? "曾違規" : "未違規", bar(dailyFraction, dailyFraction >= 0.75 ? "warn" : "neutral"))}
        ${row(!model.maxLossBreach, false, `最大虧損 -${money(model.maxLossAmount, 0)}`, `限制線 ${money(model.maxLossFloor)} · 剩餘 ${money(model.maxLossRemaining)}`, model.maxLossBreach ? "已違規" : "未違規", bar(maxFraction, maxFraction >= 0.75 ? "warn" : "neutral"))}
        ${row(model.targetPassed, true, `獲利目標 ${money(model.targetAmount, 0)}`, `目前 ${signedMoney(model.stats.totalProfit)}`, `${Math.max(0, Math.min(999, targetFraction * 100)).toFixed(1)}%`, bar(targetFraction, "pos"))}
        ${row(model.bestDayPassed, true, "最佳單日 ≤ 總獲利 50%", model.bestDay ? `最佳單日 ${esc(model.bestDay.date)} ${signedMoney(model.bestDay.profit)}` : "尚無獲利日", `${model.bestDayPercent.toFixed(1)}%`)}
      </ul>
    </article>`;
  }

  function statistics(model, extra) {
    const s = model.stats;
    const row = (label, value, cls = "") => `<div><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;
    const pf = extra.profitFactorMoney === Infinity ? "∞" : extra.profitFactorMoney === null ? "—" : extra.profitFactorMoney.toFixed(2);
    return `<article class="acct-card">
      <div class="acct-card-head"><h3>交易統計</h3><span class="acct-muted">${extra.count} 筆交易</span></div>
      <dl class="acct-stats">
        ${row("交易筆數", String(extra.count))}
        ${row("總手數", extra.lots.toFixed(2))}
        ${row("勝率", s.decided ? `${s.winRate.toFixed(1)}%` : "—")}
        ${row("獲利因子", pf)}
        ${row("平均獲利", money(extra.avgWin), "pos")}
        ${row("平均虧損", money(extra.avgLoss), "neg")}
        ${row("每筆期望值", signedMoney(extra.expectancyMoney), tone(extra.expectancyMoney))}
        ${row("期望值（R）", rText(s.expectancy), tone(s.expectancy))}
        ${row("平均盈虧比", extra.rrr === null ? "—" : extra.rrr.toFixed(2))}
        ${row("Sharpe（日）", extra.sharpe === null ? "—" : extra.sharpe.toFixed(2))}
        ${row("最佳交易", signedMoney(extra.best), "pos")}
        ${row("最差交易", signedMoney(extra.worst), "neg")}
        ${row("最長連勝", `${s.bestWin || 0} 筆`)}
        ${row("最長連敗", `${s.worstLoss || 0} 筆`)}
        ${row("平均持倉", duration(extra.avgHold))}
        ${row("最佳商品", s.bestPair ? `${esc(s.bestPair.pair)} ${rText(s.bestPair.r)}` : "—")}
      </dl>
    </article>`;
  }

  function daily(model) {
    const days = [...model.days].reverse().slice(0, 12);
    const label = { safe: "正常", warning: "接近上限", breach: "違規" };
    return `<article class="acct-card">
      <div class="acct-card-head"><h3>每日摘要</h3><a class="acct-link" href="#period">週月績效 →</a></div>
      ${days.length ? `<div class="acct-table-wrap"><table class="acct-table">
        <thead><tr><th>日期</th><th class="num">筆數</th><th class="num">手數</th><th class="num">損益</th><th class="num">R</th><th class="num">結算餘額</th><th>狀態</th></tr></thead>
        <tbody>${days.map((day) => `<tr>
          <td>${esc(day.date)}</td><td class="num">${day.count}</td><td class="num">${day.lots.toFixed(2)}</td>
          <td class="num ${tone(day.profit)}">${signedMoney(day.profit)}</td><td class="num ${tone(day.totalR)}">${rText(day.totalR)}</td>
          <td class="num">${money(day.closingBalance)}</td>
          <td><span class="acct-dot ${day.status}"></span>${label[day.status] || ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="acct-empty">尚無交易日。</p>`}
    </article>`;
  }

  function journal(model) {
    const trades = [...model.trades].reverse().slice(0, 12);
    const direction = (trade) => {
      const value = String(trade.direction || "").toLowerCase();
      // Older records have no direction field; the stop's side of the entry tells us which way it was.
      const entry = num(trade.entry);
      const stop = num(trade.stopLoss);
      const inferred = !value && entry && stop && entry !== stop ? (stop < entry ? "long" : "short") : value;
      if (/long|buy|多/.test(inferred)) return '<span class="acct-side buy">買入</span>';
      if (/short|sell|空/.test(inferred)) return '<span class="acct-side sell">賣出</span>';
      return '<span class="acct-side">—</span>';
    };
    const price = (value) => (num(value) === null || Number(value) === 0 ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 5 }));
    return `<article class="acct-card">
      <div class="acct-card-head"><h3>交易日誌</h3><a class="acct-link" href="#trades">查看全部 ${model.trades.length} 筆 →</a></div>
      ${trades.length ? `<div class="acct-table-wrap"><table class="acct-table journal">
        <thead><tr><th>時間</th><th>商品</th><th>方向</th><th class="num">手數</th><th class="num">進場</th><th class="num">止損</th><th class="num">出場</th><th class="num">損益</th><th class="num">R</th></tr></thead>
        <tbody>${trades.map((trade) => `<tr data-trade-id="${esc(trade.id)}" tabindex="0">
          <td>${esc(trade.date || "")}<small>${esc(String(trade.time || "").slice(0, 5))}</small></td>
          <td><b>${esc(trade.pair || "—")}</b></td><td>${direction(trade)}</td>
          <td class="num">${num(trade.lots) === null ? "—" : Number(trade.lots).toFixed(2)}</td>
          <td class="num">${price(trade.entry)}</td><td class="num">${price(trade.stopLoss)}</td><td class="num">${price(trade.exitPrice)}</td>
          <td class="num ${tone(trade.profit)}">${signedMoney(num(trade.profit))}</td><td class="num ${tone(trade.r)}">${rText(trade.r)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="acct-empty">尚無交易紀錄。</p>`}
    </article>`;
  }

  // ---------------------------------------------------------------- calendar
  const calendarState = { offset: 0 };
  function calendar(model) {
    const byDate = new Map(model.days.map((day) => [day.date, day]));
    const lastDate = model.days.at(-1)?.date;
    const anchor = lastDate ? new Date(`${lastDate}T00:00:00`) : new Date();
    const month = new Date(anchor.getFullYear(), anchor.getMonth() + calendarState.offset, 1);
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const lead = (month.getDay() + 6) % 7; // Monday first
    const key = (day) => `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const monthDays = model.days.filter((day) => day.date.startsWith(key(1).slice(0, 7)));
    const monthTotal = monthDays.reduce((sum, day) => sum + day.profit, 0);
    const maxAbs = Math.max(1, ...monthDays.map((day) => Math.abs(day.profit)));
    const cell = (day) => {
      if (!day) return '<td class="empty"></td>';
      const info = byDate.get(key(day));
      const strength = info ? Math.min(1, Math.abs(info.profit) / maxAbs) : 0;
      return `<td class="${info ? (info.profit >= 0 ? "pos" : "neg") : ""}" style="--s:${(0.12 + strength * 0.4).toFixed(2)}">
        <span>${day}</span>${info ? `<b>${signedMoney(info.profit)}</b><small>${info.count} 筆</small>` : ""}</td>`;
    };
    return `<article class="acct-card">
      <div class="acct-card-head"><h3>損益日曆</h3>
        <div class="acct-cal-nav"><button type="button" data-cal="-1" aria-label="上個月">‹</button><b>${year} 年 ${monthIndex + 1} 月</b><button type="button" data-cal="1" aria-label="下個月">›</button>
        <span class="acct-muted">當月 <b class="${tone(monthTotal)}">${signedMoney(monthTotal)}</b></span></div></div>
      <div class="acct-table-wrap"><table class="acct-calendar">
        <thead><tr>${WEEK.map((name) => `<th>${name}</th>`).join("")}<th>週合計</th></tr></thead>
        <tbody>${weeks.map((week) => {
          const total = week.reduce((sum, day) => sum + (day ? byDate.get(key(day))?.profit || 0 : 0), 0);
          const traded = week.some((day) => day && byDate.has(key(day)));
          return `<tr>${week.map(cell).join("")}<td class="week ${traded ? tone(total) : ""}">${traded ? signedMoney(total) : ""}</td></tr>`;
        }).join("")}</tbody></table></div>
    </article>`;
  }

  // ---------------------------------------------------------------- balance chart
  const chartState = { mode: "balance" };
  function drawChart(canvas, model) {
    const styles = getComputedStyle(canvas.closest(".acct"));
    const color = (name) => styles.getPropertyValue(name).trim();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(260, canvas.clientWidth);
    const height = canvas.clientHeight || 300;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const isBalance = chartState.mode === "balance";
    let running = 0;
    const values = isBalance
      ? model.balancePoints.map((point) => point.balance)
      : [0, ...model.trades.map((trade) => (running += Number(trade.r) || 0))];
    if (values.length < 2) {
      ctx.fillStyle = color("--acct-muted");
      ctx.font = "13px Inter, system-ui, sans-serif";
      ctx.fillText("尚無足夠交易可繪製曲線", 16, height / 2);
      return null;
    }
    const refs = isBalance
      ? [
        { value: model.initial, label: "初始資金", color: color("--acct-muted") },
        { value: model.initial + model.targetAmount, label: "獲利目標", color: color("--acct-pos") },
        { value: model.maxLossFloor, label: "最大虧損線", color: color("--acct-neg") },
      ].filter((ref) => Number.isFinite(ref.value))
      : [{ value: 0, label: "0R", color: color("--acct-muted") }];
    const all = [...values, ...refs.map((ref) => ref.value)];
    let low = Math.min(...all);
    let high = Math.max(...all);
    const padding = (high - low || 1) * 0.08;
    low -= padding;
    high += padding;
    const narrow = width < 480;
    const left = 64;
    const right = narrow ? 76 : 92;
    const top = 14;
    const bottom = 26;
    const x = (index) => left + (index / (values.length - 1)) * (width - left - right);
    const y = (value) => top + (1 - (value - low) / (high - low)) * (height - top - bottom);
    const label = (value) => (isBalance ? `$${Math.round(value).toLocaleString("en-US")}` : `${value.toFixed(1)}R`);

    // grid + y axis
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i += 1) {
      const value = low + ((high - low) * i) / 4;
      ctx.strokeStyle = color("--acct-grid");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, Math.round(y(value)) + 0.5);
      ctx.lineTo(width - right, Math.round(y(value)) + 0.5);
      ctx.stroke();
      ctx.fillStyle = color("--acct-muted");
      ctx.textAlign = "right";
      ctx.fillText(label(value), left - 8, y(value));
    }
    // x axis dates (first, middle, last)
    const dates = isBalance ? model.balancePoints.map((point) => point.date) : ["", ...model.trades.map((trade) => trade.date)];
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    (narrow ? [1, values.length - 1] : [1, Math.floor(values.length / 2), values.length - 1]).forEach((index) => {
      if (dates[index]) ctx.fillText(dates[index], Math.min(width - right - 30, Math.max(left + 30, x(index))), height - 6);
    });
    // reference lines
    for (const ref of refs) {
      ctx.strokeStyle = ref.color;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(left, y(ref.value));
      ctx.lineTo(width - right, y(ref.value));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ref.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(ref.label, width - right + 8, y(ref.value) - 7);
      ctx.fillText(label(ref.value), width - right + 8, y(ref.value) + 7);
    }
    // area + line
    const line = color("--acct-line");
    const gradient = ctx.createLinearGradient(0, top, 0, height - bottom);
    gradient.addColorStop(0, color("--acct-area"));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    values.forEach((value, index) => (index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value))));
    ctx.lineTo(x(values.length - 1), height - bottom);
    ctx.lineTo(x(0), height - bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    values.forEach((value, index) => (index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value))));
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    return { values, dates, x, y, label, left, right, width };
  }

  function attachChartHover(canvas, tooltip, getGeometry) {
    canvas.onpointermove = (event) => {
      const geometry = getGeometry();
      if (!geometry) return;
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const span = geometry.width - geometry.left - geometry.right;
      const index = Math.round(((px - geometry.left) / span) * (geometry.values.length - 1));
      if (index < 0 || index >= geometry.values.length) { tooltip.hidden = true; return; }
      const change = index ? geometry.values[index] - geometry.values[index - 1] : 0;
      tooltip.hidden = false;
      tooltip.innerHTML = `<b>${geometry.label(geometry.values[index])}</b><span>${esc(geometry.dates[index] || "起始")}</span>${index ? `<span class="${tone(change)}">${chartState.mode === "balance" ? signedMoney(change) : rText(change)}</span>` : ""}`;
      tooltip.style.left = `${Math.min(rect.width - 120, Math.max(0, geometry.x(index) - 60))}px`;
      tooltip.style.top = `${Math.max(0, geometry.y(geometry.values[index]) - 64)}px`;
    };
    canvas.onpointerleave = () => { tooltip.hidden = true; };
  }

  // ---------------------------------------------------------------- render
  let lastModel = null;
  let geometry = null;
  function render(container, model) {
    lastModel = model;
    const extra = tradeStats(model);
    container.innerHTML = `<div class="acct">
      ${header(model)}
      ${kpis(model, extra)}
      <div class="acct-grid main">
        <article class="acct-card chart">
          <div class="acct-card-head"><h3>${chartState.mode === "balance" ? "帳戶餘額" : "累積 R"}</h3>
            <div class="acct-seg" role="group" aria-label="曲線單位">
              <button type="button" data-mode="balance" class="${chartState.mode === "balance" ? "on" : ""}">金額</button>
              <button type="button" data-mode="r" class="${chartState.mode === "r" ? "on" : ""}">R</button>
            </div></div>
          <div class="acct-chart"><canvas aria-label="帳戶餘額曲線"></canvas><div class="acct-tooltip" hidden></div></div>
        </article>
        ${objectives(model)}
      </div>
      <div class="acct-grid">
        ${statistics(model, extra)}
        ${daily(model)}
      </div>
      ${calendar(model)}
      ${journal(model)}
    </div>`;
    const canvas = container.querySelector(".acct-chart canvas");
    geometry = drawChart(canvas, model);
    attachChartHover(canvas, container.querySelector(".acct-tooltip"), () => geometry);
  }

  function rerender(container) {
    if (lastModel) render(container, lastModel);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", (event) => {
      const container = event.target.closest?.("#accountOverview");
      if (!container) return;
      const mode = event.target.closest("[data-mode]");
      if (mode) { chartState.mode = mode.dataset.mode; rerender(container); return; }
      const cal = event.target.closest("[data-cal]");
      if (cal) { calendarState.offset += Number(cal.dataset.cal); rerender(container); return; }
      const row = event.target.closest("[data-trade-id]");
      if (row) root.TradingNoteOpenTrade?.(row.dataset.tradeId);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const row = event.target.closest?.("#accountOverview [data-trade-id]");
      if (row) root.TradingNoteOpenTrade?.(row.dataset.tradeId);
    });
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const container = document.querySelector("#accountOverview");
        const canvas = container?.querySelector(".acct-chart canvas");
        if (canvas && lastModel && canvas.clientWidth) geometry = drawChart(canvas, lastModel);
      }, 120);
    });
  }

  root.TradingNoteAccountOverview = { render, tradeStats };
})(typeof window !== "undefined" ? window : globalThis);
