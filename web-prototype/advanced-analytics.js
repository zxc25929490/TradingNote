// Advanced statistics panel for the live dashboard. Pure rendering: all maths lives in shared/stats.js.
(() => {
  const S = window.TradingNoteStats;
  const root = document.querySelector("#advancedAnalytics");
  if (!S || !root) return;

  const body = root.querySelector("#advancedBody");
  const tabs = [...root.querySelectorAll("[data-adv-tab]")];
  const STORAGE_KEY = "tradingnote.advanced-analytics";
  const defaults = {
    tab: "risk", window: 30, riskPct: 0.5, trades: 100, rowDim: "hour", colDim: "weekday", metric: "mean",
  };
  const state = { ...defaults, ...readStored() };
  let lastItems = [];
  let context = {};

  function readStored() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (_) { return {}; }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage unavailable */ }
  }

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  const isNum = (value) => value !== null && value !== undefined && Number.isFinite(value);
  const fixed = (value, digits = 2) => (isNum(value) ? (value === Infinity ? "∞" : value.toFixed(digits)) : "—");
  const signedR = (value, digits = 2) => (isNum(value) ? `${value > 0 ? "+" : ""}${value.toFixed(digits)}R` : "—");
  const pct = (value, digits = 1) => (isNum(value) ? `${value.toFixed(digits)}%` : "—");
  const share = (value) => (isNum(value) ? `${(value * 100).toFixed(1)}%` : "—");
  const tone = (value) => (!isNum(value) || value === 0 ? "" : value > 0 ? "profit-pos" : "profit-neg");
  function duration(seconds) {
    if (!isNum(seconds)) return "—";
    if (seconds < 90) return `${Math.round(seconds)} 秒`;
    if (seconds < 5400) return `${(seconds / 60).toFixed(1)} 分`;
    if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} 小時`;
    return `${(seconds / 86400).toFixed(1)} 天`;
  }

  const card = (label, value, note = "", className = "") =>
    `<div class="adv-card"><span>${label}</span><strong class="${className}">${value}</strong>${note ? `<small>${note}</small>` : ""}</div>`;
  const cards = (list) => `<div class="adv-cards">${list.join("")}</div>`;
  const block = (title, hint, content) =>
    `<section class="adv-block"><header><h3>${title}</h3>${hint ? `<p>${hint}</p>` : ""}</header>${content}</section>`;
  const empty = (message) => `<div class="empty-state adv-empty">${message}</div>`;
  const coverage = (info, need) => {
    if (!info.total) return empty("目前篩選沒有交易。");
    if (!info.covered) return empty(`這些交易都沒有${need}。匯入 MT4 EA 的交易紀錄後會自動出現（目前 0 / ${info.total} 筆有資料）。`);
    const low = info.coverage < 0.5;
    return `<p class="adv-coverage ${low ? "low" : ""}">使用 ${info.covered} / ${info.total} 筆有${need}的交易（${share(info.coverage)}）${low ? "。涵蓋率偏低，結論僅供參考。" : "。"}</p>`;
  };

  function table(headers, rows) {
    if (!rows.length) return empty("沒有足夠資料。");
    return `<div class="adv-table-wrap"><table class="adv-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  const bar = (fraction, className = "") => `<span class="adv-bar"><i class="${className}" style="width:${Math.max(0, Math.min(1, fraction)) * 100}%"></i></span>`;

  // Non-scaling strokes keep line width uniform even though the SVG stretches to its container.
  function lineSvg(values, { color = "var(--accent)", fill = false, height = 150 } = {}) {
    if (values.length < 2) return empty("資料不足，至少需要 2 筆。");
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);
    const range = high - low || 1;
    const x = (index) => (index / (values.length - 1)) * 600;
    const y = (value) => 8 + (1 - (value - low) / range) * (height - 16);
    const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
    const area = fill ? `<polygon points="${x(0)},${y(0)} ${points} ${x(values.length - 1)},${y(0)}" fill="${color}" opacity=".18"/>` : "";
    return `<div class="adv-chart"><svg viewBox="0 0 600 ${height}" preserveAspectRatio="none" role="img">
      <line x1="0" x2="600" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="adv-zero" vector-effect="non-scaling-stroke"/>
      ${area}<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <span class="adv-axis hi">${high.toFixed(2)}</span><span class="adv-axis lo">${low.toFixed(2)}</span></div>`;
  }

  const byTime = (items) => [...items].sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
  const withR = (items) => items.filter((trade) => S.num(trade.r) !== null);

  // ---------------------------------------------------------------- tabs
  function renderRisk(items) {
    const stats = S.riskAdjusted(items);
    if (stats.n < 3) return empty("至少需要 3 筆有 R 值的交易才能計算風險調整指標。");
    const sqnLabel = !isNum(stats.sqn) ? "" : stats.sqn >= 3 ? "優秀" : stats.sqn >= 2 ? "良好" : stats.sqn >= 1 ? "普通" : "偏弱";
    const edge = stats.edge;
    const significant = edge.p < 0.05;
    const rules = context.accountRules || {};
    const maxLoss = Number(rules.maxLossPercent) || 10;
    const target = Number(rules.profitTargetPercent) || 10;
    const sim = S.breachProbability(items.map((trade) => S.num(trade.r)).filter((value) => value !== null), {
      riskPct: Number(state.riskPct) || 0.5, maxLossPct: maxLoss, targetPct: target, trades: Number(state.trades) || 100,
    });
    return `
      ${block("風險調整後報酬", "把報酬放在波動與回撤的脈絡下看。", cards([
        card("SQN", fixed(stats.sqn), sqnLabel ? `系統品質：${sqnLabel}（≥2 良好、≥3 優秀）` : "", ""),
        card("Sharpe（日）", fixed(stats.sharpeDaily), stats.tradingDays >= 5 ? `${stats.tradingDays} 個交易日，年化` : "交易日不足 5 天"),
        card("Sortino（日）", fixed(stats.sortinoDaily), "只計下行波動"),
        card("報酬 / 回撤", fixed(stats.recoveryFactor), `最大回撤 ${signedR(stats.maxDrawdown)}`),
        card("Payoff Ratio", fixed(stats.payoff), `平均賺 ${fixed(stats.avgWin)}R／平均賠 ${fixed(stats.avgLoss)}R`),
        card("Profit Factor", fixed(stats.profitFactor), `勝率 ${pct(stats.winRate)}`),
        card("經驗 Kelly", isNum(stats.empiricalKelly) ? pct(stats.empiricalKelly * 100) : "—", "每筆風險上限（理論最大成長）"),
        card("半 Kelly（建議上限）", isNum(stats.halfKelly) ? pct(stats.halfKelly * 100) : "—", `公式 Kelly ${isNum(stats.kelly) ? pct(stats.kelly * 100) : "—"}`),
      ]))}
      ${block("優勢是否站得住腳", "用統計檢定回答「這是實力還是運氣」。", `
        <div class="adv-verdict ${significant ? "good" : "warn"}">
          <strong>${significant ? "統計上顯著為正" : edge.mean > 0 ? "目前仍無法排除運氣" : "沒有看到正期望值"}</strong>
          <p>平均 ${signedR(edge.mean)}／筆，95% 信賴區間 ${edge.ci95 ? `${signedR(edge.ci95[0])} ~ ${signedR(edge.ci95[1])}` : "—"}，
          p = ${fixed(edge.p, 3)}，期望值為正的機率約 ${share(edge.probPositive)}（${edge.n} 筆，bootstrap 2000 次）。</p>
        </div>`)}
      ${block("挑戰帳戶存活模擬", `以你目前的 R 分布重抽樣 ${state.trades} 筆；最大虧損 ${maxLoss}%、目標 ${target}% 取自帳戶規則。假設每筆彼此獨立，實際連虧較常見時結果會偏樂觀。`, `
        <div class="adv-inputs">
          <label>每筆風險 %<input type="number" min="0.05" max="5" step="0.05" data-adv-input="riskPct" value="${esc(state.riskPct)}"></label>
          <label>模擬筆數<input type="number" min="10" max="500" step="10" data-adv-input="trades" value="${esc(state.trades)}"></label>
        </div>
        ${sim ? cards([
          card("觸及最大虧損", share(sim.staticBreach), "自初始資金起算", sim.staticBreach > 0.1 ? "profit-neg" : "profit-pos"),
          card("從高點回撤觸及", share(sim.trailingBreach), "移動式回撤規則", sim.trailingBreach > 0.15 ? "profit-neg" : ""),
          card("達標機率", share(sim.passRate), isNum(sim.medianTradesToTarget) ? `中位數 ${sim.medianTradesToTarget} 筆達標` : "多數情況未達標"),
          card("最差回撤（P95）", `-${fixed(sim.drawdownP95)}%`, "95% 的情境不會比這更深"),
          card("期末權益", `${fixed(sim.finalP50)}%`, `P5 ${fixed(sim.finalP5)}% ／ P95 ${fixed(sim.finalP95)}%`, tone(sim.finalP50)),
        ]) : empty("至少需要 5 筆有 R 值的交易才能模擬。")}`)}`;
  }

  function renderSequence(items) {
    const values = withR(byTime(items)).map((trade) => S.num(trade.r));
    if (values.length < 5) return empty("至少需要 5 筆有 R 值的交易。");
    const profile = S.drawdownProfile(values);
    const rolling = S.rollingMetrics(values, Number(state.window));
    const decay = S.edgeDecay(values, Number(state.window));
    const runs = S.runsTest(values);
    const after = S.afterLosses(values);
    const longest = profile.longest;
    const runsText = !runs ? "勝負筆數不足，無法檢定。" : runs.pattern === "clustered"
      ? `勝負有聚集傾向（z = ${fixed(runs.z)}，p = ${fixed(runs.p, 3)}）：連勝或連敗比隨機更常見，可能與市場狀態或情緒有關。`
      : runs.pattern === "alternating"
        ? `勝負交替比隨機更頻繁（z = ${fixed(runs.z)}，p = ${fixed(runs.p, 3)}）。`
        : `勝負順序與隨機無異（z = ${fixed(runs.z)}，p = ${fixed(runs.p, 3)}），沒有明顯的序列依賴。`;
    return `
      ${block("回撤與水下時間", "從高點跌下來之後，要多久才能創新高。", `
        ${cards([
          card("最大回撤", signedR(profile.maxDrawdown), "", "profit-neg"),
          card("目前回撤", signedR(profile.currentDrawdown), profile.currentDrawdown === 0 ? "位於高點" : "尚未回到高點", profile.currentDrawdown === 0 ? "profit-pos" : "profit-neg"),
          card("最長水下", longest ? `${longest.length} 筆` : "0 筆", longest ? (longest.recovered ? "已回到高點" : "仍在水下") : ""),
          card("水下次數", String(profile.episodes.length), "跌離高點的區間數"),
        ])}
        ${lineSvg(profile.drawdown, { color: "var(--loss)", fill: true })}`)}
      ${block("滾動期望值（優勢是否衰退）", "", `
        <div class="adv-inputs"><label>視窗（筆）<select data-adv-input="window">${[10, 20, 30, 50].map((n) => `<option value="${n}" ${Number(state.window) === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
        ${decay ? `<div class="adv-verdict ${decay.declining ? "bad" : "good"}"><strong>${decay.declining ? "近期期望值明顯下滑" : "近期表現與過去沒有顯著差異"}</strong>
          <p>最近 ${decay.window} 筆平均 ${signedR(decay.recent)}，之前 ${signedR(decay.earlier)}（差 ${signedR(decay.diff)}，p = ${fixed(decay.p, 3)}）。</p></div>` : ""}
        ${lineSvg(rolling.rows.map((row) => row.mean), { color: "var(--accent)" })}`)}
      ${block("虧損之後的下一筆", runsText, table(["情境", "下一筆筆數", "平均 R", "勝率"], after.map((row) => [row.label, String(row.n), `<b class="${tone(row.mean)}">${row.n ? signedR(row.mean) : "—"}</b>`, row.n ? pct(row.winRate, 0) : "—"])))}`;
  }

  function renderExit(items) {
    const info = S.exitQuality(items);
    if (!info.covered) return coverage(info, " MFE 紀錄");
    const scatter = (() => {
      const points = info.points;
      if (points.length < 3) return empty("需要至少 3 筆同時有 MAE 與 MFE 的交易。");
      const maxX = Math.max(1, ...points.map((p) => -p.mae));
      const maxY = Math.max(1, ...points.map((p) => p.mfe));
      const sx = (v) => 36 + (-v / maxX) * 540;
      const sy = (v) => 264 - (v / maxY) * 240;
      return `<div class="adv-chart scatter"><svg viewBox="0 0 600 290" role="img" aria-label="MAE 與 MFE 散佈圖">
        <line x1="36" x2="576" y1="264" y2="264" class="adv-zero"/><line x1="36" x2="36" y1="24" y2="264" class="adv-zero"/>
        <line x1="${sx(-1).toFixed(1)}" x2="${sx(-1).toFixed(1)}" y1="24" y2="264" class="adv-guide"/>
        <line x1="36" x2="576" y1="${sy(1).toFixed(1)}" y2="${sy(1).toFixed(1)}" class="adv-guide"/>
        ${points.map((p) => `<circle cx="${sx(p.mae).toFixed(1)}" cy="${sy(p.mfe).toFixed(1)}" r="4.5" class="${p.r > 0 ? "win" : p.r < 0 ? "loss" : "be"}"><title>R ${p.r.toFixed(2)}｜MAE ${p.mae.toFixed(2)}｜MFE ${p.mfe.toFixed(2)}</title></circle>`).join("")}
        <text x="580" y="282" text-anchor="end" class="adv-label">最大不利 MAE（-R）→</text><text x="40" y="16" class="adv-label">↑ 最大有利 MFE（R）</text></svg></div>`;
    })();
    return `${coverage(info, " MFE 紀錄")}
      ${block("出場品質", "看你有沒有把行情拿完整、又有沒有把賺到的吐回去。", cards([
        card("贏單平均 MFE", signedR(info.avgMfeWin), "賺的單最多曾走到多遠"),
        card("贏單平均 MAE", signedR(info.avgMaeWin), "賺的單中途最深的浮虧"),
        card("出場效率", isNum(info.efficiency) ? pct(info.efficiency, 0) : "—", "實現 R ÷ 最大有利 R（贏單）"),
        card("每筆少拿", isNum(info.leftOnTable) ? `${fixed(info.leftOnTable)}R` : "—", "贏單的 MFE − 實現 R", "profit-neg"),
        card("虧損單曾賺過 +0.5R", `${info.lostAfterHalfR.count} 筆`, `佔虧損單 ${share(info.lostAfterHalfR.share)}`, info.lostAfterHalfR.share > 0.3 ? "profit-neg" : ""),
        card("虧損單曾賺過 +1R", `${info.lostAfterOneR.count} 筆`, `佔虧損單 ${share(info.lostAfterOneR.share)}（保本／移動止損可救）`, info.lostAfterOneR.count ? "profit-neg" : ""),
      ]))}
      ${block("MAE × MFE 散佈", "綠＝贏、紅＝虧。右下的綠點表示贏單中途吃了很深的浮虧，止損可能過寬；左上的紅點表示曾經大賺卻虧出場。", scatter)}
      ${block("贏單的 MAE 分布", `止損是否過寬：贏單中途最深跌到哪裡（${info.maeCoverage} 筆有 MAE）。`, table(["最大不利區間", "贏單數", "占比", ""], info.maeBuckets.map((row) => [row.label, String(row.count), share(row.share), bar(row.share)])))}
      ${block("如果止損收緊", "以 MAE 回推：觸及更緊止損價位的單子，會被提早掃出（未考慮盤中順序與滑價）。", table(["止損", "被掃出的贏單", "被掃出的虧損單", "總 R 變化"], info.stopSimulation.map((row) => [`-${row.stop.toFixed(1)}R`, String(row.stoppedWinners), String(row.stoppedLosers), `<b class="${tone(row.delta)}">${signedR(row.delta)}</b>`])))}`;
  }

  function renderHold(items) {
    const info = S.holdingAnalysis(items);
    if (!info.covered) return coverage(info, "持倉時間");
    const maxTotal = Math.max(0.01, ...info.buckets.map((row) => Math.abs(row.total)));
    const corr = info.correlation;
    const corrText = !isNum(corr) ? "—" : Math.abs(corr) < 0.1 ? "幾乎無關" : corr > 0 ? "持有越久越賺" : "持有越久越虧";
    return `${coverage(info, "持倉時間")}
      ${block("持倉時間", "虧單通常比賺單拿得更久嗎？這是「凹單」的典型徵兆。", cards([
        card("贏單中位持倉", duration(info.medianWin)),
        card("虧單中位持倉", duration(info.medianLoss)),
        card("虧／贏持倉比", isNum(info.lossToWinRatio) ? `${info.lossToWinRatio.toFixed(2)}×` : "—", isNum(info.lossToWinRatio) && info.lossToWinRatio > 1.5 ? "虧單拿得明顯比較久" : "", isNum(info.lossToWinRatio) && info.lossToWinRatio > 1.5 ? "profit-neg" : ""),
        card("持倉與 R 相關", fixed(corr), corrText),
      ]))}
      ${block("依持倉長度分組", "", table(["持倉", "筆數", "平均 R", "勝率", "總 R"], info.buckets.map((row) => [row.label, String(row.n), row.n ? `<b class="${tone(row.mean)}">${signedR(row.mean)}</b>` : "—", row.n ? pct(row.winRate, 0) : "—", row.n ? `${bar(Math.abs(row.total) / maxTotal, row.total < 0 ? "neg" : "")}<span class="${tone(row.total)}">${signedR(row.total)}</span>` : "—"])))}`;
  }

  function renderCost(items) {
    const info = S.costAnalysis(items, { pair: (trade) => trade.pair, session: (trade) => trade.session, hour: hourBucket });
    if (!info.covered) return coverage(info, "手續費／隔夜費");
    const groupTable = (rows) => table(["分類", "筆數", "平均成本 R", "總成本 R"], rows.slice(0, 6).map((row) => [esc(row.label), String(row.n), `<b class="profit-neg">${fixed(row.avgCostR, 3)}R</b>`, `${fixed(row.totalCostR, 2)}R`]));
    return `${coverage(info, "成本")}
      ${block("交易成本", "你的優勢要先賺過成本才算數。", cards([
        card("總成本", `$${fixed(info.costMoney)}`, `手續費 $${fixed(info.commission)}／隔夜費 $${fixed(info.swap)}`, "profit-neg"),
        card("佔毛利比例", isNum(info.costPctOfGross) ? pct(info.costPctOfGross) : "—", "成本 ÷ 毛損益（毛損益為正時）"),
        card("每筆平均成本", isNum(info.avgCostR) ? `${fixed(info.avgCostR, 3)}R` : "—", "至少要有這麼多 edge 才打平"),
        card("毛期望值", signedR(info.grossExpectancy), "扣成本前"),
        card("淨期望值", signedR(info.netExpectancy), "扣成本後", tone(info.netExpectancy)),
        card("進場點差", isNum(info.avgEntrySpread) ? `${fixed(info.avgEntrySpread, 1)} pt` : "—", isNum(info.maxSpread) ? `最大 ${fixed(info.maxSpread, 0)} pt` : ""),
        card("點差成本估計", isNum(info.spreadCost) && info.spreadCost ? `$${fixed(info.spreadCost)}` : "—", "EA 估算，已含在成交價內"),
      ]))}
      ${block("成本最重的商品", "", groupTable(info.groups.pair))}
      ${info.groups.session.length ? block("成本最重的時段（Session）", "", groupTable(info.groups.session)) : ""}
      ${info.groups.hour.length ? block("成本最重的進場時段", "", groupTable(info.groups.hour)) : ""}`;
  }

  function renderExposure(items) {
    const info = S.exposureAnalysis(items);
    if (!info.total) return empty("目前篩選沒有可分析的交易。");
    const row = (label, group) => [label, String(group.n), group.n ? `<b class="${tone(group.mean)}">${signedR(group.mean)}</b>` : "—", group.n ? pct(group.winRate, 0) : "—"];
    const dayRow = (label, group) => [label, String(group.days), String(group.trades), isNum(group.avgPerTrade) ? `<b class="${tone(group.avgPerTrade)}">${signedR(group.avgPerTrade)}</b>` : "—", isNum(group.avgDayR) ? `<b class="${tone(group.avgDayR)}">${signedR(group.avgDayR)}</b>` : "—"];
    const exposed = info.openTrades.alone.n + info.openTrades.one.n + info.openTrades.multiple.n;
    const stacked = info.sameSymbol.first.n + info.sameSymbol.stacked.n;
    const revenge = info.revenge;
    const revengeVerdict = revenge.test && revenge.test.p < 0.1 && revenge.test.diff < 0
      ? `<div class="adv-verdict bad"><strong>虧損後快速再進場的表現較差</strong><p>${revenge.minutes} 分鐘內接續在虧單之後的單子平均 ${signedR(revenge.quick.mean)}，其他單 ${signedR(revenge.other.mean)}（p = ${fixed(revenge.test.p, 3)}）。</p></div>` : "";
    return `
      ${block("下單紀律", "", `
        ${info.risk ? cards([
          card("平均單筆風險", `${fixed(info.risk.mean, 2)}%`, `${info.risk.covered} 筆有資料`),
          card("風險一致性（變異係數）", fixed(info.risk.cv, 2), info.risk.cv > 0.35 ? "每筆風險差異很大" : "風險相當穩定", info.risk.cv > 0.35 ? "profit-neg" : "profit-pos"),
          card("風險範圍", `${fixed(info.risk.min, 2)}% ~ ${fixed(info.risk.max, 2)}%`),
        ]) : empty("沒有每筆風險 % 的資料（需由 EA 匯入）。")}`)}
      ${block("虧損後快速再進場", `虧單結束後 ${revenge.minutes} 分鐘內又開新單，是報復性交易的常見型態。`, `${revengeVerdict}${table(["情境", "筆數", "平均 R", "勝率"], [row(`${revenge.minutes} 分鐘內接續虧單`, revenge.quick), row("其他", revenge.other)])}`)}
      ${block("每日交易筆數", "做越多是不是越差？", table(["當日筆數", "天數", "總筆數", "平均每筆 R", "平均單日 R"], [dayRow("1 筆", info.perDay.one), dayRow("2 筆", info.perDay.two), dayRow("3 筆", info.perDay.three), dayRow("4 筆以上", info.perDay.fourPlus)]))}
      ${exposed ? block("同時持倉", "進場時手上已有幾筆單。", table(["進場時持倉", "筆數", "平均 R", "勝率"], [row("沒有其他單", info.openTrades.alone), row("1 筆", info.openTrades.one), row("2 筆以上", info.openTrades.multiple)])) : ""}
      ${stacked ? block("同商品加碼", "", table(["情境", "筆數", "平均 R", "勝率"], [row("首筆", info.sameSymbol.first), row("同商品已有單", info.sameSymbol.stacked)])) : ""}`;
  }

  // ---------------------------------------------------------------- cross tab
  const WEEK = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  function hourBucket(trade) {
    const hour = Number(String(trade.time || "").slice(0, 2));
    if (!Number.isFinite(hour) || trade.time === undefined || trade.time === "") return null;
    return hour < 8 ? "00–08" : hour < 16 ? "08–16" : hour < 20 ? "16–20" : "20–24";
  }
  const DIMENSIONS = {
    hour: ["進場時段", hourBucket],
    weekday: ["星期", (trade) => { const d = trade.date ? new Date(`${trade.date}T00:00:00`) : null; return d && !Number.isNaN(d.getTime()) ? WEEK[d.getDay()] : null; }],
    pair: ["商品", (trade) => trade.pair || null],
    direction: ["方向", (trade) => { const v = String(trade.direction || "").toLowerCase(); return /long|buy|多/.test(v) ? "Long" : /short|sell|空/.test(v) ? "Short" : null; }],
    session: ["Session", (trade) => trade.session || null],
    regime: ["市場狀態", (trade) => trade.regime || null],
    volatility: ["波動度", (trade) => trade.volatility || null],
    htf: ["高週期方向", (trade) => trade.htfAlignment || null],
    setup: ["Setup", (trade) => trade.setup || null],
    version: ["策略版本", (trade) => (trade.strategyVersionId && context.strategyLabel ? context.strategyLabel(trade.strategyVersionId) : null)],
  };
  const METRICS = { mean: "平均 R", winRate: "勝率", total: "總 R", n: "筆數" };

  function renderCross(items) {
    const [rowName, rowFn] = DIMENSIONS[state.rowDim] || DIMENSIONS.session;
    const [colName, colFn] = DIMENSIONS[state.colDim] || DIMENSIONS.weekday;
    const options = (selected) => Object.entries(DIMENSIONS).map(([key, [label]]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${label}</option>`).join("");
    const controls = `<div class="adv-inputs">
      <label>列<select data-adv-input="rowDim">${options(state.rowDim)}</select></label>
      <label>欄<select data-adv-input="colDim">${options(state.colDim)}</select></label>
      <label>指標<select data-adv-input="metric">${Object.entries(METRICS).map(([key, label]) => `<option value="${key}" ${key === state.metric ? "selected" : ""}>${label}</option>`).join("")}</select></label></div>`;
    if (state.rowDim === state.colDim) return `${block("交叉分析", "", controls)}${empty("列與欄請選不同的維度。")}`;
    const tab = S.crossTab(items, rowFn, colFn, { minN: 5 });
    if (!tab.rows.length || !tab.cols.length) return `${block("交叉分析", "", controls)}${empty(`目前資料沒有「${rowName}」或「${colName}」欄位，請改選其他維度。`)}`;
    const sortLabels = (labels, dim) => (dim === "weekday" ? [...labels].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b)) : [...labels].sort());
    const rows = sortLabels(tab.rows, state.rowDim);
    const cols = sortLabels(tab.cols, state.colDim);
    const valueOf = (cell) => (state.metric === "n" ? cell.n : state.metric === "winRate" ? cell.winRate : state.metric === "total" ? cell.total : cell.mean);
    const all = rows.flatMap((r) => cols.map((c) => tab.cell(r, c))).filter(Boolean).map(valueOf).filter(isNum);
    const extent = Math.max(0.0001, ...all.map((v) => Math.abs(state.metric === "winRate" ? v - 50 : v)));
    const format = (v) => (state.metric === "n" ? String(v) : state.metric === "winRate" ? pct(v, 0) : signedR(v));
    const body = rows.map((r) => `<tr><th>${esc(r)}</th>${cols.map((c) => {
      const cell = tab.cell(r, c);
      if (!cell) return `<td class="adv-cell none">·</td>`;
      const value = valueOf(cell);
      const strength = state.metric === "n" ? 0 : Math.min(1, Math.abs(state.metric === "winRate" ? value - 50 : value) / extent);
      const positive = state.metric === "winRate" ? value >= 50 : value >= 0;
      const style = state.metric === "n" ? "" : `style="--strength:${(strength * 0.55).toFixed(2)}"`;
      const mark = cell.significant ? "<em title=\"校正多重比較後仍顯著\">★</em>" : cell.looksSignificant ? "<em class=\"weak\" title=\"未校正顯著，可能是雜訊\">☆</em>" : "";
      return `<td class="adv-cell ${state.metric === "n" ? "" : positive ? "pos" : "neg"} ${cell.enough ? "" : "thin"}" ${style} title="${cell.n} 筆｜平均 ${signedR(cell.mean)}｜勝率 ${pct(cell.winRate, 0)}${cell.p !== null ? `｜p=${fixed(cell.p, 3)}` : "｜樣本不足不檢定"}"><b>${format(value)}</b><small>${cell.n} 筆</small>${mark}</td>`;
    }).join("")}</tr>`).join("");
    return `${block(`${rowName} × ${colName}`, "每格比較「該格 vs 其他所有交易」。格子切得越細，越容易看到假的優勢，所以只有通過多重比較校正的才標 ★。", `
      ${controls}
      <div class="adv-table-wrap"><table class="adv-table cross"><thead><tr><th></th>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="adv-note">★ 校正後顯著（α = ${tab.adjustedAlpha.toFixed(4)}，共檢定 ${tab.testedCells} 格）　☆ 未校正顯著，很可能只是運氣　灰色＝少於 5 筆，不檢定</p>`)}`;
  }

  function renderVersions(items) {
    const info = S.versionComparison(items, (trade) => (trade.strategyVersionId && context.strategyLabel ? context.strategyLabel(trade.strategyVersionId) : null));
    const partial = S.partialExitAnalysis(items);
    const versionBlock = !info.rows.length
      ? block("策略版本比較", "", empty("交易還沒有綁定策略版本。在交易紀錄中選擇策略版本後，這裡會比較各版本的期望值是否真的不同。"))
      : block("策略版本比較", "每個版本的表現，以及版本之間的差距是否顯著。少於 5 筆的版本只列出、不檢定。", `
        ${table(["版本", "筆數", "平均 R", "勝率", "Profit Factor", "總 R", "對其他版本"], info.rows.map((row) => [
          esc(row.label), String(row.n), `<b class="${tone(row.mean)}">${signedR(row.mean)}</b>`, pct(row.winRate, 0), fixed(row.profitFactor), `<span class="${tone(row.total)}">${signedR(row.total)}</span>`,
          row.vsRest ? `${signedR(row.vsRest.diff)}（p = ${fixed(row.vsRest.p, 3)}）` : '<span class="adv-muted">樣本不足</span>',
        ]))}
        ${info.pairs.length ? `<div class="adv-table-wrap adv-gap">${table(["比較", "平均 R 差", "p 值", "結論"], info.pairs.map((pair) => [
          `${esc(pair.a)} vs ${esc(pair.b)}`, signedR(pair.diff), fixed(pair.p, 3),
          pair.significant ? "<b class=\"profit-pos\">差異顯著（校正後）</b>" : pair.looksSignificant ? "未校正顯著，可能是雜訊" : "看不出差異",
        ]))}</div><p class="adv-note">兩兩比較共 ${info.pairs.length} 組，校正後門檻 α = ${info.adjustedAlpha.toFixed(4)}。版本差距小、樣本少時，看不出差異是正常的，不代表版本沒用。</p>` : ""}`);
    const exitBlock = !partial.scaled
      ? block("分批出場貢獻", "", empty("沒有分批出場的交易。匯入 MT4 EA 紀錄中分多筆平倉的單子後，這裡會拆出每一段貢獻多少 R。"))
      : block("分批出場貢獻", `${partial.scaled} 筆分批出場、${partial.single} 筆一次出場。看哪一段出場賺走了大部分 R。`, `
        ${table(["出場順序", "筆數", "平均貢獻 R", "占總貢獻"], partial.legs.filter((row) => row.n).map((row) => [row.label, String(row.n), `<b class="${tone(row.mean)}">${signedR(row.mean)}</b>`, isNum(row.share) ? share(row.share) : "—"]))}
        ${partial.scaledStats && partial.singleStats ? `<div class="adv-gap">${table(["出場方式", "筆數", "平均 R", "勝率", "Profit Factor"], [
          ["分批出場", String(partial.scaledStats.n), `<b class="${tone(partial.scaledStats.mean)}">${signedR(partial.scaledStats.mean)}</b>`, pct(partial.scaledStats.winRate, 0), fixed(partial.scaledStats.profitFactor)],
          ["一次出場", String(partial.singleStats.n), `<b class="${tone(partial.singleStats.mean)}">${signedR(partial.singleStats.mean)}</b>`, pct(partial.singleStats.winRate, 0), fixed(partial.singleStats.profitFactor)],
        ])}</div>` : ""}
        ${partial.comparison ? `<div class="adv-verdict ${partial.comparison.p < 0.05 ? (partial.comparison.diff > 0 ? "good" : "bad") : "warn"}"><strong>${partial.comparison.p < 0.05 ? (partial.comparison.diff > 0 ? "分批出場顯著較好" : "分批出場顯著較差") : "分批與一次出場看不出顯著差異"}</strong><p>平均差 ${signedR(partial.comparison.diff)}，p = ${fixed(partial.comparison.p, 3)}。注意兩組可能因進場品質不同而不可比。</p></div>` : ""}`);
    return versionBlock + exitBlock;
  }

  const RENDERERS = { risk: renderRisk, sequence: renderSequence, exit: renderExit, hold: renderHold, cost: renderCost, exposure: renderExposure, cross: renderCross, versions: renderVersions };

  function draw() {
    tabs.forEach((button) => button.classList.toggle("active", button.dataset.advTab === state.tab));
    const render = RENDERERS[state.tab] || renderRisk;
    try {
      body.innerHTML = render(lastItems);
    } catch (error) {
      body.innerHTML = empty("這個面板暫時無法計算。");
      console.error("Advanced analytics failed", error);
    }
  }

  tabs.forEach((button) => button.addEventListener("click", () => {
    state.tab = button.dataset.advTab;
    persist();
    draw();
  }));
  body.addEventListener("change", (event) => {
    const input = event.target.closest("[data-adv-input]");
    if (!input) return;
    const key = input.dataset.advInput;
    state[key] = input.type === "number" ? Number(input.value) : input.value;
    persist();
    draw();
  });

  window.TradingNoteAdvancedAnalytics = {
    render(items, nextContext = {}) {
      lastItems = Array.isArray(items) ? items : [];
      context = nextContext;
      draw();
    },
  };
})();
