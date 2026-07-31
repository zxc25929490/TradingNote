const importedTrades = window.TRADES || [];
const STORAGE_KEY = "tradingnote.localTrades";
const DELETED_KEY = "tradingnote.deletedTrades";
const ACCOUNT_RULES_KEY = "tradingnote.accountRules";
const THEME_KEY = "tradingnote.theme";

applyStoredTheme();

let localTrades = loadLocalTrades();
let deletedTrades = loadDeletedTrades();
let trades = mergeTrades();
let currentDetailId = null;
let toastTimer = null;
let accountRules = loadAccountRules();
let selectedPeriodMonth = monthKey(new Date());
let selectedPeriodWeekStart = null;
let reviewsExpanded = false;

const els = {
  year: document.querySelector("#yearFilter"),
  pageTitle: document.querySelector("#pageTitle"),
  navLinks: document.querySelectorAll("[data-page-link]"),
  pages: document.querySelectorAll("[data-page]"),
  pair: document.querySelector("#pairFilter"),
  outcome: document.querySelector("#outcomeFilter"),
  window: document.querySelector("#windowFilter"),
  search: document.querySelector("#searchInput"),
  totalProfit: document.querySelector("#totalProfit"),
  avgProfit: document.querySelector("#avgProfit"),
  totalR: document.querySelector("#totalR"),
  avgR: document.querySelector("#avgR"),
  winRate: document.querySelector("#winRate"),
  tradeCount: document.querySelector("#tradeCount"),
  maxDd: document.querySelector("#maxDd"),
  lossStreak: document.querySelector("#lossStreak"),
  profitTrend: document.querySelector("#profitTrend"),
  rTrend: document.querySelector("#rTrend"),
  winTrend: document.querySelector("#winTrend"),
  ddTrend: document.querySelector("#ddTrend"),
  filterSummary: document.querySelector("#filterSummary"),
  resetFilters: document.querySelector("#resetFiltersButton"),
  profitFactor: document.querySelector("#profitFactor"),
  expectancy: document.querySelector("#expectancy"),
  averageWin: document.querySelector("#averageWin"),
  averageLoss: document.querySelector("#averageLoss"),
  bestPair: document.querySelector("#bestPair"),
  worstPair: document.querySelector("#worstPair"),
  profitChart: document.querySelector("#profitChart"),
  profitModes: document.querySelectorAll("[data-profit-mode]"),
  analyticsMetrics: document.querySelector("#analyticsMetrics"),
  edgeSummary: document.querySelector("#edgeSummary"),
  edgeChart: document.querySelector("#edgeChart"),
  accountRulesForm: document.querySelector("#accountRulesForm"),
  accountNameInput: document.querySelector("#accountNameInput"),
  accountPhaseInput: document.querySelector("#accountPhaseInput"),
  initialBalanceInput: document.querySelector("#initialBalanceInput"),
  profitTargetInput: document.querySelector("#profitTargetInput"),
  dailyLossInput: document.querySelector("#dailyLossInput"),
  maxLossInput: document.querySelector("#maxLossInput"),
  minimumDaysInput: document.querySelector("#minimumDaysInput"),
  lossModeInput: document.querySelector("#lossModeInput"),
  challengeStatus: document.querySelector("#challengeStatus"),
  objectiveCards: document.querySelector("#objectiveCards"),
  riskMonitorDate: document.querySelector("#riskMonitorDate"),
  riskMonitorLabel: document.querySelector("#riskMonitorLabel"),
  dailyRiskGauge: document.querySelector("#dailyRiskGauge"),
  riskMonitorStats: document.querySelector("#riskMonitorStats"),
  bestDayStatus: document.querySelector("#bestDayStatus"),
  bestDayRule: document.querySelector("#bestDayRule"),
  ftmoDiscipline: document.querySelector("#ftmoDiscipline"),
  dailySummaryRows: document.querySelector("#dailySummaryRows"),
  directionAnalysis: document.querySelector("#directionAnalysis"),
  hourAnalysis: document.querySelector("#hourAnalysis"),
  weekdayAnalysis: document.querySelector("#weekdayAnalysis"),
  calendarSummary: document.querySelector("#calendarSummary"),
  calendarHeatmap: document.querySelector("#calendarHeatmap"),
  disciplineScore: document.querySelector("#disciplineScore"),
  disciplineBreakdown: document.querySelector("#disciplineBreakdown"),
  mistakeRows: document.querySelector("#mistakeRows"),
  weeklyReport: document.querySelector("#weeklyReport"),
  actionItems: document.querySelector("#actionItems"),
  weekRange: document.querySelector("#weekRange"),
  weeklyBreakdown: document.querySelector("#weeklyBreakdown"),
  monthRange: document.querySelector("#monthRange"),
  weekStats: document.querySelector("#weekStats"),
  monthStats: document.querySelector("#monthStats"),
  monthlyRows: document.querySelector("#monthlyRows"),
  chartBadge: document.querySelector("#chartBadge"),
  chart: document.querySelector("#equityChart"),
  equityTooltip: document.querySelector("#equityTooltip"),
  crosshairX: document.querySelector("#chartCrosshairX"),
  crosshairY: document.querySelector("#chartCrosshairY"),
  pairBars: document.querySelector("#pairBars"),
  rows: document.querySelector("#tradeRows"),
  theme: document.querySelector("#themeToggle"),
  exportCsv: document.querySelector("#exportCsvButton"),
  account: document.querySelector("#accountInput"),
  risk: document.querySelector("#riskInput"),
  sl: document.querySelector("#slInput"),
  pip: document.querySelector("#pipInput"),
  calc: document.querySelector("#calcOutput"),
  returnSimulatorForm: document.querySelector("#returnSimulatorForm"),
  simBalance: document.querySelector("#simBalanceInput"),
  simRisk: document.querySelector("#simRiskInput"),
  simReward: document.querySelector("#simRewardInput"),
  simWinRate: document.querySelector("#simWinRateInput"),
  simTrades: document.querySelector("#simTradesInput"),
  useJournalStats: document.querySelector("#useJournalStatsButton"),
  simulationMetrics: document.querySelector("#simulationMetrics"),
  simulationChart: document.querySelector("#simulationChart"),
  simulationFormula: document.querySelector("#simulationFormula"),
  checklist: document.querySelector("#checklistItems"),
  checklistScore: document.querySelector("#checklistScore"),
  tradeGate: document.querySelector("#tradeGate"),
  newTrade: document.querySelector("#newTradeButton"),
  tradeDialog: document.querySelector("#tradeDialog"),
  closeTradeDialog: document.querySelector("#closeTradeDialog"),
  tradeForm: document.querySelector("#tradeForm"),
  clearLocalTrades: document.querySelector("#clearLocalTrades"),
  importFile: document.querySelector("#importFileInput"),
  replaceFile: document.querySelector("#replaceFileInput"),
  exportJson: document.querySelector("#exportJsonButton"),
  toggleReviews: document.querySelector("#toggleReviewsButton"),
  tradeEmpty: document.querySelector("#tradeEmptyState"),
  dialogTitle: document.querySelector("#tradeDialogTitle"),
  dialogSubtitle: document.querySelector("#tradeDialogSubtitle"),
  saveTrade: document.querySelector("#saveTradeButton"),
  tradeOutcomePulse: document.querySelector("#tradeOutcomePulse"),
  tradeRiskPreview: document.querySelector("#tradeRiskPreview"),
  tradeSessionClock: document.querySelector("#tradeSessionClock"),
  toast: document.querySelector("#toast"),
  drawer: document.querySelector("#detailDrawer"),
  detail: document.querySelector("#detailContent"),
  closeDrawer: document.querySelector("#closeDrawer"),
};

const checklist = [
  { label: "心情平穩", required: true },
  { label: "開盤前完成 TP / SL 規劃", required: true },
  { label: "確認沒有高影響新聞", required: true },
  { label: "今天尚未超過交易上限", required: true },
  { label: "支撐壓力轉換清楚", required: false },
  { label: "symbols 跟券商一致", required: false },
];

const pageTitles = {
  dashboard: "交易績效儀表板",
  objectives: "挑戰目標與風險",
  analytics: "深度數據分析",
  review: "交易複盤中心",
  period: "週/月績效分析",
  trades: "交易紀錄",
  checklist: "交易前檢查表",
  calculator: "風控手數計算",
};

let profitChartMode = "profit";
let equityChartState = null;
let simulationResult = null;
let lastChartAnimationKey = "";
const metricAnimations = new WeakMap();
const motionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const mistakeCategories = [
  { key: "risk", label: "風控 / SL", keywords: ["sl", "止損", "風險", "手數", "ea", "max", "爆倉", "損失"] },
  { key: "entry", label: "太早進場 / 沒等確認", keywords: ["太早", "早進", "沒等", "回撤", "追高", "進場點", "來不及"] },
  { key: "exit", label: "出場 / BE / TP 管理", keywords: ["be", "tp", "close", "砍", "收手", "沒be", "移動"] },
  { key: "news", label: "新聞 / Slow Day / ATR", keywords: ["新聞", "slow", "atr", "fomc", "jolts", "banks", "流動性"] },
  { key: "structure", label: "結構 / 支撐壓力", keywords: ["支撐", "壓力", "結構", "突破", "aoi", "ema", "拒絕", "畫錯", "value"] },
  { key: "discipline", label: "紀律 / Over Trade", keywords: ["over", "一天", "最多", "凹單", "紀律", "規則", "計畫"] },
];

function loadLocalTrades() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function loadDeletedTrades() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function loadAccountRules() {
  const defaults = {
    name: "FTMO Challenge",
    phase: "challenge",
    initialBalance: 100000,
    profitTargetPercent: 10,
    dailyLossPercent: 5,
    maxLossPercent: 10,
    minimumDays: 4,
    lossMode: "static",
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(ACCOUNT_RULES_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function saveLocalTrades() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localTrades));
  localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(deletedTrades)));
}

function saveAccountRules() {
  localStorage.setItem(ACCOUNT_RULES_KEY, JSON.stringify(accountRules));
}

function applyStoredTheme() {
  const theme = localStorage.getItem(THEME_KEY) || "dark";
  document.body.classList.toggle("dark", theme !== "light");
}

function populateAccountRulesForm() {
  els.accountNameInput.value = accountRules.name;
  els.accountPhaseInput.value = accountRules.phase;
  els.initialBalanceInput.value = accountRules.initialBalance;
  els.profitTargetInput.value = accountRules.profitTargetPercent;
  els.dailyLossInput.value = accountRules.dailyLossPercent;
  els.maxLossInput.value = accountRules.maxLossPercent;
  els.minimumDaysInput.value = accountRules.minimumDays;
  els.lossModeInput.value = accountRules.lossMode;
}

function baseTradeKey(trade) {
  return `${trade.source || "TradingNote"}::${trade.row || trade.id || ""}::${trade.date || ""}`;
}

function enrichTradeFields(trade) {
  const entry = Number(trade.entry);
  const stopLoss = Number(trade.stopLoss);
  const derivedSlPips =
    Number.isFinite(entry) && Number.isFinite(stopLoss) && entry !== stopLoss
      ? Math.abs(entry - stopLoss)
      : null;
  const slPips = Number.isFinite(Number(trade.slPips)) && Number(trade.slPips) > 0
    ? Number(trade.slPips)
    : derivedSlPips;
  const derivedLots =
    slPips && Number(trade.r) !== 0 && Number.isFinite(Number(trade.profit)) && Number.isFinite(Number(trade.r))
      ? Math.abs(Number(trade.profit) / (Number(trade.r) * slPips))
      : null;
  return {
    ...trade,
    slPips: slPips == null ? null : Number(slPips.toFixed(4)),
    lots: Number.isFinite(Number(trade.lots)) && Number(trade.lots) > 0
      ? Number(trade.lots)
      : derivedLots == null
        ? null
        : Number(derivedLots.toFixed(4)),
  };
}

function mergeTrades() {
  return [
    ...importedTrades
      .filter((trade) => !deletedTrades.has(baseTradeKey(trade)))
      .map((trade) => ({ ...enrichTradeFields(trade), origin: "excel", baseKey: baseTradeKey(trade) })),
    ...localTrades.map((trade) => ({ ...enrichTradeFields(trade), origin: "local" })),
  ].map((trade, index) => ({ ...trade, id: index + 1 }));
}

function showToast(message, type = "success") {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast ${type === "error" ? "error" : ""}`;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 4200);
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function signed(value, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value || 0).toFixed(2)}${suffix}`;
}

function animateMetric(element, target, formatter) {
  const previous = element.dataset.numericValue === undefined ? 0 : Number(element.dataset.numericValue);
  element.dataset.numericValue = String(target);
  if (!motionAllowed || !Number.isFinite(previous) || previous === target) {
    element.textContent = formatter(target);
    return;
  }
  cancelAnimationFrame(metricAnimations.get(element));
  const startedAt = performance.now();
  const duration = 520;
  element.classList.remove("metric-pop");
  void element.offsetWidth;
  element.classList.add("metric-pop");
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatter(previous + (target - previous) * eased);
    if (progress < 1) metricAnimations.set(element, requestAnimationFrame(tick));
  };
  metricAnimations.set(element, requestAnimationFrame(tick));
}

function attachRippleFeedback() {
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest("button, .file-button");
    if (!target || target.disabled || !motionAllowed) return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height) * 1.35;
    ripple.className = "button-ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
}

function parseTradeDate(trade) {
  if (!trade.date) return null;
  const date = new Date(`${trade.date}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getWeekRange(anchor = new Date()) {
  const start = new Date(anchor);
  const day = start.getDay() || 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function inRange(trade, start, end) {
  const date = parseTradeDate(trade);
  if (!date) return false;
  return date >= start && date <= end;
}

function tradeText(trade) {
  return `${trade.lesson || ""} ${trade.review || ""} ${trade.setup || ""} ${trade.checklist || ""}`.toLowerCase();
}

function classifyMistakes(trade) {
  const text = tradeText(trade);
  const matches = mistakeCategories.filter((category) => category.keywords.some((keyword) => text.includes(keyword.toLowerCase())));
  return matches.length ? matches : [{ key: "uncategorized", label: "未分類 Lesson", keywords: [] }];
}

function isRuleBreak(trade) {
  const text = tradeText(trade);
  const checklistBreak = String(trade.checklist || "").toUpperCase().includes("X");
  const ruleWords = ["over", "凹單", "沒遵守", "沒有遵守", "沒照", "太早", "追高", "爆倉", "風險", "來不及", "忘記"];
  return checklistBreak || ruleWords.some((word) => text.includes(word));
}

function groupTradesByDate(items) {
  const grouped = new Map();
  for (const trade of items) {
    if (!trade.date) continue;
    const bucket = grouped.get(trade.date) || [];
    bucket.push(trade);
    grouped.set(trade.date, bucket);
  }
  return grouped;
}

function sortByDate(items) {
  return items.slice().sort((a, b) => {
    const dateOrder = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateOrder) return dateOrder;
    const timeOrder = String(a.time || "").localeCompare(String(b.time || ""));
    return timeOrder || a.id - b.id;
  });
}

function populateFilters(keepValues = false) {
  const current = keepValues ? { year: els.year.value, pair: els.pair.value } : {};
  const years = ["all", ...new Set(trades.map((trade) => trade.year).filter(Boolean))].sort((a, b) => {
    if (a === "all") return -1;
    if (b === "all") return 1;
    return b - a;
  });
  const pairs = ["all", ...Array.from(new Set(trades.map((trade) => trade.pair).filter(Boolean))).sort()];

  els.year.innerHTML = years.map((year) => `<option value="${year}">${year === "all" ? "All" : year}</option>`).join("");
  els.pair.innerHTML = pairs.map((pair) => `<option value="${pair}">${pair === "all" ? "All" : pair}</option>`).join("");

  if (current.year && years.map(String).includes(current.year)) els.year.value = current.year;
  if (current.pair && pairs.includes(current.pair)) els.pair.value = current.pair;
}

function baseFilteredTrades() {
  const query = els.search.value.trim().toLowerCase();
  return trades.filter((trade) => {
    const yearOk = els.year.value === "all" || String(trade.year) === els.year.value;
    const pairOk = els.pair.value === "all" || trade.pair === els.pair.value;
    const outcomeOk = els.outcome.value === "all" || trade.outcome === els.outcome.value;
    const haystack = `${trade.pair} ${trade.source} ${trade.setup || ""} ${trade.review || ""} ${trade.lesson || ""} ${trade.date || ""}`.toLowerCase();
    const queryOk = !query || haystack.includes(query);
    return yearOk && pairOk && outcomeOk && queryOk;
  });
}

function filteredTrades() {
  let items = sortByDate(baseFilteredTrades());
  if (els.window.value === "week") {
    const { start, end } = getWeekRange();
    items = items.filter((trade) => inRange(trade, start, end));
  } else if (els.window.value === "month") {
    const now = new Date();
    const currentMonth = monthKey(now);
    items = items.filter((trade) => {
      const date = parseTradeDate(trade);
      return date && monthKey(date) === currentMonth;
    });
  } else if (els.window.value !== "all") {
    items = items.slice(-Number(els.window.value));
  }

  return items;
}

function metricComparisons() {
  const items = sortByDate(baseFilteredTrades());
  const now = new Date();
  const currentWeek = getWeekRange(now);
  const previousWeekAnchor = new Date(currentWeek.start);
  previousWeekAnchor.setDate(previousWeekAnchor.getDate() - 7);
  const previousWeek = getWeekRange(previousWeekAnchor);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return [
    {
      current: items.filter((trade) => inRange(trade, currentWeek.start, currentWeek.end)),
      previous: items.filter((trade) => inRange(trade, previousWeek.start, previousWeek.end)),
      label: "較上週",
    },
    {
      current: items.filter((trade) => {
        const date = parseTradeDate(trade);
        return date && monthKey(date) === monthKey(now);
      }),
      previous: items.filter((trade) => {
        const date = parseTradeDate(trade);
        return date && monthKey(date) === monthKey(previousMonth);
      }),
      label: "較上月",
    },
  ];
}

function computeStats(items) {
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let currentLoss = 0;
  let worstLoss = 0;
  let currentWin = 0;
  let bestWin = 0;

  for (const trade of items) {
    equity += trade.r;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak);
    currentLoss = trade.r < 0 ? currentLoss + 1 : 0;
    worstLoss = Math.max(worstLoss, currentLoss);
    currentWin = trade.r > 0 ? currentWin + 1 : 0;
    bestWin = Math.max(bestWin, currentWin);
  }

  const wins = items.filter((trade) => trade.profit > 0);
  const losses = items.filter((trade) => trade.profit < 0);
  const decided = wins.length + losses.length;
  const totalProfit = items.reduce((sum, trade) => sum + trade.profit, 0);
  const totalR = items.reduce((sum, trade) => sum + trade.r, 0);
  const grossWinR = wins.reduce((sum, trade) => sum + trade.r, 0);
  const grossLossR = Math.abs(losses.reduce((sum, trade) => sum + trade.r, 0));
  const pairStats = summarizePairs(items);

  return {
    totalProfit,
    totalR,
    winRate: decided ? (wins.length / decided) * 100 : 0,
    maxDd,
    worstLoss,
    bestWin,
    profitFactor: grossLossR ? grossWinR / grossLossR : grossWinR ? Infinity : 0,
    expectancy: items.length ? totalR / items.length : 0,
    averageWin: wins.length ? grossWinR / wins.length : 0,
    averageLoss: losses.length ? -grossLossR / losses.length : 0,
    bestPair: pairStats[0],
    worstPair: pairStats.at(-1),
  };
}

function computeDailySummaries(items) {
  const grouped = groupTradesByDate(sortByDate(items));
  let runningBalance = accountRules.initialBalance;
  let highestClosingBalance = accountRules.initialBalance;
  const maxLossAmount = accountRules.initialBalance * (accountRules.maxLossPercent / 100);
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayTrades]) => {
      const startBalance = runningBalance;
      let intraday = 0;
      let lowestIntraday = 0;
      for (const trade of dayTrades) {
        intraday += Number(trade.profit || 0);
        lowestIntraday = Math.min(lowestIntraday, intraday);
      }
      const profit = dayTrades.reduce((sum, trade) => sum + Number(trade.profit || 0), 0);
      const totalR = dayTrades.reduce((sum, trade) => sum + Number(trade.r || 0), 0);
      const lots = dayTrades.reduce((sum, trade) => sum + Number(trade.lots || 0), 0);
      runningBalance += profit;
      const maxLossFloor = accountRules.lossMode === "trailing"
        ? highestClosingBalance - maxLossAmount
        : accountRules.initialBalance - maxLossAmount;
      const dailyLossAmount = accountRules.initialBalance * (accountRules.dailyLossPercent / 100);
      const dailyLossUsed = Math.abs(Math.min(0, lowestIntraday));
      const status = dailyLossUsed > dailyLossAmount || startBalance + lowestIntraday < maxLossFloor
        ? "breach"
        : dailyLossUsed >= dailyLossAmount * 0.75
          ? "warning"
          : "safe";
      highestClosingBalance = Math.max(highestClosingBalance, runningBalance);
      return {
        date,
        trades: dayTrades,
        count: dayTrades.length,
        lots,
        profit,
        totalR,
        startBalance,
        closingBalance: runningBalance,
        lowestIntraday,
        dailyLossUsed,
        dailyLossAmount,
        maxLossFloor,
        status,
      };
    });
}

function renderObjectives(items) {
  const days = computeDailySummaries(items);
  const stats = computeStats(items);
  const initial = accountRules.initialBalance;
  const currentBalance = initial + stats.totalProfit;
  const targetAmount = initial * (accountRules.profitTargetPercent / 100);
  const dailyLimit = initial * (accountRules.dailyLossPercent / 100);
  const maxLossAmount = initial * (accountRules.maxLossPercent / 100);
  const highestClose = Math.max(initial, ...days.map((day) => day.closingBalance));
  const maxLossFloor = accountRules.lossMode === "trailing" ? highestClose - maxLossAmount : initial - maxLossAmount;
  const maxLossRemaining = Math.max(0, currentBalance - maxLossFloor);
  const maxLossUsed = Math.max(0, maxLossAmount - maxLossRemaining);
  const profitableDays = days.filter((day) => day.profit > 0);
  const positiveProfit = profitableDays.reduce((sum, day) => sum + day.profit, 0);
  const bestDay = profitableDays.reduce((best, day) => (!best || day.profit > best.profit ? day : best), null);
  const bestDayPercent = positiveProfit && bestDay ? (bestDay.profit / positiveProfit) * 100 : 0;
  const extraNeeded = bestDay ? Math.max(0, bestDay.profit / 0.5 - positiveProfit) : 0;
  const absoluteDayTotal = days.reduce((sum, day) => sum + Math.abs(day.profit), 0);
  const largestAbsoluteDay = Math.max(0, ...days.map((day) => Math.abs(day.profit)));
  const discipline = absoluteDayTotal ? Math.max(0, (1 - largestAbsoluteDay / absoluteDayTotal) * 100) : 0;
  const dailyBreach = days.some((day) => day.status === "breach");
  const maxLossBreach = currentBalance < maxLossFloor;
  const targetPassed = accountRules.profitTargetPercent === 0 || stats.totalProfit >= targetAmount;
  const daysPassed = days.length >= accountRules.minimumDays;
  const bestDayPassed = bestDayPercent <= 50 || !bestDay;
  const passed = targetPassed && daysPassed && bestDayPassed && !dailyBreach && !maxLossBreach;
  const warning = !passed && !dailyBreach && !maxLossBreach;

  els.challengeStatus.textContent = passed ? "PASS" : warning ? "IN PROGRESS" : "BREACH";
  els.challengeStatus.className = `challenge-status ${passed ? "pass" : warning ? "warning" : "breach"}`;

  const clampPercent = (value) => Math.max(0, Math.min(100, value));
  const cards = [
    {
      label: "獲利目標",
      value: `${money(stats.totalProfit)} / ${money(targetAmount)}`,
      detail: `${clampPercent(targetAmount ? (stats.totalProfit / targetAmount) * 100 : 100).toFixed(1)}% 完成`,
      progress: clampPercent(targetAmount ? (stats.totalProfit / targetAmount) * 100 : 100),
      state: targetPassed ? "" : "warning",
    },
    {
      label: "最大虧損空間",
      value: money(maxLossRemaining),
      detail: `限制線 ${money(maxLossFloor)}`,
      progress: clampPercent((maxLossUsed / maxLossAmount) * 100),
      state: maxLossBreach ? "breach" : maxLossUsed >= maxLossAmount * 0.75 ? "warning" : "",
    },
    {
      label: "最低交易日",
      value: `${days.length} / ${accountRules.minimumDays}`,
      detail: daysPassed ? "交易日目標完成" : `尚差 ${accountRules.minimumDays - days.length} 天`,
      progress: clampPercent(accountRules.minimumDays ? (days.length / accountRules.minimumDays) * 100 : 100),
      state: daysPassed ? "" : "warning",
    },
    {
      label: "目前帳戶餘額",
      value: money(currentBalance),
      detail: `${stats.totalProfit >= 0 ? "+" : ""}${((stats.totalProfit / initial) * 100).toFixed(2)}%`,
      progress: clampPercent(50 + (stats.totalProfit / Math.max(targetAmount, maxLossAmount, 1)) * 50),
      state: currentBalance < initial ? "warning" : "",
    },
  ];
  els.objectiveCards.innerHTML = cards.map((card) => `
    <article class="objective-card ${card.state}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.detail}</small>
      <div class="objective-progress"><span style="width:${card.progress}%"></span></div>
    </article>`).join("");

  const latest = days.at(-1);
  const dailyUsed = latest?.dailyLossUsed || 0;
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  const riskUsedPercent = clampPercent((dailyUsed / Math.max(dailyLimit, 1)) * 100);
  const riskState = riskUsedPercent >= 100 ? "BREACH" : riskUsedPercent >= 75 ? "WARNING" : "SAFE";
  els.riskMonitorDate.textContent = latest ? `${latest.date} · 依已平倉交易計算` : "目前沒有交易資料";
  els.riskMonitorLabel.textContent = riskState;
  els.riskMonitorLabel.className = riskState === "BREACH" ? "profit-neg" : riskState === "WARNING" ? "" : "profit-pos";
  els.dailyRiskGauge.style.setProperty("--risk-used", `${riskUsedPercent}%`);
  els.riskMonitorStats.innerHTML = `
    <div><span>今日已用</span><strong>${money(dailyUsed)}</strong></div>
    <div><span>今日剩餘</span><strong>${money(dailyRemaining)}</strong></div>
    <div><span>每日限制</span><strong>${money(dailyLimit)}</strong></div>`;

  els.bestDayStatus.textContent = bestDayPassed ? "PASS" : "NEED MORE PROFIT";
  els.bestDayStatus.className = `rule-status ${bestDayPassed ? "pass" : "warning"}`;
  els.bestDayRule.innerHTML = `
    <div><span>最佳獲利日</span><strong>${bestDay ? `${bestDay.date} · ${money(bestDay.profit)}` : "—"}</strong></div>
    <div><span>正收益日總和</span><strong>${money(positiveProfit)}</strong></div>
    <div><span>最佳日占比</span><strong>${bestDayPercent.toFixed(1)}%</strong></div>
    <div class="best-day-track ${bestDayPassed ? "" : "warning"}"><span style="width:${clampPercent(bestDayPercent)}%"></span></div>
    <span>${bestDayPassed ? "符合 50% 以內的一致性門檻。" : `還需要約 ${money(extraNeeded)} 的其他正收益，才能降回 50%。`}</span>`;

  const disciplineLabel = discipline >= 80 ? "穩定" : discipline >= 60 ? "普通" : "收益過度集中";
  els.ftmoDiscipline.innerHTML = `
    <div class="discipline-ring" style="--score:${discipline}%"><strong>${discipline.toFixed(0)}</strong></div>
    <div class="discipline-copy"><strong>${disciplineLabel}</strong><span>最大單日絕對損益占所有交易日絕對損益的 ${(100 - discipline).toFixed(1)}%。80 分以上代表結果分布較均衡。</span></div>`;

  els.dailySummaryRows.innerHTML = days.length ? days.slice().reverse().map((day) => `
    <tr>
      <td data-label="日期">${day.date}</td>
      <td data-label="交易數">${day.count}</td>
      <td data-label="手數">${day.lots.toFixed(2)}</td>
      <td data-label="損益" class="${day.profit >= 0 ? "profit-pos" : "profit-neg"}">${money(day.profit)}</td>
      <td data-label="R">${signed(day.totalR, "R")}</td>
      <td data-label="日內回撤">${money(day.lowestIntraday)}</td>
      <td data-label="狀態"><span class="day-status ${day.status === "safe" ? "" : day.status}">${day.status.toUpperCase()}</span></td>
    </tr>`).join("") : `<tr><td colspan="7">目前沒有每日資料。</td></tr>`;
}

function summarizeBy(items, keyFunction) {
  const groups = new Map();
  for (const trade of items) {
    const key = keyFunction(trade);
    if (!key) continue;
    const bucket = groups.get(key) || [];
    bucket.push(trade);
    groups.set(key, bucket);
  }
  return Array.from(groups, ([label, group]) => ({ label, items: group, stats: computeStats(group) }));
}

function renderBreakdown(target, groups) {
  const sorted = groups.sort((a, b) => b.stats.totalR - a.stats.totalR);
  const maxAbs = Math.max(1, ...sorted.map((group) => Math.abs(group.stats.totalR)));
  target.innerHTML = sorted.length ? sorted.map((group) => `
    <div class="breakdown-row">
      <span>${group.label}</span>
      <div class="breakdown-track"><span class="${group.stats.totalR < 0 ? "negative" : ""}" style="width:${Math.max(5, (Math.abs(group.stats.totalR) / maxAbs) * 100)}%"></span></div>
      <strong class="${group.stats.totalR >= 0 ? "profit-pos" : "profit-neg"}">${signed(group.stats.totalR, "R")} · ${group.items.length} 筆</strong>
    </div>`).join("") : `<div class="empty-state">目前沒有足夠資料。</div>`;
}

function renderBehaviorAnalysis(items) {
  const directions = summarizeBy(items, (trade) => {
    const value = String(trade.direction || "").toLowerCase();
    if (value.includes("long") || value.includes("buy") || value.includes("多")) return "Long";
    if (value.includes("short") || value.includes("sell") || value.includes("空")) return "Short";
    return "未標記";
  });
  const hours = summarizeBy(items, (trade) => {
    const hour = Number(String(trade.time || "").slice(0, 2));
    if (!Number.isFinite(hour)) return "未標記";
    if (hour < 8) return "00–08";
    if (hour < 16) return "08–16";
    if (hour < 20) return "16–20";
    return "20–24";
  });
  const weekNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const weekdays = summarizeBy(items, (trade) => {
    const date = parseTradeDate(trade);
    return date ? weekNames[date.getDay()] : "未標記";
  });
  renderBreakdown(els.directionAnalysis, directions);
  renderBreakdown(els.hourAnalysis, hours);
  renderBreakdown(els.weekdayAnalysis, weekdays);
}

function estimateRisk(trade) {
  if (Number.isFinite(trade.lots) && Number.isFinite(trade.slPips) && trade.lots && trade.slPips) {
    return Math.abs(trade.lots * trade.slPips);
  }
  if (trade.r) return Math.abs(trade.profit / trade.r);
  return Math.abs(trade.profit);
}

function summarizePairs(items) {
  const grouped = new Map();
  for (const trade of items) {
    const item = grouped.get(trade.pair) || { pair: trade.pair, count: 0, wins: 0, r: 0 };
    item.count += 1;
    item.wins += trade.profit > 0 ? 1 : 0;
    item.r += trade.r;
    grouped.set(trade.pair, item);
  }
  return Array.from(grouped.values()).sort((a, b) => b.r - a.r);
}

function renderMetrics(items) {
  const stats = computeStats(items);
  const comparisons = metricComparisons();
  animateMetric(els.totalProfit, stats.totalProfit, money);
  els.avgProfit.textContent = `Avg ${money(items.length ? stats.totalProfit / items.length : 0)} / trade`;
  animateMetric(els.totalR, stats.totalR, (value) => signed(value, "R"));
  els.avgR.textContent = `Avg ${signed(items.length ? stats.totalR / items.length : 0, "R")} / trade`;
  animateMetric(els.winRate, stats.winRate, (value) => `${value.toFixed(1)}%`);
  els.tradeCount.textContent = `${items.length} trades`;
  animateMetric(els.maxDd, stats.maxDd, (value) => signed(value, "R"));
  els.lossStreak.textContent = `${stats.worstLoss} max loss streak`;
  if (Number.isFinite(stats.profitFactor)) animateMetric(els.profitFactor, stats.profitFactor, (value) => value.toFixed(2));
  else els.profitFactor.textContent = "∞";
  animateMetric(els.expectancy, stats.expectancy, (value) => signed(value, "R"));
  animateMetric(els.averageWin, stats.averageWin, (value) => signed(value, "R"));
  animateMetric(els.averageLoss, stats.averageLoss, (value) => signed(value, "R"));
  els.bestPair.textContent = stats.bestPair ? `${stats.bestPair.pair} ${signed(stats.bestPair.r, "R")}` : "-";
  els.worstPair.textContent = stats.worstPair ? `${stats.worstPair.pair} ${signed(stats.worstPair.r, "R")}` : "-";
  els.chartBadge.textContent = `${items.length} trades`;

  const trend = (element, valueKey, formatter, inverse = false) => {
    element.className = "trend-comparisons";
    element.innerHTML = comparisons.map((comparison) => {
      if (!comparison.current.length) {
        return `<span class="trend">${comparison.label === "較上週" ? "本週" : "本月"}無資料</span>`;
      }
      if (!comparison.previous.length) {
        return `<span class="trend">${comparison.label.replace("較", "")}無資料</span>`;
      }
      const current = computeStats(comparison.current)[valueKey];
      const before = computeStats(comparison.previous)[valueKey];
      const delta = (valueKey === "maxDd" ? Math.abs(current) : current) - (valueKey === "maxDd" ? Math.abs(before) : before);
      const positive = inverse ? delta <= 0 : delta >= 0;
      const state = delta === 0 ? "" : positive ? "up" : "down";
      return `<span class="trend ${state}">${delta > 0 ? "↑" : delta < 0 ? "↓" : "—"} ${formatter(Math.abs(delta))} ${comparison.label}</span>`;
    }).join("");
  };

  trend(els.profitTrend, "totalProfit", (value) => money(value));
  trend(els.rTrend, "totalR", (value) => `${value.toFixed(1)}R`);
  trend(els.winTrend, "winRate", (value) => `${value.toFixed(1)}%`);
  trend(els.ddTrend, "maxDd", (value) => `${value.toFixed(1)}R`, true);
}

function renderChart(items) {
  const canvas = els.chart;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(640, rect.width * dpr);
  canvas.height = 320 * dpr;
  ctx.scale(dpr, dpr);

  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const pad = 34;
  ctx.clearRect(0, 0, width, height);

  let sum = 0;
  const points = items.map((trade, index) => {
    sum += trade.r;
    return { x: index, y: sum };
  });

  const animationKey = `${items.length}:${items[0]?.id || 0}:${items.at(-1)?.id || 0}:${sum.toFixed(2)}`;
  if (motionAllowed && animationKey !== lastChartAnimationKey) {
    canvas.classList.remove("chart-enter");
    void canvas.offsetWidth;
    canvas.classList.add("chart-enter");
    lastChartAnimationKey = animationKey;
  }

  if (!points.length) {
    equityChartState = null;
    return;
  }

  const minY = Math.min(0, ...points.map((point) => point.y));
  const maxY = Math.max(0, ...points.map((point) => point.y));
  const range = maxY - minY || 1;

  const px = (index) => pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
  const py = (value) => height - pad - ((value - minY) / range) * (height - pad * 2);
  equityChartState = { points, items, px, py, width, height, pad };

  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--line");
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  if (minY < 0 && maxY > 0) {
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--muted");
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pad, py(0));
    ctx.lineTo(width - pad, py(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const gradient = ctx.createLinearGradient(0, pad, 0, height - pad);
  gradient.addColorStop(0, "rgba(15, 159, 140, 0.22)");
  gradient.addColorStop(1, "rgba(15, 159, 140, 0.01)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = px(index);
    const y = py(point.y);
    if (index === 0) ctx.moveTo(x, height - pad);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(px(points.length - 1), height - pad);
  ctx.closePath();
  ctx.fill();

  const accent = getComputedStyle(document.body).getPropertyValue("--accent");
  const accent2 = getComputedStyle(document.body).getPropertyValue("--accent-2");
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = px(index);
    const y = py(point.y);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = accent;
  ctx.stroke();

  const last = points.at(-1);
  ctx.strokeStyle = accent2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px(last.x), py(last.y), 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = accent2;
  ctx.beginPath();
  ctx.arc(px(last.x), py(last.y), 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawLineChart(canvas, series, options = {}) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(640, rect.width * dpr);
  canvas.height = (options.height || 320) * dpr;
  ctx.scale(dpr, dpr);

  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const pad = 38;
  ctx.clearRect(0, 0, width, height);

  const allValues = series.flatMap((line) => line.values);
  if (!allValues.length) return;

  const minY = Math.min(0, ...allValues);
  const maxY = Math.max(0, ...allValues);
  const range = maxY - minY || 1;
  const length = Math.max(...series.map((line) => line.values.length), 1);
  const px = (index) => pad + (index / Math.max(length - 1, 1)) * (width - pad * 2);
  const py = (value) => height - pad - ((value - minY) / range) * (height - pad * 2);

  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--line");
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  for (const line of series) {
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.width || 2;
    ctx.setLineDash(line.dash || []);
    ctx.beginPath();
    line.values.forEach((value, index) => {
      const x = px(index);
      const y = py(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function renderProfitAnalytics(items) {
  const accountBase = Number(els.account.value) || 200000;
  let cumulativeProfit = 0;
  let cumulativeRisk = 0;
  const profitSeries = [];
  const roiSeries = [];

  for (const trade of items) {
    cumulativeProfit += trade.profit;
    cumulativeRisk += estimateRisk(trade);
    profitSeries.push(cumulativeProfit);
    roiSeries.push(accountBase ? (cumulativeProfit / accountBase) * 100 : 0);
  }

  const color = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  drawLineChart(els.profitChart, [{ values: profitChartMode === "profit" ? profitSeries : roiSeries, color, width: 3 }]);

  const stats = computeStats(items);
  const roi = accountBase ? (stats.totalProfit / accountBase) * 100 : 0;
  const totalRisk = items.reduce((sum, trade) => sum + estimateRisk(trade), 0);
  const netR = stats.totalR;

  const metrics = [
    ["總回報率 ROI", `${roi.toFixed(1)}%`, roi >= 0 ? "profit-pos" : "profit-neg"],
    ["命中率 Hit Rate", `${stats.winRate.toFixed(1)}%`],
    ["平均 R", signed(stats.expectancy, "R"), stats.expectancy >= 0 ? "profit-pos" : "profit-neg"],
    ["總風險額", money(totalRisk)],
    ["總獲利", money(stats.totalProfit), stats.totalProfit >= 0 ? "profit-pos" : "profit-neg"],
    ["淨 R", signed(netR, "R"), netR >= 0 ? "profit-pos" : "profit-neg"],
    ["最長連勝", `${stats.bestWin}`],
    ["最長連敗", `${stats.worstLoss}`, stats.worstLoss >= 4 ? "profit-neg" : ""],
  ];

  els.analyticsMetrics.innerHTML = metrics
    .map(([label, value, className = ""]) => `
      <div class="analytics-metric">
        <span>${label}</span>
        <strong class="${className}">${value}</strong>
      </div>`)
    .join("");
}

function renderEdgeAnalytics(items) {
  const rValues = items.map((trade) => trade.r).filter((value) => Number.isFinite(value));
  if (!rValues.length) {
    els.edgeSummary.innerHTML = "<strong>樣本太少</strong><span>目前沒有可分析的 R 值資料。</span>";
    drawLineChart(els.edgeChart, []);
    return;
  }

  let actual = 0;
  const actualSeries = [];
  for (const value of rValues) {
    actual += value;
    actualSeries.push(actual);
  }

  const mean = rValues.reduce((sum, value) => sum + value, 0) / rValues.length;
  const variance = rValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rValues.length;
  const sigma = Math.sqrt(variance);
  const expected = rValues.map((_, index) => mean * (index + 1));
  const upper = rValues.map((_, index) => mean * (index + 1) + 2 * sigma * Math.sqrt(index + 1));
  const lower = rValues.map((_, index) => mean * (index + 1) - 2 * sigma * Math.sqrt(index + 1));
  const finalActual = actualSeries.at(-1);
  const finalUpper = upper.at(-1);
  const finalLower = lower.at(-1);
  const distance = sigma ? (finalActual - expected.at(-1)) / (sigma * Math.sqrt(rValues.length)) : 0;

  let title = "落在正常波動內";
  let body = "目前實際曲線仍在 ±2σ 運氣帶內，先累積樣本並檢查是否有重複錯誤。";
  if (rValues.length < 30) {
    title = "樣本仍偏少";
    body = "少於 30 筆時判讀很容易失真，先把紀律欄位與 Lesson 記完整。";
  } else if (finalActual > finalUpper) {
    title = "結果明顯偏高";
    body = "績效高於目前模型的正常波動區，保守看待，不要把短期好運當成策略升級。";
  } else if (finalActual < finalLower) {
    title = "結果明顯偏低";
    body = "績效低於目前模型的正常波動區，優先檢查執行、風控與是否破壞交易規則。";
  }

  els.edgeSummary.innerHTML = `
    <strong>${title}</strong>
    <span>${body}</span>
    <div>
      <b>實際 ${signed(finalActual, "R")}</b>
      <b>期望 ${signed(expected.at(-1), "R")}</b>
      <b>離均線 ${distance.toFixed(2)}σ</b>
    </div>
  `;

  const styles = getComputedStyle(document.body);
  drawLineChart(
    els.edgeChart,
    [
      { values: upper, color: styles.getPropertyValue("--line").trim(), width: 1, dash: [7, 7] },
      { values: lower, color: styles.getPropertyValue("--line").trim(), width: 1, dash: [7, 7] },
      { values: expected, color: styles.getPropertyValue("--muted").trim(), width: 2, dash: [4, 6] },
      { values: actualSeries, color: styles.getPropertyValue("--accent").trim(), width: 3 },
    ],
    { height: 360 },
  );
}

function renderAnalytics(items) {
  renderProfitAnalytics(items);
  renderEdgeAnalytics(items);
}

function renderPairBars(items) {
  const grouped = summarizePairs(items).sort((a, b) => b.count - a.count);
  if (!grouped.length) {
    els.pairBars.innerHTML = `<div class="empty-state">目前篩選沒有商品資料。</div>`;
    return;
  }
  const max = Math.max(...grouped.map((item) => item.count), 1);

  els.pairBars.innerHTML = grouped
    .map((item) => {
      const width = (item.count / max) * 100;
      const rate = item.count ? (item.wins / item.count) * 100 : 0;
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${item.pair}</strong>
            <span>${item.count} trades · ${rate.toFixed(0)}% WR · ${signed(item.r, "R")}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        </div>`;
    })
    .join("");
}

function compactStats(items) {
  const stats = computeStats(items);
  return [
    ["Trades", String(items.length)],
    ["P/L", money(stats.totalProfit), stats.totalProfit >= 0 ? "profit-pos" : "profit-neg"],
    ["R", signed(stats.totalR, "R"), stats.totalR >= 0 ? "profit-pos" : "profit-neg"],
    ["Win Rate", `${stats.winRate.toFixed(1)}%`],
    ["Expectancy", signed(stats.expectancy, "R"), stats.expectancy >= 0 ? "profit-pos" : "profit-neg"],
    ["Max DD", signed(stats.maxDd, "R"), "profit-neg"],
  ];
}

function renderPeriodStats(target, items) {
  target.innerHTML = compactStats(items)
    .map(([label, value, className = ""]) => `
      <div class="period-stat">
        <span>${label}</span>
        <strong class="${className}">${value}</strong>
      </div>`)
    .join("");
}

function tradesForMonth(key) {
  return trades.filter((trade) => {
    const date = parseTradeDate(trade);
    return date && monthKey(date) === key;
  });
}

function getWeekRows(monthItems) {
  const grouped = new Map();
  for (const trade of monthItems) {
    const date = parseTradeDate(trade);
    if (!date) continue;
    const range = getWeekRange(date);
    const key = isoDate(range.start);
    const bucket = grouped.get(key) || { start: range.start, end: range.end, items: [] };
    bucket.items.push(trade);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.values()).sort((a, b) => a.start - b.start);
}

function renderWeeklyBreakdown(rows) {
  if (!rows.length) {
    els.weeklyBreakdown.innerHTML = `<div class="empty-state">這個月份沒有可拆解的週績效。</div>`;
    return;
  }

  els.weeklyBreakdown.innerHTML = rows
    .map((row) => {
      const stats = computeStats(row.items);
      const weekKey = isoDate(row.start);
      const active = weekKey === selectedPeriodWeekStart ? " active" : "";
      return `
        <div class="week-row${active}" role="button" tabindex="0" data-week="${weekKey}" aria-pressed="${weekKey === selectedPeriodWeekStart}">
          <div>
            <strong>${isoDate(row.start)} ~ ${isoDate(row.end)}</strong>
            <span>${row.items.length} trades · ${stats.winRate.toFixed(0)}% WR · ${money(stats.totalProfit)}</span>
          </div>
          <strong class="${stats.totalR >= 0 ? "profit-pos" : "profit-neg"}">${signed(stats.totalR, "R")}</strong>
        </div>`;
    })
    .join("");
}

function getMonthlyRows() {
  const grouped = new Map();
  for (const trade of trades) {
    const date = parseTradeDate(trade);
    if (!date) continue;
    const key = monthKey(date);
    const bucket = grouped.get(key) || [];
    bucket.push(trade);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const stats = computeStats(items);
      return { key, items, stats };
    });
}

function ensureSelectedPeriodMonth(rows) {
  if (!rows.length) {
    selectedPeriodMonth = monthKey(new Date());
  } else if (!rows.some((row) => row.key === selectedPeriodMonth)) {
    selectedPeriodMonth = rows[0].key;
  }
}

function ensureSelectedPeriodWeek(rows) {
  const currentWeek = getWeekRange(new Date());
  const currentWeekKey = isoDate(currentWeek.start);
  if (!rows.length) {
    selectedPeriodWeekStart = null;
  } else if (!rows.some((row) => isoDate(row.start) === selectedPeriodWeekStart)) {
    const defaultWeek = rows.find((row) => isoDate(row.start) === currentWeekKey) || rows.at(-1);
    selectedPeriodWeekStart = isoDate(defaultWeek.start);
  }
}

function renderMonthlyRows(rows) {
  const maxAbsR = Math.max(...rows.map((row) => Math.abs(row.stats.totalR)), 1);

  els.monthlyRows.innerHTML = rows
    .map((row) => {
      const width = Math.max(4, (Math.abs(row.stats.totalR) / maxAbsR) * 100);
      const fillClass = row.stats.totalR < 0 ? "loss-fill" : "";
      const active = row.key === selectedPeriodMonth ? " active" : "";
      return `
        <div class="month-row${active}" role="button" tabindex="0" data-month="${row.key}" aria-pressed="${row.key === selectedPeriodMonth}">
          <strong>${row.key}</strong>
          <div>
            <div class="month-track"><div class="month-fill ${fillClass}" style="width:${width}%"></div></div>
            <div class="month-meta">${row.items.length} trades · ${row.stats.winRate.toFixed(0)}% WR · ${money(row.stats.totalProfit)}</div>
          </div>
          <strong class="${row.stats.totalR >= 0 ? "profit-pos" : "profit-neg"}">${signed(row.stats.totalR, "R")}</strong>
        </div>`;
    })
    .join("");
}

function renderPeriodAnalysis() {
  const monthlyRows = getMonthlyRows();
  ensureSelectedPeriodMonth(monthlyRows);
  const monthItems = tradesForMonth(selectedPeriodMonth);
  const weekRows = getWeekRows(monthItems);
  ensureSelectedPeriodWeek(weekRows);
  const selectedWeek = weekRows.find((row) => isoDate(row.start) === selectedPeriodWeekStart);
  const weekItems = selectedWeek?.items || [];

  els.weekRange.textContent = selectedWeek ? `${isoDate(selectedWeek.start)} ~ ${isoDate(selectedWeek.end)}` : selectedPeriodMonth;
  els.monthRange.textContent = selectedPeriodMonth;
  renderPeriodStats(els.weekStats, weekItems);
  renderPeriodStats(els.monthStats, monthItems);
  renderWeeklyBreakdown(weekRows);
  renderMonthlyRows(monthlyRows);
}

function renderCalendarHeatmap(items) {
  const grouped = groupTradesByDate(items);
  const dates = Array.from(grouped.keys()).sort();
  if (!dates.length) {
    els.calendarSummary.textContent = "目前篩選沒有日期資料。";
    els.calendarHeatmap.innerHTML = "";
    return;
  }

  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates.at(-1)}T00:00:00`);
  const startDay = start.getDay() || 7;
  start.setDate(start.getDate() - startDay + 1);

  const dayStats = dates.map((date) => {
    const dayTrades = grouped.get(date);
    const stats = computeStats(dayTrades);
    return { date, trades: dayTrades, stats };
  });
  const bestDay = dayStats.reduce((best, day) => (day.stats.totalR > best.stats.totalR ? day : best), dayStats[0]);
  const worstDay = dayStats.reduce((worst, day) => (day.stats.totalR < worst.stats.totalR ? day : worst), dayStats[0]);
  els.calendarSummary.textContent = `${dates[0]} ~ ${dates.at(-1)} · ${dayStats.length} trading days · best ${bestDay.date} ${signed(bestDay.stats.totalR, "R")} · worst ${worstDay.date} ${signed(worstDay.stats.totalR, "R")}`;

  const cells = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = isoDate(cursor);
    const dayTrades = grouped.get(date) || [];
    const totalR = dayTrades.reduce((sum, trade) => sum + trade.r, 0);
    const abs = Math.abs(totalR);
    let level = "empty";
    if (dayTrades.length) {
      level = `${totalR >= 0 ? "win" : "loss"}-${abs >= 3 ? 4 : abs >= 2 ? 3 : abs >= 1 ? 2 : 1}`;
    }
    cells.push(`
      <button class="heat-cell ${level}" type="button" data-date="${date}" title="${date} · ${dayTrades.length} trades · ${signed(totalR, "R")}">
        <span>${date}</span>
      </button>`);
  }

  els.calendarHeatmap.innerHTML = `<div class="heatmap-grid">${cells.join("")}</div>`;
}

function renderMistakeAnalysis(items) {
  const buckets = new Map();
  for (const trade of items) {
    const text = tradeText(trade).trim();
    if (!text) continue;
    for (const category of classifyMistakes(trade)) {
      const bucket = buckets.get(category.key) || { label: category.label, count: 0, r: 0, profit: 0 };
      bucket.count += 1;
      bucket.r += trade.r;
      bucket.profit += trade.profit;
      buckets.set(category.key, bucket);
    }
  }

  const rows = Array.from(buckets.values()).sort((a, b) => a.r - b.r);
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  els.mistakeRows.innerHTML = rows.length
    ? rows
        .map((row) => `
          <div class="mistake-row">
            <div>
              <strong>${row.label}</strong>
              <span>${row.count} notes · ${money(row.profit)}</span>
              <div class="mistake-track"><div style="width:${Math.max(8, (row.count / maxCount) * 100)}%"></div></div>
            </div>
            <strong class="${row.r >= 0 ? "profit-pos" : "profit-neg"}">${signed(row.r, "R")}</strong>
          </div>`)
        .join("")
    : `<div class="empty-state">目前篩選沒有 Lesson 可分析。</div>`;
}

function renderDiscipline(items) {
  const ruleBreaks = items.filter(isRuleBreak);
  const cleanTrades = items.filter((trade) => !isRuleBreak(trade));
  const score = items.length ? Math.max(0, Math.round((cleanTrades.length / items.length) * 100)) : 0;
  const ruleStats = computeStats(ruleBreaks);
  const cleanStats = computeStats(cleanTrades);

  els.disciplineScore.innerHTML = `
    <strong>${score}</strong>
    <span>Discipline Score</span>
  `;
  els.disciplineBreakdown.innerHTML = `
    <div><span>Clean trades</span><strong>${cleanTrades.length}</strong><small>${signed(cleanStats.totalR, "R")} · ${money(cleanStats.totalProfit)}</small></div>
    <div><span>Rule breaks</span><strong>${ruleBreaks.length}</strong><small>${signed(ruleStats.totalR, "R")} · ${money(ruleStats.totalProfit)}</small></div>
    <div><span>Rule-break impact</span><strong class="${ruleStats.totalR >= 0 ? "profit-pos" : "profit-neg"}">${signed(ruleStats.totalR, "R")}</strong><small>從 checklist X 與 lesson 關鍵字推估</small></div>
  `;
}

function renderWeeklyReport(items) {
  const { start, end } = getWeekRange();
  const weekItems = sortByDate(items.filter((trade) => inRange(trade, start, end)));
  const stats = computeStats(weekItems);
  const bestTrade = weekItems.reduce((best, trade) => (!best || trade.r > best.r ? trade : best), null);
  const worstTrade = weekItems.reduce((worst, trade) => (!worst || trade.r < worst.r ? trade : worst), null);
  const ruleBreakCount = weekItems.filter(isRuleBreak).length;
  const mistakeBuckets = new Map();

  for (const trade of weekItems) {
    for (const category of classifyMistakes(trade)) {
      const current = mistakeBuckets.get(category.label) || { count: 0, r: 0 };
      current.count += 1;
      current.r += trade.r;
      mistakeBuckets.set(category.label, current);
    }
  }

  const topMistake = Array.from(mistakeBuckets.entries()).sort((a, b) => a[1].r - b[1].r)[0];
  const focus = topMistake
    ? `下週只專注：${topMistake[0]}，先把這個錯誤減少一半。`
    : stats.totalR < 0
      ? "下週只專注：減少交易數，先確保每筆都有完整理由。"
      : "下週只專注：維持流程，不因短期結果放大手數。";

  els.weeklyReport.innerHTML = `
    <div class="report-kpis">
      <div><span>Week</span><strong>${isoDate(start)} ~ ${isoDate(end)}</strong></div>
      <div><span>Trades</span><strong>${weekItems.length}</strong></div>
      <div><span>Total R</span><strong class="${stats.totalR >= 0 ? "profit-pos" : "profit-neg"}">${signed(stats.totalR, "R")}</strong></div>
      <div><span>Win Rate</span><strong>${stats.winRate.toFixed(1)}%</strong></div>
      <div><span>Rule Breaks</span><strong class="${ruleBreakCount ? "profit-neg" : ""}">${ruleBreakCount}</strong></div>
    </div>
    <div class="report-trades">
      <div><span>Best trade</span><strong>${bestTrade ? `${bestTrade.date} · ${bestTrade.pair} · ${signed(bestTrade.r, "R")}` : "-"}</strong></div>
      <div><span>Worst trade</span><strong>${worstTrade ? `${worstTrade.date} · ${worstTrade.pair} · ${signed(worstTrade.r, "R")}` : "-"}</strong></div>
      <div><span>Main issue</span><strong>${topMistake ? `${topMistake[0]} · ${signed(topMistake[1].r, "R")}` : "-"}</strong></div>
    </div>
  `;
  els.actionItems.innerHTML = `
    <strong>Next Focus</strong>
    <span>${focus}</span>
  `;
}

function renderReview(items) {
  renderCalendarHeatmap(items);
  renderMistakeAnalysis(items);
  renderDiscipline(items);
  renderWeeklyReport(items);
}

function tradeReviewText(trade) {
  return trade.review || trade.lesson || "尚未填寫賽後檢討。";
}

function renderRows(items) {
  const labels = ["編號", "商品", "結果", "損益", "R 倍數", "手數", "止損點數", "Entry", "SL", "TP", "策略", "來源"];
  const outcomeLabels = { win: "獲利", loss: "虧損", be: "損益兩平" };
  if (els.toggleReviews) {
    els.toggleReviews.textContent = reviewsExpanded ? "收合 Review" : "展開 Review";
    els.toggleReviews.setAttribute("aria-pressed", String(reviewsExpanded));
  }
  els.rows.innerHTML = sortByDate(items)
    .reverse()
    .slice(0, 100)
    .map((trade) => {
      const profitClass = trade.profit >= 0 ? "profit-pos" : "profit-neg";
      const mainRow = `
        <tr data-id="${trade.id}" tabindex="0">
          <td data-label="${labels[0]}">${trade.id}</td>
          <td data-label="${labels[1]}"><strong>${trade.pair}</strong></td>
          <td data-label="${labels[2]}"><span class="pill ${trade.outcome}">${outcomeLabels[trade.outcome] || trade.outcome.toUpperCase()}</span></td>
          <td data-label="${labels[3]}" class="${profitClass}">${money(trade.profit)}</td>
          <td data-label="${labels[4]}">${signed(trade.r, "R")}</td>
          <td data-label="${labels[5]}">${trade.lots ?? "-"}</td>
          <td data-label="${labels[6]}">${trade.slPips ?? "-"}</td>
          <td data-label="${labels[7]}">${trade.entry ?? "-"}</td>
          <td data-label="${labels[8]}">${trade.stopLoss ?? "-"}</td>
          <td data-label="${labels[9]}">${trade.takeProfit ?? "-"}</td>
          <td data-label="${labels[10]}">${trade.setup || trade.checklist || "-"}</td>
          <td data-label="${labels[11]}">${trade.date || "-"} · ${trade.origin === "local" ? "手動新增" : `第 ${trade.row} 列`}</td>
        </tr>`;
      if (!reviewsExpanded) return mainRow;
      return `${mainRow}
        <tr class="review-row">
          <td colspan="12">
            <span>Review</span>
            <p>${tradeReviewText(trade)}</p>
          </td>
        </tr>`;
    })
    .join("");
}

function renderChecklist() {
  els.checklist.innerHTML = checklist
    .map((item, index) => `
      <button class="check-item" type="button" data-index="${index}" aria-pressed="${item.required ? "false" : "true"}">
        <span>
          <strong>${item.label}</strong>
          <small>${item.required ? "Required" : "Optional"}</small>
        </span>
        <span class="toggle" aria-hidden="true"></span>
      </button>`)
    .join("");
  updateChecklistGate();
}

function updateChecklistGate() {
  const buttons = Array.from(els.checklist.querySelectorAll(".check-item"));
  const passed = buttons.filter((button) => button.getAttribute("aria-pressed") === "true").length;
  const requiredPassed = checklist.every((item, index) => !item.required || buttons[index]?.getAttribute("aria-pressed") === "true");
  els.checklistScore.textContent = `${passed}/${checklist.length}`;
  const wasReady = els.tradeGate.classList.contains("ready");
  els.tradeGate.textContent = requiredPassed ? "READY TO TRADE" : "NO TRADE";
  els.tradeGate.classList.toggle("ready", requiredPassed);
  if (requiredPassed && !wasReady) emitCelebration(els.tradeGate);
}

function emitCelebration(source) {
  if (!motionAllowed) return;
  const rect = source.getBoundingClientRect();
  const colors = ["#0f9f8c", "#f2a63b", "#65d6c5", "#ffffff"];
  for (let index = 0; index < 24; index += 1) {
    const particle = document.createElement("span");
    const angle = (Math.PI * 2 * index) / 24;
    const distance = 55 + Math.random() * 75;
    particle.className = "celebration-particle";
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--ty", `${Math.sin(angle) * distance - 30}px`);
    particle.style.setProperty("--rotation", `${Math.random() * 540 - 270}deg`);
    particle.style.setProperty("--particle-color", colors[index % colors.length]);
    document.body.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function renderCalc() {
  const account = Number(els.account.value) || 0;
  const risk = Number(els.risk.value) || 0;
  const sl = Number(els.sl.value) || 1;
  const pip = Number(els.pip.value) || 1;
  const riskDollars = account * (risk / 100);
  const lots = riskDollars / (sl * pip);
  els.calc.textContent = `${lots.toFixed(2)} lots · risk ${money(riskDollars)}`;
}

function runReturnSimulation() {
  const startingBalance = Math.max(1, Number(els.simBalance.value) || 100000);
  const riskPercent = Math.max(0.01, Math.min(100, Number(els.simRisk.value) || 1));
  const rewardRatio = Math.max(0.01, Number(els.simReward.value) || 1.5);
  const winRate = Math.max(0, Math.min(100, Number(els.simWinRate.value) || 50));
  const tradeCount = Math.max(10, Math.min(1000, Math.round(Number(els.simTrades.value) || 100)));
  let balance = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  let wins = 0;
  let currentLossStreak = 0;
  let maxLossStreak = 0;
  const returns = [0];

  for (let index = 0; index < tradeCount; index += 1) {
    const riskAmount = balance * (riskPercent / 100);
    const won = Math.random() * 100 < winRate;
    balance += won ? riskAmount * rewardRatio : -riskAmount;
    wins += won ? 1 : 0;
    currentLossStreak = won ? 0 : currentLossStreak + 1;
    maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
    peak = Math.max(peak, balance);
    const drawdown = peak ? ((balance - peak) / peak) * 100 : 0;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    returns.push(((balance - startingBalance) / startingBalance) * 100);
  }

  simulationResult = {
    startingBalance,
    finalBalance: balance,
    returnPercent: ((balance - startingBalance) / startingBalance) * 100,
    maxDrawdown,
    maxLossStreak,
    wins,
    losses: tradeCount - wins,
    tradeCount,
    riskPercent,
    rewardRatio,
    winRate,
    expectancy: (winRate / 100) * rewardRatio - (1 - winRate / 100),
    returns,
  };
  renderReturnSimulation();
}

function renderReturnSimulation() {
  if (!simulationResult) return;
  const result = simulationResult;
  const metrics = [
    ["最終資金", money(result.finalBalance), result.finalBalance >= result.startingBalance ? "profit-pos" : "profit-neg"],
    ["模擬報酬率", `${result.returnPercent >= 0 ? "+" : ""}${result.returnPercent.toFixed(1)}%`, result.returnPercent >= 0 ? "profit-pos" : "profit-neg"],
    ["最大回撤", `${result.maxDrawdown.toFixed(1)}%`, "profit-neg"],
    ["最長連敗", `${result.maxLossStreak} 筆`, result.maxLossStreak >= 5 ? "profit-neg" : ""],
    ["模擬勝負", `${result.wins} 勝 / ${result.losses} 敗`],
    ["每筆期望值", `${result.expectancy >= 0 ? "+" : ""}${result.expectancy.toFixed(2)}R`, result.expectancy >= 0 ? "profit-pos" : "profit-neg"],
  ];
  els.simulationMetrics.innerHTML = metrics.map(([label, value, className = ""]) => `
    <div><span>${label}</span><strong class="${className}">${value}</strong></div>
  `).join("");
  els.simulationFormula.textContent = `${result.winRate.toFixed(1)}% 勝率 · ${result.riskPercent}% 風險 · 1:${result.rewardRatio}`;
  const color = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  drawLineChart(els.simulationChart, [{ values: result.returns, color, width: 3 }], { height: 300 });
}

function useJournalSimulationStats() {
  const items = filteredTrades();
  const stats = computeStats(items);
  const decided = items.filter((trade) => trade.profit !== 0);
  if (!decided.length) {
    showToast("目前篩選範圍沒有足夠的交易資料。", "error");
    return;
  }
  const averageRewardRisk = Math.abs(stats.averageLoss)
    ? Math.max(0.01, stats.averageWin / Math.abs(stats.averageLoss))
    : Math.max(0.01, stats.averageWin || 1);
  els.simBalance.value = String(Number(els.account.value) || accountRules.initialBalance || 100000);
  els.simReward.value = averageRewardRisk.toFixed(2);
  els.simWinRate.value = stats.winRate.toFixed(1);
  runReturnSimulation();
  showToast(`已帶入目前 ${items.length} 筆日誌的勝率與平均盈虧比。`);
}

function openTradeDetail(trade) {
  currentDetailId = trade.id;
  const profitClass = trade.profit >= 0 ? "profit-pos" : "profit-neg";
  els.detail.innerHTML = `
    <p class="eyebrow">${trade.origin === "local" ? "Local trade" : `${trade.source} · row ${trade.row}`}</p>
    <h2>${trade.pair} · ${trade.outcome.toUpperCase()}</h2>
    <div class="detail-stats">
      <div><span>P/L</span><strong class="${profitClass}">${money(trade.profit)}</strong></div>
      <div><span>R</span><strong>${signed(trade.r, "R")}</strong></div>
      <div><span>Lots</span><strong>${trade.lots ?? "-"}</strong></div>
      <div><span>SL pips</span><strong>${trade.slPips ?? "-"}</strong></div>
    </div>
    <dl class="detail-list">
      <dt>Date</dt><dd>${trade.date || "-"} ${trade.time || ""}</dd>
      <dt>Year</dt><dd>${trade.year || "-"}</dd>
      <dt>Direction</dt><dd>${trade.direction || "-"}</dd>
      <dt>Entry</dt><dd>${trade.entry ?? "-"}</dd>
      <dt>SL</dt><dd>${trade.stopLoss ?? "-"}</dd>
      <dt>TP</dt><dd>${trade.takeProfit ?? "-"}</dd>
      <dt>Exit</dt><dd>${trade.exitPrice ?? "-"}</dd>
      <dt>Setup</dt><dd>${trade.setup || trade.checklist || "-"}</dd>
      <dt>Review</dt><dd>${trade.review || trade.lesson || "尚未填寫賽後檢討。"}</dd>
    </dl>
    <div class="drawer-actions">
      <button type="button" class="primary-button" data-trade-action="edit">編輯交易</button>
      <button type="button" class="ghost-button danger-button" data-trade-action="delete">刪除交易</button>
    </div>
  `;
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeTradeDetail() {
  currentDetailId = null;
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
}

function createTradeFromForm(form) {
  const data = new FormData(form);
  const profit = Number(data.get("profit"));
  const r = Number(data.get("r"));
  const numericOrNull = (name) => data.get(name) === "" ? null : Number(data.get(name));
  const exitPrice = numericOrNull("exitPrice");
  return {
    localId: data.get("localId") || crypto.randomUUID(),
    year: Number(data.get("year")),
    date: data.get("date"),
    time: data.get("time"),
    pair: String(data.get("pair") || "").trim().toUpperCase(),
    direction: data.get("direction"),
    outcome: data.get("outcome"),
    profit,
    r,
    lots: data.get("lots") === "" ? null : Number(data.get("lots")),
    slPips: data.get("slPips") === "" ? null : Number(data.get("slPips")),
    entry: numericOrNull("entry"),
    stopLoss: numericOrNull("stopLoss"),
    takeProfit: profit > 0 ? exitPrice : null,
    exitPrice,
    setup: String(data.get("setup") || "").trim(),
    review: String(data.get("review") || "").trim(),
    source: "Manual Entry",
  };
}

function resetTradeForm() {
  els.tradeForm.reset();
  els.tradeForm.elements.localId.value = "";
  els.tradeForm.elements.baseKey.value = "";
  els.tradeForm.elements.year.value = new Date().getFullYear();
  els.tradeForm.elements.date.value = isoDate(new Date());
  els.tradeForm.elements.time.value = new Date().toTimeString().slice(0, 5);
  els.tradeForm.elements.pair.value = "NAS100";
  delete els.tradeForm.elements.r.dataset.autoCalculated;
  els.dialogTitle.textContent = "新增交易";
  els.dialogSubtitle.textContent = "記錄核心欄位，資料會保存在這個瀏覽器。";
  els.saveTrade.textContent = "儲存交易";
  updateTradeDerivedFields();
}

function updateTradeCommandStrip() {
  const form = els.tradeForm.elements;
  const profit = Number(form.profit.value);
  const r = Number(form.r.value);
  const outcome = form.outcome.value || "pending";
  const hasProfit = form.profit.value !== "" && Number.isFinite(profit);
  const state = hasProfit ? outcome : "pending";
  const labels = {
    win: "WIN SIGNAL",
    loss: "LOSS CONTROL",
    be: "BREAK EVEN",
    pending: "READY",
  };

  els.tradeOutcomePulse.textContent = labels[state] || labels.pending;
  els.tradeOutcomePulse.dataset.state = state;
  els.tradeForm.dataset.tradeState = state;
  els.tradeRiskPreview.textContent = Number.isFinite(r) && form.r.value !== ""
    ? `${signed(r, "R")} computed`
    : "R pending";
  els.tradeSessionClock.textContent = `${form.pair.value || "SYMBOL"} · ${form.time.value || "--:--"}`;
}

function updateTradeDerivedFields() {
  const form = els.tradeForm.elements;
  const date = form.date.value;
  const profitText = form.profit.value;
  const lotsText = form.lots.value;
  const slText = form.slPips.value;
  const hint = document.querySelector("#rFormulaHint");
  const slHint = document.querySelector("#slFormulaHint");
  const entryText = form.entry.value;
  const stopText = form.stopLoss.value;

  if (date) form.year.value = Number(date.slice(0, 4));
  if (profitText !== "") {
    const profit = Number(profitText);
    form.outcome.value = profit > 0 ? "win" : profit < 0 ? "loss" : "be";
  }

  const profit = Number(profitText);
  const lots = Number(lotsText);
  const entry = Number(entryText);
  const stopLoss = Number(stopText);

  if (entryText !== "" && stopText !== "" && Number.isFinite(entry) && Number.isFinite(stopLoss) && entry !== stopLoss) {
    const calculatedSlPips = Math.abs(entry - stopLoss);
    form.slPips.value = String(Number(calculatedSlPips.toFixed(6)));
    form.slPips.dataset.autoCalculated = "true";
    slHint.textContent = `ABS(${entry} − ${stopLoss}) = ${Number(calculatedSlPips.toFixed(6))} 點`;
    slHint.classList.add("calculated");
    form.slPips.classList.add("field-pulse");
  } else {
    if (form.slPips.dataset.autoCalculated === "true") form.slPips.value = "";
    delete form.slPips.dataset.autoCalculated;
    slHint.textContent = "填入 Entry 與 SL 可自動計算，也可以手動輸入。";
    slHint.classList.remove("calculated");
  }

  const activeSlText = form.slPips.value;
  const slPips = Number(activeSlText);
  if (profitText !== "" && lotsText !== "" && activeSlText !== "" && Number.isFinite(profit) && lots > 0 && slPips > 0) {
    const calculatedR = profit / (lots * slPips);
    form.r.value = String(Number(calculatedR.toFixed(4)));
    form.r.dataset.autoCalculated = "true";
    hint.textContent = `${money(profit)} ÷ (${lots} × ${slPips}) = ${signed(calculatedR, "R")}`;
    hint.classList.add("calculated");
    form.r.classList.add("field-pulse");
  } else {
    if (form.r.dataset.autoCalculated === "true") form.r.value = "";
    delete form.r.dataset.autoCalculated;
    hint.textContent = "填入損益、手數與止損點數可自動計算，也可以手動輸入 R。";
    hint.classList.remove("calculated");
  }

  window.setTimeout(() => {
    form.slPips.classList.remove("field-pulse");
    form.r.classList.remove("field-pulse");
  }, 520);
  updateTradeCommandStrip();
}

function editTrade(trade) {
  const editable = trade.origin === "local" ? { ...trade } : { ...trade, localId: crypto.randomUUID(), source: "Edited Import" };
  if (editable.exitPrice == null && Number(editable.profit) > 0) {
    const recordedExit = String(editable.takeProfit || "").split(/[、,;/]/)[0]?.trim();
    editable.exitPrice = recordedExit && Number.isFinite(Number(recordedExit)) ? Number(recordedExit) : "";
  }
  const fields = ["localId", "year", "date", "time", "pair", "direction", "outcome", "profit", "r", "lots", "entry", "stopLoss", "exitPrice", "slPips", "setup", "review"];
  for (const field of fields) {
    const input = els.tradeForm.elements[field];
    if (input) input.value = editable[field] ?? "";
  }
  delete els.tradeForm.elements.r.dataset.autoCalculated;
  delete els.tradeForm.elements.slPips.dataset.autoCalculated;
  els.tradeForm.elements.baseKey.value = trade.origin === "local" ? "" : trade.baseKey;
  els.dialogTitle.textContent = "編輯交易";
  els.dialogSubtitle.textContent = "修改後會保存在本機資料中，原始 Excel 不會被改動。";
  els.saveTrade.textContent = "更新交易";
  closeTradeDetail();
  els.tradeDialog.showModal();
}

function deleteTrade(trade) {
  const label = `${trade.date || ""} ${trade.pair} ${signed(trade.r, "R")}`.trim();
  if (!window.confirm(`確定刪除「${label}」？此操作可透過完整備份還原。`)) return;
  if (trade.origin === "local") {
    localTrades = localTrades.filter((item) => item.localId !== trade.localId);
  } else {
    deletedTrades.add(trade.baseKey);
  }
  saveLocalTrades();
  closeTradeDetail();
  refreshAfterDataChange();
  showToast("交易已刪除。");
}

function refreshAfterDataChange() {
  trades = mergeTrades();
  populateFilters(true);
  render();
}

function render() {
  const items = filteredTrades();
  const activeCount = [
    els.year.value !== "all",
    els.pair.value !== "all",
    els.outcome.value !== "all",
    els.window.value !== "all",
    Boolean(els.search.value.trim()),
  ].filter(Boolean).length;
  els.filterSummary.textContent = `顯示 ${items.length} / ${trades.length} 筆交易${activeCount ? ` · ${activeCount} 個條件` : ""}`;
  els.resetFilters.disabled = activeCount === 0;
  renderMetrics(items);
  renderPeriodAnalysis();
  renderChart(items);
  renderAnalytics(items);
  renderObjectives(items);
  renderBehaviorAnalysis(items);
  renderReview(items);
  renderPairBars(items);
  renderRows(items);
  els.tradeEmpty.hidden = items.length !== 0;
  document.querySelector(".table-wrap").hidden = items.length === 0;
}

function setPage(pageName) {
  const nextPage = pageTitles[pageName] ? pageName : "dashboard";
  els.pages.forEach((page) => page.classList.toggle("active", page.dataset.page === nextPage));
  els.navLinks.forEach((link) => link.classList.toggle("active", link.dataset.pageLink === nextPage));
  els.pageTitle.textContent = pageTitles[nextPage];
  if (window.location.hash !== `#${nextPage}`) {
    history.replaceState(null, "", `#${nextPage}`);
  }
  if (nextPage === "dashboard" || nextPage === "objectives" || nextPage === "analytics" || nextPage === "review") render();
  if (nextPage === "calculator") renderReturnSimulation();
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function exportFilteredCsv() {
  const items = filteredTrades();
  const headers = ["id", "date", "time", "year", "pair", "direction", "outcome", "profit", "r", "lots", "slPips", "entry", "stopLoss", "takeProfit", "exitPrice", "setup", "checklist", "source", "row", "lesson", "review"];
  const rows = [
    headers.join(","),
    ...items.map((trade) => headers.map((key) => csvEscape(trade[key])).join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tradingnote-${isoDate(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFullBackup() {
  const backup = {
    app: "TradingNote",
    version: 1,
    exportedAt: new Date().toISOString(),
    localTrades,
    deletedTrades: Array.from(deletedTrades),
    accountRules,
  };
  downloadFile(`tradingnote-backup-${isoDate(new Date())}.json`, JSON.stringify(backup, null, 2), "application/json");
  showToast(`已備份 ${localTrades.length} 筆本機交易與刪除紀錄。`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_./%-]+/g, "");
}

const importColumnAliases = {
  date: ["date", "日期", "交易日期"],
  pair: ["pair", "symbol", "商品", "交易商品", "品種"],
  profit: ["profit", "p/l", "pl", "交易結果", "損益", "獲利", "netprofit"],
  r: ["r", "r&r", "r multiple", "rmultiple", "rr", "r倍數", "風報比"],
};

function hasHeaderAlias(headers, aliases) {
  return aliases.some((alias) => headers.has(normalizeHeader(alias)));
}

function findTradeHeaderRow(rows) {
  return rows.findIndex((row) => {
    const headers = new Set(row.map(normalizeHeader).filter(Boolean));
    return (
      hasHeaderAlias(headers, importColumnAliases.date) &&
      hasHeaderAlias(headers, importColumnAliases.pair) &&
      hasHeaderAlias(headers, importColumnAliases.profit) &&
      hasHeaderAlias(headers, importColumnAliases.r)
    );
  });
}

function extractWorkbookRows(workbook) {
  return workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const previewRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    const headerRow = findTradeHeaderRow(previewRows);
    if (headerRow === -1) return [];
    return window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true, range: headerRow });
  });
}

function pickRowValue(row, aliases) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizeHeader(key) === normalizeHeader(alias));
    if (found && found[1] !== "") return found[1];
  }
  return "";
}

function normalizeDateValue(value) {
  if (!value) return "";
  if (typeof value === "number" && value > 20000) {
    const date = new Date(Date.UTC(1899, 11, 30 + value));
    return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim().replace(/[./]/g, "-");
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function normalizeTimeValue(value) {
  if (value === "" || value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const totalSeconds = Math.round(fraction * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }
  const text = String(value).trim();
  const match = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!match) return text.slice(0, 8);
  return [match[1], match[2], match[3] || "00"].map((part) => part.padStart(2, "0")).join(":");
}

function normalizeImportedRows(rows, sourceName) {
  return rows.map((row, index) => {
    const profit = Number(pickRowValue(row, ["profit", "p/l", "pl", "損益", "獲利", "netprofit"]));
    const r = Number(pickRowValue(row, ["r", "rmultiple", "rr", "r倍數", "風報比"]));
    const pair = String(pickRowValue(row, ["pair", "symbol", "商品", "交易商品", "品種"])).trim().toUpperCase();
    const date = normalizeDateValue(pickRowValue(row, ["date", "日期", "交易日期"]));
    let outcome = String(pickRowValue(row, ["outcome", "result", "結果", "勝負"])).trim().toLowerCase();
    if (!["win", "loss", "be"].includes(outcome)) outcome = profit > 0 ? "win" : profit < 0 ? "loss" : "be";
    if (!pair || !date || !Number.isFinite(profit) || !Number.isFinite(r)) return null;
    const numberOrNull = (aliases) => {
      const value = pickRowValue(row, aliases);
      return value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
    };
    const takeProfit = pickRowValue(row, ["takeProfit", "tp", "止盈", "出場價格", "實際出場價格"]);
    const exitPrice = numberOrNull(["exitPrice", "exit", "實際出場價格", "出場價格"]);
    return {
      localId: crypto.randomUUID(),
      year: Number(pickRowValue(row, ["year", "年度", "年份"])) || Number(date.slice(0, 4)),
      date,
      time: String(pickRowValue(row, ["time", "時間", "交易時間"])).slice(0, 8),
      pair,
      direction: pickRowValue(row, ["direction", "方向", "多空"]) || "",
      outcome,
      profit,
      r,
      lots: Number(pickRowValue(row, ["lots", "lot", "手數"])) || null,
      slPips: Number(pickRowValue(row, ["slpips", "止損點數", "sl點數"])) || null,
      entry: numberOrNull(["entry", "入場", "入場價格"]),
      stopLoss: numberOrNull(["stopLoss", "sl", "止損", "止損價格"]),
      takeProfit: takeProfit === "" ? null : String(takeProfit),
      exitPrice: exitPrice ?? (profit > 0 && Number.isFinite(Number(takeProfit)) ? Number(takeProfit) : null),
      setup: String(pickRowValue(row, ["setup", "strategy", "策略", "型態"])),
      review: String(pickRowValue(row, ["review", "lesson", "note", "檢討", "筆記", "心得"])),
      source: sourceName,
      row: index + 2,
    };
  }).filter(Boolean);
}

function normalizeImportedTradeRows(rows, sourceName) {
  return rows.map((row, index) => {
    const profit = Number(pickRowValue(row, importColumnAliases.profit));
    const r = Number(pickRowValue(row, importColumnAliases.r));
    const pair = String(pickRowValue(row, importColumnAliases.pair)).trim().toUpperCase();
    const date = normalizeDateValue(pickRowValue(row, importColumnAliases.date));
    let outcome = String(pickRowValue(row, ["outcome", "result", "結果", "勝負"])).trim().toLowerCase();
    if (!["win", "loss", "be"].includes(outcome)) outcome = profit > 0 ? "win" : profit < 0 ? "loss" : "be";
    if (!pair || !date || !Number.isFinite(profit) || !Number.isFinite(r)) return null;

    const numberOrNull = (aliases) => {
      const value = pickRowValue(row, aliases);
      return value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
    };
    const takeProfit = pickRowValue(row, ["takeProfit", "tp", "止盈", "出場價格", "實際出場價格"]);
    const exitPrice = numberOrNull(["exitPrice", "exit", "實際出場價格", "出場價格"]);

    return {
      localId: crypto.randomUUID(),
      year: Number(pickRowValue(row, ["year", "年度", "年份"])) || Number(date.slice(0, 4)),
      date,
      time: normalizeTimeValue(pickRowValue(row, ["time", "時間", "交易時間"])),
      pair,
      direction: pickRowValue(row, ["direction", "方向", "多空"]) || "",
      outcome,
      profit,
      r,
      lots: Number(pickRowValue(row, ["lots", "lot", "手數"])) || null,
      slPips: Number(pickRowValue(row, ["slpips", "SL pips", "止損點數", "sl點數"])) || null,
      entry: numberOrNull(["entry", "entryprice", "__EMPTY_3", "入場", "入場價格"]),
      stopLoss: numberOrNull(["stopLoss", "sl", "止損", "止損價格"]),
      takeProfit: takeProfit === "" ? null : String(takeProfit),
      exitPrice: exitPrice ?? (profit > 0 && Number.isFinite(Number(takeProfit)) ? Number(takeProfit) : null),
      setup: String(pickRowValue(row, ["setup", "strategy", "策略", "型態"])),
      review: String(pickRowValue(row, ["review", "lesson", "Lesson Learn", "note", "檢討", "筆記", "心得"])),
      source: sourceName,
      row: index + 2,
    };
  }).filter(Boolean);
}

function tradeFingerprint(trade) {
  return [
    trade.date,
    trade.time,
    trade.pair,
    trade.direction,
    Number(trade.profit).toFixed(4),
    Number(trade.r).toFixed(4),
    trade.entry ?? "",
    trade.exitPrice ?? "",
  ].join("::");
}

function uniqueTrades(items) {
  const seen = new Set();
  return items.filter((trade) => {
    const fingerprint = tradeFingerprint(trade);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

async function importDataFile(file, mode = "merge") {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "json") {
    const payload = JSON.parse(await file.text());
    const incoming = Array.isArray(payload) ? payload : payload.localTrades;
    if (!Array.isArray(incoming)) throw new Error("JSON 備份格式不正確。");
    const confirmed = window.confirm(`將匯入 ${incoming.length} 筆本機交易。要與現有資料合併嗎？\n選擇「取消」會用備份內容取代目前本機資料。`);
    localTrades = confirmed ? [...localTrades, ...incoming] : incoming;
    if (!confirmed && Array.isArray(payload.deletedTrades)) deletedTrades = new Set(payload.deletedTrades);
    if (!confirmed && payload.accountRules) {
      accountRules = { ...accountRules, ...payload.accountRules };
      saveAccountRules();
      populateAccountRulesForm();
    }
    saveLocalTrades();
    refreshAfterDataChange();
    showToast(`JSON 還原完成，共載入 ${incoming.length} 筆。`);
    return;
  }

  let rows;
  if (extension === "csv") {
    rows = parseCsv(await file.text());
  } else {
    if (!window.XLSX) throw new Error("Excel 解析元件尚未載入，請連線後重整頁面，或改用 CSV／JSON。");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    rows = extractWorkbookRows(workbook);
  }
  const imported = uniqueTrades(normalizeImportedTradeRows(rows, `Import: ${file.name}`));
  if (!imported.length) throw new Error("找不到有效交易。檔案至少需要日期、商品、損益與 R 欄位。");
  if (mode === "replace") {
    const confirmed = window.confirm(
      `即將以「${file.name}」的 ${imported.length} 筆交易，取代目前顯示的 ${trades.length} 筆資料。\n\n系統會先下載完整 JSON 備份，確定繼續嗎？`,
    );
    if (!confirmed) return;
    exportFullBackup();
    localTrades = imported;
    deletedTrades = new Set(importedTrades.map(baseTradeKey));
  } else {
    const existing = new Set(trades.map(tradeFingerprint));
    localTrades.push(...imported.filter((trade) => !existing.has(tradeFingerprint(trade))));
  }
  saveLocalTrades();
  refreshAfterDataChange();
  showToast(mode === "replace"
    ? `來源已取代為 ${file.name}，共 ${imported.length} 筆交易。`
    : "合併匯入完成，已自動略過重複交易。");
}

populateFilters();
populateAccountRulesForm();
renderChecklist();
renderCalc();
runReturnSimulation();
resetTradeForm();
attachRippleFeedback();
render();

[els.year, els.pair, els.outcome, els.window, els.search].forEach((el) => el.addEventListener("input", render));
[els.account, els.risk, els.sl, els.pip].forEach((el) => el.addEventListener("input", renderCalc));
els.returnSimulatorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runReturnSimulation();
});
els.useJournalStats.addEventListener("click", useJournalSimulationStats);
window.addEventListener("resize", () => {
  render();
  renderReturnSimulation();
});

els.theme.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  render();
  renderReturnSimulation();
});

els.accountRulesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  accountRules = {
    name: els.accountNameInput.value.trim() || "Challenge Account",
    phase: els.accountPhaseInput.value,
    initialBalance: Math.max(1, Number(els.initialBalanceInput.value) || 100000),
    profitTargetPercent: Math.max(0, Number(els.profitTargetInput.value) || 0),
    dailyLossPercent: Math.max(0.1, Number(els.dailyLossInput.value) || 5),
    maxLossPercent: Math.max(0.1, Number(els.maxLossInput.value) || 10),
    minimumDays: Math.max(0, Number(els.minimumDaysInput.value) || 0),
    lossMode: els.lossModeInput.value,
  };
  saveAccountRules();
  render();
  showToast(`${accountRules.name} 的帳戶規則已更新。`);
});

els.newTrade.addEventListener("click", () => {
  resetTradeForm();
  els.tradeDialog.showModal();
});
els.closeTradeDialog.addEventListener("click", () => els.tradeDialog.close());
els.tradeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateTradeDerivedFields();
  if (els.tradeForm.elements.r.value === "") {
    showToast("請先填入損益、手數與止損點數，才能計算 R 倍數。", "error");
    return;
  }
  const trade = createTradeFromForm(els.tradeForm);
  if (trade.profit > 0 && trade.exitPrice == null) {
    showToast("獲利交易請填入實際出場價格；虧損或 BE 可以留空。", "error");
    els.tradeForm.elements.exitPrice.focus();
    return;
  }
  const profitableExitMismatch =
    trade.profit > 0 &&
    trade.entry != null &&
    trade.exitPrice != null &&
    (trade.direction === "Long" ? trade.exitPrice <= trade.entry : trade.exitPrice >= trade.entry);
  const directionMismatch =
    trade.entry != null &&
    trade.stopLoss != null &&
    (trade.direction === "Long" ? trade.stopLoss >= trade.entry : trade.stopLoss <= trade.entry);
  if ((directionMismatch || profitableExitMismatch) && !window.confirm("Entry、SL 或實際出場價的方向與 Long／Short 不一致，仍要儲存嗎？")) return;
  const signMismatch =
    (trade.outcome === "win" && trade.profit < 0) ||
    (trade.outcome === "loss" && trade.profit > 0) ||
    (trade.outcome === "be" && Math.abs(trade.profit) > 0.01);
  if (signMismatch && !window.confirm("交易結果與損益正負不一致，仍要儲存嗎？")) return;
  const replacedBaseKey = els.tradeForm.elements.baseKey.value;
  if (replacedBaseKey) deletedTrades.add(replacedBaseKey);
  const existingIndex = localTrades.findIndex((item) => item.localId === trade.localId);
  if (existingIndex >= 0) localTrades[existingIndex] = trade;
  else localTrades.push(trade);
  saveLocalTrades();
  els.tradeDialog.close();
  resetTradeForm();
  refreshAfterDataChange();
  showToast(existingIndex >= 0 ? "交易已更新。" : "交易已新增。");
});

["date", "time", "pair", "direction", "outcome", "profit", "r", "lots", "entry", "stopLoss", "exitPrice", "slPips"].forEach((name) => {
  els.tradeForm.elements[name].addEventListener("input", updateTradeDerivedFields);
});

els.clearLocalTrades.addEventListener("click", () => {
  if (!localTrades.length && !deletedTrades.size) {
    showToast("目前沒有本機資料可清除。", "error");
    return;
  }
  if (!window.confirm(`確定清除 ${localTrades.length} 筆本機交易與刪除紀錄？建議先下載完整備份。`)) return;
  localTrades = [];
  deletedTrades = new Set();
  saveLocalTrades();
  refreshAfterDataChange();
  showToast("本機資料已清除，內建 Excel 資料已恢復。");
});

els.checklist.addEventListener("click", (event) => {
  const button = event.target.closest(".check-item");
  if (!button) return;
  const pressed = button.getAttribute("aria-pressed") === "true";
  button.setAttribute("aria-pressed", String(!pressed));
  updateChecklistGate();
});

els.monthlyRows.addEventListener("click", (event) => {
  const row = event.target.closest("[data-month]");
  if (!row) return;
  selectedPeriodMonth = row.dataset.month;
  selectedPeriodWeekStart = null;
  renderPeriodAnalysis();
});

els.monthlyRows.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-month]");
  if (!row) return;
  event.preventDefault();
  selectedPeriodMonth = row.dataset.month;
  selectedPeriodWeekStart = null;
  renderPeriodAnalysis();
});

els.weeklyBreakdown.addEventListener("click", (event) => {
  const row = event.target.closest("[data-week]");
  if (!row) return;
  selectedPeriodWeekStart = row.dataset.week;
  renderPeriodAnalysis();
});

els.weeklyBreakdown.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-week]");
  if (!row) return;
  event.preventDefault();
  selectedPeriodWeekStart = row.dataset.week;
  renderPeriodAnalysis();
});

els.toggleReviews?.addEventListener("click", () => {
  reviewsExpanded = !reviewsExpanded;
  renderRows(filteredTrades());
});

els.rows.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const trade = trades.find((item) => String(item.id) === row.dataset.id);
  if (trade) openTradeDetail(trade);
});

els.rows.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const row = event.target.closest("tr[data-id]");
  const trade = row && trades.find((item) => String(item.id) === row.dataset.id);
  if (trade) openTradeDetail(trade);
});

els.closeDrawer.addEventListener("click", closeTradeDetail);
els.detail.addEventListener("click", (event) => {
  const action = event.target.closest("[data-trade-action]")?.dataset.tradeAction;
  if (!action || currentDetailId == null) return;
  const trade = trades.find((item) => item.id === currentDetailId);
  if (!trade) return;
  if (action === "edit") editTrade(trade);
  if (action === "delete") deleteTrade(trade);
});
els.exportCsv.addEventListener("click", exportFilteredCsv);
els.exportJson.addEventListener("click", exportFullBackup);
els.importFile.addEventListener("change", async () => {
  const [file] = els.importFile.files;
  if (!file) return;
  try {
    await importDataFile(file);
  } catch (error) {
    showToast(error.message || "匯入失敗，請檢查檔案格式。", "error");
  } finally {
    els.importFile.value = "";
  }
});
els.replaceFile.addEventListener("change", async () => {
  const [file] = els.replaceFile.files;
  if (!file) return;
  try {
    await importDataFile(file, "replace");
  } catch (error) {
    showToast(error.message || "取代失敗，請檢查檔案格式。", "error");
  } finally {
    els.replaceFile.value = "";
  }
});
els.resetFilters.addEventListener("click", () => {
  els.year.value = "all";
  els.pair.value = "all";
  els.outcome.value = "all";
  els.window.value = "all";
  els.search.value = "";
  render();
});

els.chart.addEventListener("pointermove", (event) => {
  if (!equityChartState) return;
  const rect = els.chart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { points, items, px } = equityChartState;
  const index = Math.max(0, Math.min(points.length - 1, Math.round(((x - 34) / Math.max(rect.width - 68, 1)) * (points.length - 1))));
  const point = points[index];
  const trade = items[index];
  els.equityTooltip.innerHTML = `<strong>${trade.date || `第 ${index + 1} 筆`}</strong><br>${trade.pair} · ${signed(trade.r, "R")}<br>累積 ${signed(point.y, "R")}`;
  els.equityTooltip.style.left = `${Math.max(72, Math.min(rect.width - 72, px(index)))}px`;
  els.equityTooltip.style.top = `${Math.max(82, equityChartState.py(point.y))}px`;
  els.equityTooltip.hidden = false;
  els.crosshairX.style.left = `${px(index)}px`;
  els.crosshairY.style.top = `${equityChartState.py(point.y)}px`;
  els.crosshairX.hidden = false;
  els.crosshairY.hidden = false;
});
els.chart.addEventListener("pointerleave", () => {
  els.equityTooltip.hidden = true;
  els.crosshairX.hidden = true;
  els.crosshairY.hidden = true;
});

els.profitModes.forEach((button) => {
  button.addEventListener("click", () => {
    profitChartMode = button.dataset.profitMode;
    els.profitModes.forEach((item) => item.classList.toggle("active", item === button));
    renderAnalytics(filteredTrades());
  });
});

els.calendarHeatmap.addEventListener("click", (event) => {
  const cell = event.target.closest("[data-date]");
  if (!cell) return;
  els.search.value = cell.dataset.date;
  setPage("trades");
  render();
});

els.navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setPage(link.dataset.pageLink);
  });
});

window.addEventListener("hashchange", () => setPage(window.location.hash.slice(1)));
setPage(window.location.hash.slice(1) || "dashboard");
