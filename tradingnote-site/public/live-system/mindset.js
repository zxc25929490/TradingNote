// Tags, pre-trade emotion and A/B/C grades, plus an automatic tilt check.
// Annotations live in their own store keyed by trade identity, so grading never rewrites a trade
// (imported, edited and MT4 multi-leg trades all keep working). Analysis functions are pure and tested;
// the page reads app.js globals (tradeIdentityFingerprint, escapeHtml, money, sortByDate).
(function initMindset(root) {
  const STORE_KEY = "tradingnote.tradeAnnotations.v1";
  const EMOTIONS = [
    { id: "calm", label: "冷靜", risky: false },
    { id: "confident", label: "有把握", risky: false },
    { id: "hesitant", label: "猶豫", risky: false },
    { id: "fomo", label: "急躁／怕錯過", risky: true },
    { id: "revenge", label: "想扳回", risky: true },
    { id: "tired", label: "疲勞／分心", risky: true },
    { id: "bored", label: "無聊想做單", risky: true },
  ];
  const GRADES = [
    { id: "A", label: "A 完全照計畫" },
    { id: "B", label: "B 小偏差" },
    { id: "C", label: "C 違反計畫" },
  ];
  const FLAGS = {
    quickReentry: { label: "虧損後 30 分鐘內再進場", short: "急著回補" },
    sizeUp: { label: "虧損後加大手數", short: "虧後加碼" },
    afterStreak: { label: "當天連虧 2 筆後繼續做", short: "連虧硬做" },
    overtrade: { label: "超過平常單日筆數", short: "過度交易" },
    riskyEmotion: { label: "進場時情緒不穩", short: "情緒不穩" },
    gradeC: { label: "自評違反計畫（C）", short: "違反計畫" },
  };
  const finite = (value) => value !== "" && value != null && Number.isFinite(Number(value));
  const sum = (values) => values.reduce((total, value) => total + value, 0);

  function parseTags(text) {
    const list = Array.isArray(text) ? text : String(text || "").split(/[,，、;；#\n]+/);
    return [...new Set(list.map((tag) => String(tag).trim().slice(0, 24)).filter(Boolean))];
  }

  function normalizeAnnotation(value = {}) {
    const tags = parseTags(value.tags);
    const emotion = EMOTIONS.some((item) => item.id === value.emotion) ? value.emotion : "";
    const grade = GRADES.some((item) => item.id === value.grade) ? value.grade : "";
    return { tags, emotion, grade };
  }
  const isEmpty = (annotation) => !annotation.tags.length && !annotation.emotion && !annotation.grade;

  const isLoss = (trade) => (finite(trade.r) ? Number(trade.r) < 0 : finite(trade.profit) && Number(trade.profit) < 0);
  const minutesOf = (trade) => {
    const match = String(trade.time || "").match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  // MT4 close time ("2026.01.05 09:12" or "09:12"), as minutes of the trade's own day.
  const closeMinutesOf = (trade) => {
    const text = String(trade.closeTime || "");
    const full = text.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{1,2}):(\d{2})/);
    if (full) {
      const sameDay = `${full[1]}-${full[2]}-${full[3]}` === String(trade.date || "").replace(/[./]/g, "-");
      return sameDay ? Number(full[4]) * 60 + Number(full[5]) : null;
    }
    const time = text.match(/^(\d{1,2}):(\d{2})/);
    return time ? Number(time[1]) * 60 + Number(time[2]) : null;
  };
  // Minutes from an earlier losing trade to this entry, or null when it is not a re-entry:
  // with a close time the earlier trade must have closed first; without one (manual / older records),
  // only the same market counts, so two indices opened together are not read as revenge trading.
  const reentryGap = (previous, trade) => {
    const open = minutesOf(trade);
    if (open == null) return null;
    const closed = closeMinutesOf(previous);
    if (closed != null) return open >= closed ? open - closed : null;
    const sameMarket = String(previous.pair || "").toUpperCase() === String(trade.pair || "").toUpperCase();
    const previousOpen = minutesOf(previous);
    return sameMarket && previousOpen != null && open >= previousOpen ? open - previousOpen : null;
  };

  // Usual busiest day: 90th percentile of trades per day, never below 3.
  function dailyLimit(items) {
    const counts = new Map();
    for (const trade of items) counts.set(trade.date, (counts.get(trade.date) || 0) + 1);
    const sorted = [...counts.values()].sort((a, b) => a - b);
    if (!sorted.length) return 3;
    return Math.max(3, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]);
  }

  // items must be chronological; annotationOf(trade) returns a normalized annotation.
  function tiltFlags(items, annotationOf = () => normalizeAnnotation()) {
    const limit = dailyLimit(items);
    const perDay = new Map();
    return items.map((trade, index) => {
      const flags = [];
      const previous = items[index - 1];
      const sameDay = previous && previous.date && previous.date === trade.date;
      const dayCount = (perDay.get(trade.date) || 0) + 1;
      perDay.set(trade.date, dayCount);
      const gap = sameDay && isLoss(previous) ? reentryGap(previous, trade) : null;
      if (gap != null) {
        if (gap <= 30) flags.push("quickReentry");
        if (finite(trade.lots) && finite(previous.lots) && Number(trade.lots) > Number(previous.lots) * 1.2) flags.push("sizeUp");
        const beforePrevious = items[index - 2];
        if (beforePrevious && beforePrevious.date === trade.date && isLoss(beforePrevious) && reentryGap(beforePrevious, previous) != null) flags.push("afterStreak");
      }
      if (dayCount > limit) flags.push("overtrade");
      const note = annotationOf(trade);
      if (EMOTIONS.find((item) => item.id === note.emotion)?.risky) flags.push("riskyEmotion");
      if (note.grade === "C") flags.push("gradeC");
      return { trade, flags, annotation: note };
    });
  }

  function performance(items) {
    const rValues = items.filter((trade) => !trade.riskUnavailable && finite(trade.r)).map((trade) => Number(trade.r));
    const money = items.filter((trade) => finite(trade.profit)).map((trade) => Number(trade.profit));
    return {
      n: items.length,
      rCount: rValues.length,
      winRate: rValues.length ? rValues.filter((value) => value > 0).length / rValues.length * 100 : null,
      avgR: rValues.length ? sum(rValues) / rValues.length : null,
      totalR: sum(rValues),
      profit: money.length ? sum(money) : null,
    };
  }

  function tiltSummary(flagged, { recent = 30 } = {}) {
    const window = flagged.slice(-recent);
    const cleanRecent = window.filter((row) => !row.flags.length).length;
    const score = window.length ? Math.round(cleanRecent / window.length * 100) : null;
    const level = score == null ? "none" : score >= 85 ? "steady" : score >= 65 ? "watch" : "tilt";
    const byFlag = Object.keys(FLAGS).map((id) => {
      const rows = flagged.filter((row) => row.flags.includes(id));
      return { id, ...FLAGS[id], ...performance(rows.map((row) => row.trade)) };
    }).filter((row) => row.n);
    return {
      score,
      level,
      recentCount: window.length,
      clean: performance(flagged.filter((row) => !row.flags.length).map((row) => row.trade)),
      flagged: performance(flagged.filter((row) => row.flags.length).map((row) => row.trade)),
      byFlag,
    };
  }

  // keysOf(trade) returns one or more group keys (a trade can carry several tags).
  function groupPerformance(items, keysOf) {
    const groups = new Map();
    for (const trade of items) {
      for (const key of keysOf(trade)) {
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(trade);
      }
    }
    return [...groups.entries()].map(([key, list]) => ({ key, ...performance(list) }))
      .sort((a, b) => b.totalR - a.totalR || b.n - a.n);
  }

  const api = { STORE_KEY, EMOTIONS, GRADES, FLAGS, parseTags, normalizeAnnotation, dailyLimit, tiltFlags, tiltSummary, groupPerformance, performance };
  root.TradingNoteMindset = api;

  // ---------------------------------------------------------------- store
  if (typeof document === "undefined") return;
  const keyOf = (trade) => (typeof tradeIdentityFingerprint === "function" ? tradeIdentityFingerprint(trade) : String(trade.localId || trade.baseKey || ""));
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; } catch (_) { return {}; }
  }
  let store = loadStore();
  function annotationOf(trade) { return normalizeAnnotation(store[keyOf(trade)]); }
  function setAnnotation(trade, value, previousTrade = null) {
    const next = normalizeAnnotation(value);
    if (previousTrade) delete store[keyOf(previousTrade)];
    if (isEmpty(next)) delete store[keyOf(trade)];
    else store[keyOf(trade)] = next;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* storage unavailable */ }
  }
  window.addEventListener("storage", (event) => { if (event.key === STORE_KEY) store = loadStore(); });
  Object.assign(api, { annotationOf, setAnnotation, reload: () => { store = loadStore(); } });

  // ---------------------------------------------------------------- page
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (typeof escapeHtml === "function" ? escapeHtml(value) : String(value));
  const fmtR = (value) => (finite(value) ? `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}R` : "—");
  const fmtMoney = (value) => (finite(value) ? (typeof money === "function" ? money(value) : `$${Number(value).toFixed(2)}`) : "—");
  const tone = (value) => (finite(value) && value !== 0 ? (value > 0 ? "pos" : "neg") : "");
  const emotionLabel = (id) => EMOTIONS.find((item) => item.id === id)?.label || "";
  let lastItems = [];
  let onlyUntagged = false;

  function perfCells(row) {
    return `<td>${row.n}</td><td>${row.winRate == null ? "—" : `${row.winRate.toFixed(0)}%`}</td><td class="${tone(row.avgR)}">${fmtR(row.avgR)}</td><td class="${tone(row.totalR)}">${fmtR(row.totalR)}</td><td class="${tone(row.profit)}">${fmtMoney(row.profit)}</td>`;
  }
  const PERF_HEAD = "<th>筆數</th><th>勝率</th><th>平均 R</th><th>總 R</th><th>損益</th>";

  function renderTilt(summary) {
    const labels = { steady: "穩定", watch: "要注意", tilt: "失控風險", none: "尚無資料" };
    $("#mindTiltScore").textContent = summary.score == null ? "—" : summary.score;
    $("#mindTiltLevel").textContent = labels[summary.level];
    $("#mindTilt").dataset.level = summary.level;
    $("#mindTiltBar").style.width = `${summary.score ?? 0}%`;
    $("#mindTiltNote").textContent = summary.recentCount
      ? `最近 ${summary.recentCount} 筆中，沒有觸發任何警訊的比例。`
      : "還沒有交易。";
    const compare = summary.flagged.n
      ? `有警訊的 ${summary.flagged.n} 筆平均 <b class="${tone(summary.flagged.avgR)}">${fmtR(summary.flagged.avgR)}</b>，損益 <b class="${tone(summary.flagged.profit)}">${fmtMoney(summary.flagged.profit)}</b>；乾淨的 ${summary.clean.n} 筆平均 <b class="${tone(summary.clean.avgR)}">${fmtR(summary.clean.avgR)}</b>，損益 <b class="${tone(summary.clean.profit)}">${fmtMoney(summary.clean.profit)}</b>。`
      : "目前沒有任何交易觸發警訊。";
    $("#mindTiltCompare").innerHTML = compare;
    $("#mindFlagRows").innerHTML = summary.byFlag.length
      ? summary.byFlag.map((row) => `<tr><th scope="row">${row.label}</th>${perfCells(row)}</tr>`).join("")
      : `<tr><td colspan="6" class="mind-dim">沒有觸發的警訊。</td></tr>`;
  }

  function renderGroups(items) {
    const render = (target, rows, empty) => {
      $(target).innerHTML = rows.length
        ? rows.map((row) => `<tr class="${row.n < 5 ? "mind-small" : ""}"><th scope="row">${esc(row.label || row.key)}${row.n < 5 ? "<small>樣本少</small>" : ""}</th>${perfCells(row)}</tr>`).join("")
        : `<tr><td colspan="6" class="mind-dim">${empty}</td></tr>`;
    };
    render("#mindGradeRows", groupPerformance(items, (trade) => [annotationOf(trade).grade || "未評級"])
      .map((row) => ({ ...row, label: GRADES.find((item) => item.id === row.key)?.label || row.key }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key))), "還沒有交易。");
    render("#mindEmotionRows", groupPerformance(items, (trade) => [emotionLabel(annotationOf(trade).emotion) || "未記錄"]), "還沒有交易。");
    render("#mindTagRows", groupPerformance(items, (trade) => annotationOf(trade).tags), "還沒有任何標籤。在下方「快速標記」幫交易加上標籤後，這裡會列出每個標籤的表現。");
  }

  function renderQuickList(items) {
    const allTags = [...new Set(items.flatMap((trade) => annotationOf(trade).tags))].sort();
    $("#mindTagSuggestions").innerHTML = allTags.map((tag) => `<option value="${esc(tag)}"></option>`).join("");
    const recent = [...items].reverse()
      .filter((trade) => !onlyUntagged || !annotationOf(trade).grade)
      .slice(0, 15);
    $("#mindQuickRows").innerHTML = recent.length ? recent.map((trade) => {
      const note = annotationOf(trade);
      const id = esc(keyOf(trade));
      return `<tr data-key="${id}">
        <td>${esc(trade.date || "")}<small>${esc(trade.time || "")}</small></td>
        <td>${esc(trade.pair || "")}</td>
        <td class="${tone(Number(trade.r))}">${fmtR(trade.r)}<small class="${tone(Number(trade.profit))}">${fmtMoney(trade.profit)}</small></td>
        <td><div class="mind-grades" role="group" aria-label="評級">${GRADES.map((grade) => `<button type="button" data-grade="${grade.id}" class="${note.grade === grade.id ? "active" : ""}" title="${grade.label}">${grade.id}</button>`).join("")}</div></td>
        <td><select data-emotion aria-label="進場時情緒"><option value="">—</option>${EMOTIONS.map((item) => `<option value="${item.id}" ${note.emotion === item.id ? "selected" : ""}>${item.label}</option>`).join("")}</select></td>
        <td><input data-tags list="mindTagSuggestions" value="${esc(note.tags.join(", "))}" placeholder="例如：突破, 追價" aria-label="標籤（逗號分隔）" /></td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="mind-dim">${onlyUntagged ? "最近的交易都已評級。" : "還沒有交易。"}</td></tr>`;
  }

  function renderMindset(items) {
    if (!$("#mindQuickRows")) return;
    bind();
    lastItems = (typeof sortByDate === "function" ? sortByDate(items) : items).filter((trade) => trade.recordType !== "missed_opportunity");
    const flagged = tiltFlags(lastItems, annotationOf);
    renderTilt(tiltSummary(flagged));
    renderGroups(lastItems);
    renderQuickList(lastItems);
    const graded = lastItems.filter((trade) => annotationOf(trade).grade).length;
    $("#mindCoverage").textContent = `${graded} / ${lastItems.length} 筆已評級`;
  }

  function bind() {
    const body = $("#mindQuickRows");
    if (body.dataset.bound) return;
    body.dataset.bound = "true";
    const tradeFor = (row) => lastItems.find((trade) => keyOf(trade) === row.dataset.key);
    const update = (row, patch) => {
      const trade = tradeFor(row);
      if (!trade) return;
      setAnnotation(trade, { ...annotationOf(trade), ...patch });
      renderMindset(lastItems);
    };
    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-grade]");
      if (!button) return;
      const row = button.closest("tr");
      const current = annotationOf(tradeFor(row)).grade;
      update(row, { grade: current === button.dataset.grade ? "" : button.dataset.grade });
    });
    body.addEventListener("change", (event) => {
      const row = event.target.closest("tr");
      if (event.target.matches("[data-emotion]")) update(row, { emotion: event.target.value });
      if (event.target.matches("[data-tags]")) update(row, { tags: event.target.value });
    });
    $("#mindOnlyUntagged").addEventListener("change", (event) => { onlyUntagged = event.target.checked; renderMindset(lastItems); });
  }

  api.renderMindset = renderMindset;
  root.renderMindset = renderMindset;
})(typeof window !== "undefined" ? window : globalThis);
