const importedTrades = window.TRADES || [];
const STORAGE_KEY = "tradingnote.localTrades";
const DELETED_KEY = "tradingnote.deletedTrades";
const LIVE_BATCH_KEY = "tradingnote.liveBatches";
const LIVE_ACTIVE_BATCH_KEY = "tradingnote.activeLiveBatch";
const ALL_LIVE_BATCH_ID = "live-all";
const ACCOUNT_RULES_KEY = "tradingnote.accountRules";
const STRATEGY_VERSIONS_KEY = "tradingnote.strategyVersions.v1";
const THEME_KEY = "tradingnote.theme";
const RESEARCH_TRADE_KEY = "trading-research.trades.v1";
const RESEARCH_RULE_KEY = "trading-research.rules.v1";
const LEGACY_RESEARCH_TRADE_KEY = "trs.trades";
const LEGACY_RESEARCH_RULE_KEY = "trs.rules";
const LEGACY_RESEARCH_BATCH_KEY = "trs.batches";
const LEGACY_RESEARCH_ACTIVE_BATCH_KEY = "trs.activeBatch";
const DEFAULT_RESEARCH_RULES = [
  { id: "R-001", title: "等待 K 棒收線確認突破", description: "突破只能在 5m 或 15m K 棒收線後成立，避免假突破與追價。", status: "Verified", confidence: 88, linkedTrades: ["BT-002", "BT-003", "BT-011"] },
  { id: "R-002", title: "高週期方向不一致則 No Trade", description: "1H bias 與執行方向相反時，不以短週期訊號覆蓋。", status: "Testing", confidence: 76, linkedTrades: ["BT-006", "BT-014", "BT-016"] },
  { id: "R-003", title: "重大消息前 30 分鐘不進場", description: "CPI、NFP、FOMC 等事件前不建立新倉位。", status: "Verified", confidence: 92, linkedTrades: ["BT-010"] },
  { id: "R-004", title: "先比較同類指數的乾淨程度", description: "DJ30 與 NAS100 同時出現訊號時，只選結構、流動性與 RR 最清楚者。", status: "Testing", confidence: 64, linkedTrades: ["BT-004", "BT-008"] },
];
const DEFAULT_LEGACY_RESEARCH_RULES = DEFAULT_RESEARCH_RULES.map((rule) => ({
  id: rule.id,
  title: rule.title,
  description: rule.description,
  status: rule.status,
  confidence: rule.confidence,
  evidence: rule.linkedTrades,
}));

applyStoredTheme();

let localTrades = loadLocalTrades();
let deletedTrades = loadDeletedTrades();
let liveBatches = loadLiveBatches();
let activeLiveBatch = loadActiveLiveBatch();
let trades = mergeTrades();
let currentDetailId = null;
let toastTimer = null;
let accountRules = loadAccountRules();
let strategyVersions = loadStrategyVersions();
let selectedPeriodMonth = monthKey(new Date());
let selectedPeriodWeekStart = null;
let reviewsExpanded = false;
let currentTradeImage = "";
let monteCarloResult = null;
let moveTradeCandidates = new Map();

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
  periodComparisonCards: document.querySelector("#periodComparisonCards"),
  homeComparisonCards: document.querySelector("#homeComparisonCards"),
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
  equityLatestPoint: document.querySelector("#equityLatestPoint"),
  equityTooltip: document.querySelector("#equityTooltip"),
  crosshairX: document.querySelector("#chartCrosshairX"),
  crosshairY: document.querySelector("#chartCrosshairY"),
  pairBars: document.querySelector("#pairBars"),
  rows: document.querySelector("#tradeRows"),
  theme: document.querySelector("#themeToggle"),
  exportCsv: document.querySelector("#exportCsvButton"),
  liveBatch: document.querySelector("#liveBatchSelect"),
  liveBatchControl: document.querySelector("#liveBatchControl"),
  breakpointMenu: document.querySelector("#breakpointMenu"),
  dataMenu: document.querySelector("#dataMenu"),
  addLiveBatch: document.querySelector("#addLiveBatchButton"),
  deleteLiveBatch: document.querySelector("#deleteLiveBatchButton"),
  deleteLiveBatchHint: document.querySelector("#deleteLiveBatchHint"),
  liveBatchDialog: document.querySelector("#liveBatchDialog"),
  liveBatchForm: document.querySelector("#liveBatchForm"),
  liveBatchName: document.querySelector("#liveBatchNameInput"),
  liveBatchMode: document.querySelector("#liveBatchModeInput"),
  liveBatchStart: document.querySelector("#liveBatchStartInput"),
  liveBatchEnd: document.querySelector("#liveBatchEndInput"),
  liveBatchPreview: document.querySelector("#liveBatchPreview"),
  closeLiveBatchDialog: document.querySelector("#closeLiveBatchDialog"),
  cancelLiveBatch: document.querySelector("#cancelLiveBatchButton"),
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
  simRuns: document.querySelector("#simRunsInput"),
  researchBreakpoint: document.querySelector("#researchBreakpointInput"),
  useJournalStats: document.querySelector("#useJournalStatsButton"),
  simulationMetrics: document.querySelector("#simulationMetrics"),
  simulationChart: document.querySelector("#simulationChart"),
  simulationFormula: document.querySelector("#simulationFormula"),
  monteCarloMetrics: document.querySelector("#monteCarloMetrics"),
  monteCarloChart: document.querySelector("#monteCarloChart"),
  monteCarloFormula: document.querySelector("#monteCarloFormula"),
  monteCarloStress: document.querySelector("#monteCarloStress"),
  researchMonteCarloMetrics: document.querySelector("#researchMonteCarloMetrics"),
  researchMonteCarloChart: document.querySelector("#researchMonteCarloChart"),
  researchMonteCarloFormula: document.querySelector("#researchMonteCarloFormula"),
  researchMonteCarloStress: document.querySelector("#researchMonteCarloStress"),
  monteCarloCompare: document.querySelector("#monteCarloCompare"),
  researchLabBreakpoint: document.querySelector("#researchLabBreakpoint"),
  researchLabMarket: document.querySelector("#researchLabMarket"),
  researchLabStrategy: document.querySelector("#researchLabStrategy"),
  researchLabEmpty: document.querySelector("#researchLabEmpty"),
  researchLabContent: document.querySelector("#researchLabContent"),
  researchLabMetrics: document.querySelector("#researchLabMetrics"),
  researchMarketRows: document.querySelector("#researchMarketRows"),
  researchDateRows: document.querySelector("#researchDateRows"),
  researchLabInsight: document.querySelector("#researchLabInsight"),
  researchAttribution: document.querySelector("#researchAttribution"),
  researchStrategyComparison: document.querySelector("#researchStrategyComparison"),
  strategyVersionGrid: document.querySelector("#strategyVersionGrid"),
  strategyVersionEmpty: document.querySelector("#strategyVersionEmpty"),
  addStrategyVersion: document.querySelector("#addStrategyVersionButton"),
  strategyVersionDialog: document.querySelector("#strategyVersionDialog"),
  strategyVersionForm: document.querySelector("#strategyVersionForm"),
  strategyVersionDialogTitle: document.querySelector("#strategyVersionDialogTitle"),
  closeStrategyVersionDialog: document.querySelector("#closeStrategyVersionDialog"),
  cancelStrategyVersion: document.querySelector("#cancelStrategyVersion"),
  liveReviewMetrics: document.querySelector("#liveReviewMetrics"),
  liveReviewClassFilter: document.querySelector("#liveReviewClassFilter"),
  liveReviewStrategyFilter: document.querySelector("#liveReviewStrategyFilter"),
  liveReviewSearch: document.querySelector("#liveReviewSearch"),
  liveReviewRows: document.querySelector("#liveReviewRows"),
  liveReviewEmpty: document.querySelector("#liveReviewEmpty"),
  addMissedTrade: document.querySelector("#addMissedTradeButton"),
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
  backupImport: document.querySelector("#backupImportInput"),
  backupForceImport: document.querySelector("#backupForceImportInput"),
  exportJson: document.querySelector("#exportJsonButton"),
  moveTrades: document.querySelector("#moveTradesButton"),
  moveTradesDialog: document.querySelector("#moveTradesDialog"),
  moveTradesForm: document.querySelector("#moveTradesForm"),
  moveTradesSubtitle: document.querySelector("#moveTradesSubtitle"),
  moveTradesTarget: document.querySelector("#moveTradesTarget"),
  moveTradesSelectAll: document.querySelector("#moveTradesSelectAll"),
  moveTradesList: document.querySelector("#moveTradesList"),
  moveTradesPreview: document.querySelector("#moveTradesPreview"),
  closeMoveTradesDialog: document.querySelector("#closeMoveTradesDialog"),
  cancelMoveTrades: document.querySelector("#cancelMoveTradesButton"),
  confirmMoveTrades: document.querySelector("#confirmMoveTradesButton"),
  openMt4Import: document.querySelector("#openMt4ImportButton"),
  mt4ImportDialog: document.querySelector("#mt4ImportDialog"),
  mt4ImportForm: document.querySelector("#mt4ImportForm"),
  mt4Paste: document.querySelector("#mt4PasteInput"),
  mt4ImportPreview: document.querySelector("#mt4ImportPreview"),
  closeMt4ImportDialog: document.querySelector("#closeMt4ImportDialog"),
  cancelMt4Import: document.querySelector("#cancelMt4ImportButton"),
  toggleReviews: document.querySelector("#toggleReviewsButton"),
  tradeEmpty: document.querySelector("#tradeEmptyState"),
  dialogTitle: document.querySelector("#tradeDialogTitle"),
  dialogSubtitle: document.querySelector("#tradeDialogSubtitle"),
  saveTrade: document.querySelector("#saveTradeButton"),
  tradeOutcomePulse: document.querySelector("#tradeOutcomePulse"),
  tradeRiskPreview: document.querySelector("#tradeRiskPreview"),
  tradeSessionClock: document.querySelector("#tradeSessionClock"),
  tradeImageInput: document.querySelector("#tradeImageInput"),
  tradeImagePreview: document.querySelector("#tradeImagePreview"),
  tradeImageStatus: document.querySelector("#tradeImageStatus"),
  removeTradeImage: document.querySelector("#removeTradeImageButton"),
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
  review: "行為與紀律分析",
  period: "週/月績效分析",
  trades: "交易紀錄",
  strategy: "策略版本庫",
  "research-lab": "回測 vs 實盤研究室",
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

function loadLiveBatches() {
  try {
    const stored = JSON.parse(localStorage.getItem(LIVE_BATCH_KEY) || "[]");
    if (Array.isArray(stored) && stored.length) {
      return stored.map((batch) => batch.id === "live-default" && batch.name === "完整實盤"
        ? { ...batch, name: "主要紀錄" }
        : batch);
    }
  } catch (_) {}
  return [{ id: "live-default", name: "主要紀錄", createdAt: isoDate(new Date()) }];
}

function loadActiveLiveBatch() {
  try {
    return localStorage.getItem(LIVE_ACTIVE_BATCH_KEY) || "live-default";
  } catch {
    return "live-default";
  }
}

function saveLiveBatches() {
  localStorage.setItem(LIVE_BATCH_KEY, JSON.stringify(liveBatches));
  localStorage.setItem(LIVE_ACTIVE_BATCH_KEY, activeLiveBatch);
}

function liveBatchLabel(id) {
  if (id === ALL_LIVE_BATCH_ID) return "完整紀錄";
  return liveBatches.find((batch) => batch.id === id)?.name || "主要紀錄";
}

function isAllLiveView() {
  return activeLiveBatch === ALL_LIVE_BATCH_ID;
}

function uniqueAcrossLiveBatches(items = trades) {
  const unique = new Map();
  for (const trade of items) {
    const key = tradeIdentityFingerprint(trade);
    if (key) unique.set(key, trade);
  }
  return [...unique.values()];
}

function tradesForActiveView(items = trades) {
  if (isAllLiveView()) return uniqueAcrossLiveBatches(items);
  return items.filter((trade) => (trade.batchId || "live-default") === activeLiveBatch);
}

function requireWritableLiveBatch() {
  if (!isAllLiveView()) return true;
  showToast("完整紀錄是所有斷點的彙總檢視；請先切換到一個斷點再新增、匯入、編輯或刪除交易。", "error");
  return false;
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

function loadStrategyVersions() {
  try {
    const stored = JSON.parse(localStorage.getItem(STRATEGY_VERSIONS_KEY) || "[]");
    return Array.isArray(stored) ? stored.map((strategy) => ({
      ...strategy,
      id: String(strategy.id || crypto.randomUUID()),
      name: String(strategy.name || "未命名策略"),
      version: String(strategy.version || "v1.0"),
      status: strategy.status || "Draft",
      locked: Boolean(strategy.locked),
    })) : [];
  } catch {
    return [];
  }
}

function saveStrategyVersions() {
  localStorage.setItem(STRATEGY_VERSIONS_KEY, JSON.stringify(strategyVersions));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function strategyVersionLabel(id) {
  if (!id) return "未綁定策略";
  const strategy = strategyVersions.find((item) => String(item.id) === String(id));
  return strategy ? `${strategy.name} ${strategy.version}` : "已刪除的策略版本";
}

function reviewClassLabel(value) {
  return ({
    correct_execution: "符合策略且執行正確",
    execution_error: "符合策略但執行錯誤",
    rule_violation: "不符合策略卻進場",
    missed_trade: "符合策略但漏單",
  })[value] || "待復盤";
}

const ATTRIBUTION_FIELDS = [
  ["missedTradeR", "漏單"],
  ["earlyExitR", "提早出場"],
  ["extraTradeR", "額外亂做"],
  ["lateEntryR", "太晚進場"],
  ["slippageR", "滑價／成本"],
  ["marketDriftR", "市場狀態差異"],
];

function tradeAttributionTotal(trade) {
  return ATTRIBUTION_FIELDS.reduce((sum, [field]) => sum + Math.max(0, Number(trade[field]) || 0), 0);
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

function populateLiveBatchOptions() {
  if (activeLiveBatch !== ALL_LIVE_BATCH_ID && !liveBatches.some((batch) => batch.id === activeLiveBatch)) {
    activeLiveBatch = liveBatches[0]?.id || "live-default";
  }
  const aggregateCount = uniqueAcrossLiveBatches().length;
  els.liveBatch.innerHTML = `<option value="${ALL_LIVE_BATCH_ID}">完整紀錄（全部斷點 · ${aggregateCount}）</option>` + liveBatches.map((batch) => {
    const count = trades.filter((trade) => trade.batchId === batch.id).length;
    return `<option value="${batch.id}">${batch.name}（${count}）</option>`;
  }).join("");
  els.liveBatch.value = activeLiveBatch;
  const activeCount = tradesForActiveView().length;
  const canDelete = !isAllLiveView() && liveBatches.length > 1;
  els.deleteLiveBatch.disabled = !canDelete;
  els.moveTrades.disabled = isAllLiveView();
  els.newTrade.disabled = isAllLiveView();
  els.openMt4Import.disabled = isAllLiveView();
  els.deleteLiveBatchHint.textContent = isAllLiveView()
    ? `只讀彙總，共 ${activeCount} 筆去重交易；請切換到斷點管理資料`
    : canDelete
    ? `會一併移除其中 ${activeCount} 筆交易`
    : "至少需要保留一個斷點";
  saveLiveBatches();
}

function historicalTradeCandidates() {
  const seen = new Set();
  return sortByDate(trades).filter((trade) => {
    const key = tradeIdentityFingerprint(trade);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(parseTradeDate(trade));
  });
}

function liveBatchHistorySelection() {
  if (els.liveBatchMode.value === "empty") return [];
  const start = els.liveBatchStart.value ? new Date(`${els.liveBatchStart.value}T00:00:00`) : null;
  const end = els.liveBatchEnd.value ? new Date(`${els.liveBatchEnd.value}T23:59:59`) : null;
  return historicalTradeCandidates().filter((trade) => {
    const date = parseTradeDate(trade);
    if (!date) return false;
    return (!start || date >= start) && (!end || date <= end);
  });
}

function updateLiveBatchPreview() {
  const historyMode = els.liveBatchMode.value === "history";
  els.liveBatchStart.disabled = !historyMode;
  els.liveBatchEnd.disabled = !historyMode;
  if (!historyMode) {
    els.liveBatchPreview.innerHTML = `<strong>空白斷點</strong><span>建立後會切到新斷點，之後新增交易會存到這裡。</span>`;
    return;
  }
  const selected = liveBatchHistorySelection();
  const stats = computeStats(selected);
  els.liveBatchPreview.innerHTML = selected.length
    ? `<strong>${selected.length} 筆 · ${signed(stats.totalR, "R")} · ${stats.winRate.toFixed(1)}% WR</strong><span>${els.liveBatchStart.value || "最早"} ~ ${els.liveBatchEnd.value || "最新"}，會複製成新斷點樣本，原始歷史不會被改動。</span>`
    : `<strong>沒有符合日期的交易</strong><span>調整日期區間，或改成建立空白斷點。</span>`;
}

function openLiveBatchDialog() {
  const candidates = historicalTradeCandidates();
  const dates = candidates.map((trade) => normalizeDateValue(trade.date)).filter(Boolean).sort();
  const fallback = `實盤斷點 ${liveBatches.length + 1}`;
  els.liveBatchName.value = fallback;
  els.liveBatchMode.value = candidates.length ? "history" : "empty";
  els.liveBatchStart.value = dates[0] || "";
  els.liveBatchEnd.value = dates.at(-1) || "";
  els.liveBatchStart.min = dates[0] || "";
  els.liveBatchStart.max = dates.at(-1) || "";
  els.liveBatchEnd.min = dates[0] || "";
  els.liveBatchEnd.max = dates.at(-1) || "";
  updateLiveBatchPreview();
  els.liveBatchDialog.showModal();
}

function cloneTradeForBatch(trade, batchId) {
  const { id, origin, baseKey, row, ...record } = trade;
  return {
    ...record,
    localId: crypto.randomUUID(),
    batchId,
    source: "Live breakpoint history copy",
    copiedFrom: trade.localId || trade.baseKey || trade.id || "",
  };
}

function createLiveBatchFromDialog() {
  const fallback = `實盤斷點 ${liveBatches.length + 1}`;
  const name = els.liveBatchName.value.trim() || fallback;
  const id = `live-${Date.now()}`;
  const selected = liveBatchHistorySelection();
  if (els.liveBatchMode.value === "history" && !selected.length) {
    showToast("這個日期區間沒有可複製的歷史交易。", "error");
    return;
  }
  liveBatches.push({ id, name, createdAt: isoDate(new Date()) });
  if (selected.length) {
    localTrades.push(...selected.map((trade) => cloneTradeForBatch(trade, id)));
    saveLocalTrades();
  }
  activeLiveBatch = id;
  saveLiveBatches();
  els.liveBatchDialog.close();
  populateLiveBatchOptions();
  render();
  showToast(selected.length ? `已建立「${name}」，並帶入 ${selected.length} 筆歷史交易。` : `已建立空白斷點「${name}」。`);
}

function closeActionMenus() {
  [els.breakpointMenu, els.dataMenu].forEach((menu) => {
    if (menu) menu.open = false;
  });
}

function animateBatchControl() {
  els.liveBatchControl.classList.remove("batch-updated");
  requestAnimationFrame(() => els.liveBatchControl.classList.add("batch-updated"));
}

function deleteActiveLiveBatch() {
  const batch = liveBatches.find((item) => item.id === activeLiveBatch);
  if (!batch) return;
  if (liveBatches.length <= 1) {
    showToast("至少需要保留一個斷點。", "error");
    return;
  }

  const batchTrades = trades.filter((trade) => (trade.batchId || "live-default") === batch.id);
  const confirmed = window.confirm(
    `確定刪除斷點「${batch.name}」？\n\n其中 ${batchTrades.length} 筆交易會一併移除。建議先從「資料管理」下載完整備份。`,
  );
  if (!confirmed) return;

  const deletedIndex = liveBatches.findIndex((item) => item.id === batch.id);
  localTrades = localTrades.filter((trade) => (trade.batchId || "live-default") !== batch.id);
  batchTrades
    .filter((trade) => trade.origin === "excel" && trade.baseKey)
    .forEach((trade) => deletedTrades.add(trade.baseKey));
  liveBatches = liveBatches.filter((item) => item.id !== batch.id);
  activeLiveBatch = liveBatches[Math.min(deletedIndex, liveBatches.length - 1)]?.id || liveBatches[0].id;

  saveLocalTrades();
  saveLiveBatches();
  closeActionMenus();
  refreshAfterDataChange();
  animateBatchControl();
  showToast(`已刪除斷點「${batch.name}」與其中 ${batchTrades.length} 筆交易。`);
}

function addLiveBatch() {
  const fallback = `實盤斷點 ${liveBatches.length + 1}`;
  const name = window.prompt("請輸入新實盤斷點名稱", fallback);
  if (!name) return;
  const id = `live-${Date.now()}`;
  liveBatches.push({ id, name: name.trim() || fallback, createdAt: isoDate(new Date()) });
  activeLiveBatch = id;
  saveLiveBatches();
  populateLiveBatchOptions();
  render();
  showToast(`已建立「${liveBatchLabel(id)}」。新增交易會存到這個斷點。`);
}

function baseTradeKey(trade) {
  return `${trade.source || "TradingNote"}::${trade.row || trade.id || ""}::${trade.date || ""}`;
}

function enrichTradeFields(trade) {
  const entry = Number.isFinite(Number(trade.entry)) && Number(trade.entry) > 0 ? Number(trade.entry) : null;
  const stopLoss = Number.isFinite(Number(trade.stopLoss)) && Number(trade.stopLoss) > 0 ? Number(trade.stopLoss) : null;
  const takeProfit = Number.isFinite(Number(trade.takeProfit)) && Number(trade.takeProfit) > 0 ? Number(trade.takeProfit) : null;
  const initialRiskMoney = Number.isFinite(Number(trade.initialRiskMoney)) && Number(trade.initialRiskMoney) > 0
    ? Number(trade.initialRiskMoney)
    : null;
  const isEaTrade = Boolean(trade.externalId || trade.source === "TradingNote MT4 EA");
  const riskUnavailable = Boolean(trade.riskUnavailable || (isEaTrade && (!stopLoss || !initialRiskMoney)));
  const derivedSlPips =
    entry && stopLoss && entry !== stopLoss
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
    batchId: trade.batchId || "live-default",
    entry,
    stopLoss,
    takeProfit,
    initialRiskMoney,
    r: riskUnavailable ? null : trade.r,
    grossR: riskUnavailable ? null : trade.grossR,
    mfeR: riskUnavailable ? null : trade.mfeR,
    maeR: riskUnavailable ? null : trade.maeR,
    exitEfficiencyPct: riskUnavailable ? null : trade.exitEfficiencyPct,
    riskUnavailable,
    captureQuality: riskUnavailable && (!trade.captureQuality || trade.captureQuality === "complete")
      ? "missing_initial_sl"
      : trade.captureQuality,
    slPips: riskUnavailable || slPips == null ? null : Number(slPips.toFixed(4)),
    lots: Number.isFinite(Number(trade.lots)) && Number(trade.lots) > 0
      ? Number(trade.lots)
      : derivedLots == null
        ? null
        : Number(derivedLots.toFixed(4)),
  };
}

function mergeTrades() {
  const combined = [
    ...importedTrades
      .filter((trade) => !deletedTrades.has(baseTradeKey(trade)))
      .map((trade) => ({ ...enrichTradeFields(trade), origin: "excel", baseKey: baseTradeKey(trade) })),
    ...localTrades.map((trade) => ({ ...enrichTradeFields(trade), origin: "local" })),
  ];
  const deduplicated = new Map();
  for (const trade of consolidateMt4Trades(combined)) deduplicated.set(smartTradeFingerprint(trade), trade);
  return [...deduplicated.values()].map((trade, index) => ({ ...trade, id: index + 1 }));
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("圖片讀取失敗。"));
    reader.readAsDataURL(file);
  });
}

function updateTradeImagePreview(image = currentTradeImage) {
  currentTradeImage = image || "";
  const hasImage = Boolean(currentTradeImage);
  els.tradeImagePreview.hidden = !hasImage;
  els.removeTradeImage.hidden = !hasImage;
  els.tradeImagePreview.src = hasImage ? currentTradeImage : "";
  els.tradeImageStatus.textContent = hasImage ? "已加入圖片，會保存在本機與備份 JSON。" : "尚未加入圖片";
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

function mambaDecisionLabel(value) {
  const labels = {
    Long: "Long",
    Short: "Short",
    "No Trade": "No Trade",
  };
  return labels[value] || "未記錄";
}

function mambaRLabel(value) {
  if (value === "" || value == null) return "-";
  return Number.isFinite(Number(value)) ? signed(Number(value), "R") : "-";
}

function mambaRClass(value) {
  if (value === "" || value == null || !Number.isFinite(Number(value))) return "";
  return Number(value) >= 0 ? "profit-pos" : "profit-neg";
}

function mambaAgreementLabel(trade) {
  if (!trade.mambaDecision) return "未記錄";
  if (trade.mambaDecision === "No Trade") return "Mamba 沒做";
  return trade.mambaDecision === trade.direction ? "方向一致" : "方向不同";
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

function attachCursorClickEffects() {
  document.addEventListener("pointerdown", (event) => {
    if (!motionAllowed || event.pointerType === "touch") return;
    const burst = document.createElement("span");
    burst.className = "cursor-click-burst";
    burst.style.left = `${event.clientX}px`;
    burst.style.top = `${event.clientY}px`;
    document.body.appendChild(burst);
    burst.addEventListener("animationend", () => burst.remove(), { once: true });

    for (let index = 0; index < 6; index += 1) {
      const spark = document.createElement("span");
      const angle = (Math.PI * 2 * index) / 6 + Math.random() * 0.35;
      const distance = 14 + Math.random() * 18;
      spark.className = "cursor-click-spark";
      spark.style.left = `${event.clientX}px`;
      spark.style.top = `${event.clientY}px`;
      spark.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--ty", `${Math.sin(angle) * distance}px`);
      document.body.appendChild(spark);
      spark.addEventListener("animationend", () => spark.remove(), { once: true });
    }
  });
}

function attachCustomCursor() {
  if (!motionAllowed || window.matchMedia("(pointer: coarse)").matches) return;
  const cursor = document.createElement("span");
  cursor.className = "custom-cursor-dot";
  document.body.appendChild(cursor);
  document.body.classList.add("custom-cursor-enabled");

  const moveCursor = (event) => {
    if (event.pointerType === "touch") return;
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursor.classList.add("visible");
    const interactive = event.target.closest("button, a, input, select, textarea, label, [tabindex]");
    cursor.classList.toggle("interactive", Boolean(interactive));
  };

  document.addEventListener("pointermove", moveCursor);
  document.addEventListener("pointerdown", () => cursor.classList.add("dragging"));
  document.addEventListener("pointerup", () => cursor.classList.remove("dragging"));
  document.addEventListener("pointercancel", () => cursor.classList.remove("dragging"));
  document.addEventListener("pointerleave", () => cursor.classList.remove("visible"));
  document.addEventListener("pointerenter", (event) => {
    moveCursor(event);
  });
}

function attachCursorTrailEffects() {
  let lastTrailAt = 0;
  let dragging = false;
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") dragging = true;
  });
  document.addEventListener("pointerup", () => {
    dragging = false;
  });
  document.addEventListener("pointercancel", () => {
    dragging = false;
  });
  document.addEventListener("pointermove", (event) => {
    if (!motionAllowed || event.pointerType === "touch") return;
    const now = performance.now();
    if (now - lastTrailAt < (dragging ? 14 : 30)) return;
    lastTrailAt = now;

    const dot = document.createElement("span");
    const speed = Math.min(24, Math.abs(event.movementX) + Math.abs(event.movementY));
    const size = (dragging ? 13 : 8) + speed * (dragging ? 0.62 : 0.32);
    dot.className = `cursor-trail-dot ${dragging ? "dragging" : ""}`;
    dot.style.left = `${event.clientX}px`;
    dot.style.top = `${event.clientY}px`;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    document.body.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove(), { once: true });

    if (!dragging) return;
    const streak = document.createElement("span");
    const angle = Math.atan2(event.movementY || 0, event.movementX || 1) * (180 / Math.PI);
    streak.className = "cursor-drag-streak";
    streak.style.left = `${event.clientX}px`;
    streak.style.top = `${event.clientY}px`;
    streak.style.width = `${42 + speed * 3}px`;
    streak.style.rotate = `${angle}deg`;
    document.body.appendChild(streak);
    streak.addEventListener("animationend", () => streak.remove(), { once: true });
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
  const day = start.getDay();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function latestTradeDate(items) {
  const dates = items.map(parseTradeDate).filter(Boolean);
  if (!dates.length) return new Date();
  return dates.reduce((latest, date) => (date > latest ? date : latest), dates[0]);
}

function monthRange(anchor, monthOffset = 0) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth() + monthOffset;
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0),
  };
}

function shortDate(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function rangeLabel(range) {
  return `${shortDate(range.start)}-${shortDate(range.end)}`;
}

function readResearchBreakpoints() {
  let researchTrades = [];
  let batches = [];
  let activeBatch = "";
  try {
    researchTrades = JSON.parse(localStorage.getItem(LEGACY_RESEARCH_TRADE_KEY) || "[]");
  } catch (_) {
    researchTrades = [];
  }
  try {
    batches = JSON.parse(localStorage.getItem(LEGACY_RESEARCH_BATCH_KEY) || "[]");
  } catch (_) {
    batches = [];
  }
  try {
    activeBatch = localStorage.getItem(LEGACY_RESEARCH_ACTIVE_BATCH_KEY) || "";
  } catch (_) {
    activeBatch = "";
  }

  if (!Array.isArray(researchTrades)) researchTrades = [];
  if (!Array.isArray(batches)) batches = [];
  const fallbackBatchId = batches[0]?.id || "default-research";
  const batchMap = new Map(batches.map((batch) => [String(batch.id), { ...batch, trades: [] }]));
  if (!batchMap.size && researchTrades.length) {
    batchMap.set(fallbackBatchId, { id: fallbackBatchId, name: "回測研究資料", createdAt: "", trades: [] });
  }
  for (const trade of researchTrades) {
    const batchId = String(trade.batchId || fallbackBatchId);
    if (!batchMap.has(batchId)) batchMap.set(batchId, { id: batchId, name: batchId, createdAt: "", trades: [] });
    batchMap.get(batchId).trades.push(trade);
  }
  return { activeBatch, batches: Array.from(batchMap.values()) };
}

function populateResearchBreakpointOptions() {
  const { activeBatch, batches } = readResearchBreakpoints();
  const currentValue = els.researchBreakpoint.dataset.ready ? els.researchBreakpoint.value : activeBatch;
  els.researchBreakpoint.innerHTML = [
    `<option value="">不比較回測</option>`,
    ...batches.map((batch) => {
      const rCount = batch.trades.filter((trade) => Number.isFinite(Number(trade.r)) && Number(trade.r) !== 0).length;
      return `<option value="${batch.id}">${batch.name || batch.id}（${rCount} R）</option>`;
    }),
  ].join("");
  if (batches.some((batch) => String(batch.id) === String(currentValue))) {
    els.researchBreakpoint.value = currentValue;
  } else {
    els.researchBreakpoint.value = "";
  }
  els.researchBreakpoint.dataset.ready = "true";
}

function selectedResearchRValues() {
  const selectedId = els.researchBreakpoint.value;
  if (!selectedId) return null;
  const selected = readResearchBreakpoints().batches.find((batch) => String(batch.id) === String(selectedId));
  if (!selected) return null;
  return {
    label: selected.name || selected.id,
    values: selected.trades.map((trade) => Number(trade.r)).filter((value) => Number.isFinite(value) && value !== 0),
  };
}

function researchTradeMarket(trade) {
  return String(trade.pair || trade.market || "未設定").trim().toUpperCase();
}

function researchRTrades(items) {
  return items.filter((trade) => !trade.riskUnavailable && Number.isFinite(Number(trade.r)));
}

function researchSummary(items) {
  const valid = researchRTrades(items);
  const values = valid.map((trade) => Number(trade.r));
  const totalR = values.reduce((sum, value) => sum + value, 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }
  return {
    count: valid.length,
    totalR,
    avgR: valid.length ? totalR / valid.length : 0,
    winRate: valid.length ? valid.filter((trade) => Number(trade.r) > 0).length / valid.length * 100 : 0,
    maxDrawdown,
  };
}

function researchMetricCard(label, liveValue, backtestValue, formatter, better = "higher") {
  const gap = liveValue - backtestValue;
  const favorable = better === "higher" ? gap >= 0 : gap <= 0;
  return `<article class="research-metric-card">
    <span>${label}</span>
    <div><strong>${formatter(liveValue)}</strong><small>實盤</small></div>
    <div><strong>${formatter(backtestValue)}</strong><small>回測</small></div>
    <em class="${favorable ? "profit-pos" : "profit-neg"}">${signed(gap, label.includes("勝率") ? "%" : label.includes("樣本") ? " 筆" : "R")} 差距</em>
  </article>`;
}

function populateStrategySelects() {
  const options = strategyVersions
    .slice()
    .sort((a, b) => String(b.effectiveFrom || b.createdAt || "").localeCompare(String(a.effectiveFrom || a.createdAt || "")))
    .map((strategy) => `<option value="${escapeHtml(strategy.id)}">${escapeHtml(strategyVersionLabel(strategy.id))}${strategy.locked ? " · 已鎖定" : ""}</option>`)
    .join("");
  const tradeSelect = els.tradeForm?.elements.strategyVersionId;
  if (tradeSelect) {
    const previous = tradeSelect.value;
    tradeSelect.innerHTML = `<option value="">未綁定策略</option>${options}`;
    if ([...tradeSelect.options].some((option) => option.value === previous)) tradeSelect.value = previous;
  }
  if (els.researchLabStrategy) {
    const previous = els.researchLabStrategy.value || "all";
    els.researchLabStrategy.innerHTML = `<option value="all">全部版本</option><option value="unassigned">未綁定策略</option>${options}`;
    els.researchLabStrategy.value = [...els.researchLabStrategy.options].some((option) => option.value === previous) ? previous : "all";
  }
}

function renderStrategyVersions() {
  if (!els.strategyVersionGrid) return;
  els.strategyVersionEmpty.hidden = strategyVersions.length > 0;
  els.strategyVersionGrid.hidden = strategyVersions.length === 0;
  els.strategyVersionGrid.innerHTML = strategyVersions.map((strategy) => {
    const linkedLive = localTrades.filter((trade) => String(trade.strategyVersionId || "") === String(strategy.id)).length;
    const research = storedArray(LEGACY_RESEARCH_TRADE_KEY).filter((trade) => String(trade.strategyVersionId || "") === String(strategy.id)).length;
    return `<article class="strategy-version-card ${strategy.locked ? "locked" : ""}" data-strategy-id="${escapeHtml(strategy.id)}">
      <div class="strategy-card-top"><span class="strategy-status">${escapeHtml(strategy.status)}</span><span>${strategy.locked ? "🔒 已鎖定" : "可編輯"}</span></div>
      <h3>${escapeHtml(strategy.name)} <em>${escapeHtml(strategy.version)}</em></h3>
      <p>${escapeHtml(strategy.scope || "尚未設定適用市場與時段")}</p>
      <dl><div><dt>生效期間</dt><dd>${escapeHtml(strategy.effectiveFrom || "未設定")} → ${escapeHtml(strategy.effectiveTo || "持續中")}</dd></div><div><dt>每筆風險</dt><dd>${strategy.riskR === "" || strategy.riskR == null ? "未設定" : `${Number(strategy.riskR)}R`}</dd></div><div><dt>關聯資料</dt><dd>實盤 ${linkedLive} · 回測 ${research}</dd></div></dl>
      <details><summary>查看凍結規則</summary><div class="strategy-rules"><b>進場</b><p>${escapeHtml(strategy.entryRules || "—")}</p><b>出場</b><p>${escapeHtml(strategy.exitRules || "—")}</p><b>No Trade</b><p>${escapeHtml(strategy.noTradeRules || "—")}</p></div></details>
      <div class="strategy-card-actions">
        <button class="ghost-button" type="button" data-strategy-action="duplicate">複製新版</button>
        ${strategy.locked ? "" : `<button class="ghost-button" type="button" data-strategy-action="edit">編輯</button><button class="ghost-button" type="button" data-strategy-action="lock">鎖定</button><button class="ghost-button danger-button" type="button" data-strategy-action="delete">刪除</button>`}
      </div>
    </article>`;
  }).join("");
  populateStrategySelects();
}

function populateLiveReviewControls() {
  if (!els.liveReviewStrategyFilter) return;
  const previous = els.liveReviewStrategyFilter.value || "all";
  const options = strategyVersions.map((strategy) => `<option value="${escapeHtml(strategy.id)}">${escapeHtml(strategyVersionLabel(strategy.id))}</option>`).join("");
  els.liveReviewStrategyFilter.innerHTML = `<option value="all">全部版本</option><option value="unassigned">未綁定策略</option>${options}`;
  els.liveReviewStrategyFilter.value = [...els.liveReviewStrategyFilter.options].some((option) => option.value === previous) ? previous : "all";
}

function liveReviewItems() {
  const classFilter = els.liveReviewClassFilter?.value || "all";
  const strategyFilter = els.liveReviewStrategyFilter?.value || "all";
  const query = String(els.liveReviewSearch?.value || "").trim().toLowerCase();
  return tradesForActiveView().filter((trade) => {
    const reviewClass = trade.reviewClass || "pending";
    const classMatch = classFilter === "all" || reviewClass === classFilter;
    const strategyMatch = strategyFilter === "all"
      || (strategyFilter === "unassigned" ? !trade.strategyVersionId : String(trade.strategyVersionId || "") === strategyFilter);
    const searchText = [trade.date, trade.time, trade.pair, trade.setup, trade.review, trade.lesson, strategyVersionLabel(trade.strategyVersionId)].join(" ").toLowerCase();
    return classMatch && strategyMatch && (!query || searchText.includes(query));
  });
}

function renderLiveReview() {
  if (!els.liveReviewRows) return;
  populateLiveReviewControls();
  const all = tradesForActiveView();
  const reviewed = all.filter((trade) => Boolean(trade.reviewClass));
  const pending = all.length - reviewed.length;
  const correct = reviewed.filter((trade) => trade.reviewClass === "correct_execution").length;
  const strategyAligned = reviewed.filter((trade) => ["correct_execution", "execution_error", "missed_trade"].includes(trade.reviewClass)).length;
  const attributedR = all.reduce((sum, trade) => sum + tradeAttributionTotal(trade), 0);
  els.liveReviewMetrics.innerHTML = [
    ["待復盤", pending, `${all.length} 筆總紀錄`, pending ? "warning" : "positive"],
    ["已完成復盤", reviewed.length, `${(all.length ? reviewed.length / all.length * 100 : 0).toFixed(1)}% 完成率`, ""],
    ["執行正確", reviewed.length ? `${(correct / reviewed.length * 100).toFixed(1)}%` : "—", `${correct} 筆分類正確`, "positive"],
    ["符合策略機會", reviewed.length ? `${(strategyAligned / reviewed.length * 100).toFixed(1)}%` : "—", "包含執行錯誤與漏單", ""],
    ["已歸因損失", attributedR ? `-${attributedR.toFixed(2)}R` : "—", "六種落差原因合計", attributedR ? "negative" : ""],
  ].map(([label, value, note, tone]) => `<article class="review-metric ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("");

  const items = sortByDate(liveReviewItems()).reverse();
  els.liveReviewEmpty.hidden = items.length > 0;
  document.querySelector(".live-review-table-wrap").hidden = items.length === 0;
  els.liveReviewRows.innerHTML = items.map((trade) => {
    const missed = trade.recordType === "missed_opportunity" || trade.reviewClass === "missed_trade";
    const result = missed ? "漏單" : trade.r == null ? "R 未記錄" : tradeRLabel(trade);
    const reviewClass = trade.reviewClass || "pending";
    return `<tr data-review-id="${escapeHtml(trade.id)}">
      <td><strong>${escapeHtml(trade.date || "-")}</strong><small>${escapeHtml(trade.time || "")}</small></td>
      <td><strong>${escapeHtml(trade.pair || "-")}</strong><small>${escapeHtml(trade.setup || trade.checklist || "未填 Setup")}</small></td>
      <td>${escapeHtml(strategyVersionLabel(trade.strategyVersionId))}</td>
      <td class="${trade.r > 0 ? "profit-pos" : trade.r < 0 ? "profit-neg" : ""}">${result}</td>
      <td><span class="review-class-chip ${reviewClass}">${reviewClassLabel(trade.reviewClass)}</span></td>
      <td class="${tradeAttributionTotal(trade) ? "profit-neg" : ""}">${tradeAttributionTotal(trade) ? `-${tradeAttributionTotal(trade).toFixed(2)}R` : "—"}</td>
      <td><button class="ghost-button review-edit-button" type="button" data-review-action="edit">${trade.reviewClass ? "編輯復盤" : "開始復盤"}</button></td>
    </tr>`;
  }).join("");
}

function openStrategyVersionForm(strategy = null, duplicate = false) {
  const form = els.strategyVersionForm;
  form.reset();
  const source = strategy ? { ...strategy } : null;
  form.elements.id.value = duplicate || !source ? "" : source.id;
  els.strategyVersionDialogTitle.textContent = duplicate ? "複製成新策略版本" : source ? "編輯策略版本" : "新增策略版本";
  if (source) {
    ["name", "version", "status", "riskR", "effectiveFrom", "effectiveTo", "scope", "entryRules", "exitRules", "noTradeRules", "notes"].forEach((name) => {
      form.elements[name].value = source[name] ?? "";
    });
    if (duplicate) {
      form.elements.version.value = `${source.version}-next`;
      form.elements.status.value = "Draft";
      form.elements.effectiveFrom.value = isoDate(new Date());
      form.elements.effectiveTo.value = "";
    }
  } else {
    form.elements.version.value = `v${strategyVersions.length + 1}.0`;
    form.elements.effectiveFrom.value = isoDate(new Date());
  }
  els.strategyVersionDialog.showModal();
}

function handleStrategyAction(event) {
  const button = event.target.closest("[data-strategy-action]");
  const card = event.target.closest("[data-strategy-id]");
  if (!button || !card) return;
  const strategy = strategyVersions.find((item) => String(item.id) === String(card.dataset.strategyId));
  if (!strategy) return;
  const action = button.dataset.strategyAction;
  if (action === "edit") openStrategyVersionForm(strategy);
  if (action === "duplicate") openStrategyVersionForm(strategy, true);
  if (action === "lock" && window.confirm(`鎖定「${strategyVersionLabel(strategy.id)}」後不能再編輯，只能複製新版。確定嗎？`)) {
    strategy.locked = true;
    strategy.lockedAt = new Date().toISOString();
    saveStrategyVersions();
    renderStrategyVersions();
    showToast("策略版本已鎖定。之後的規則變更請複製成新版。");
  }
  if (action === "delete") {
    const linked = [...localTrades, ...storedArray(LEGACY_RESEARCH_TRADE_KEY)].some((trade) => String(trade.strategyVersionId || "") === String(strategy.id));
    if (linked) return showToast("這個版本已有關聯紀錄，請保留或先改綁其他版本。", "error");
    if (!window.confirm(`確定刪除「${strategyVersionLabel(strategy.id)}」？`)) return;
    strategyVersions = strategyVersions.filter((item) => item.id !== strategy.id);
    saveStrategyVersions();
    renderStrategyVersions();
  }
}

function populateResearchLabControls() {
  if (!els.researchLabBreakpoint || !els.researchLabMarket) return;
  const { activeBatch, batches } = readResearchBreakpoints();
  const previous = els.researchLabBreakpoint.value || activeBatch;
  els.researchLabBreakpoint.innerHTML = [
    `<option value="">請選擇回測斷點</option>`,
    ...batches.map((batch) => `<option value="${batch.id}">${batch.name || batch.id}（${batch.trades.length} 筆）</option>`),
  ].join("");
  els.researchLabBreakpoint.value = batches.some((batch) => String(batch.id) === String(previous)) ? previous : "";
  if (els.researchBreakpoint && [...els.researchBreakpoint.options].some((option) => option.value === els.researchLabBreakpoint.value)) {
    els.researchBreakpoint.value = els.researchLabBreakpoint.value;
  }
  const selected = batches.find((batch) => String(batch.id) === String(els.researchLabBreakpoint.value));
  const previousMarket = els.researchLabMarket.value || "all";
  const markets = [...new Set([
    ...tradesForActiveView().map(researchTradeMarket),
    ...(selected?.trades || []).map(researchTradeMarket),
  ])].filter(Boolean).sort();
  els.researchLabMarket.innerHTML = [`<option value="all">全部商品</option>`, ...markets.map((market) => `<option value="${market}">${market}</option>`)].join("");
  els.researchLabMarket.value = markets.includes(previousMarket) ? previousMarket : "all";
  populateStrategySelects();
}

function renderResearchLab() {
  if (!els.researchLabBreakpoint) return;
  const selected = readResearchBreakpoints().batches.find((batch) => String(batch.id) === String(els.researchLabBreakpoint.value));
  const hasSelection = Boolean(selected);
  els.researchLabEmpty.hidden = hasSelection;
  els.researchLabContent.hidden = !hasSelection;
  if (!selected) return;
  const market = els.researchLabMarket.value;
  const matchesMarket = (trade) => market === "all" || researchTradeMarket(trade) === market;
  const strategyId = els.researchLabStrategy?.value || "all";
  const matchesStrategy = (trade) => strategyId === "all"
    || (strategyId === "unassigned" ? !trade.strategyVersionId : String(trade.strategyVersionId || "") === strategyId);
  const live = sortByDate(tradesForActiveView().filter(matchesMarket).filter(matchesStrategy));
  const backtest = sortByDate(selected.trades.filter(matchesMarket).filter(matchesStrategy));
  const liveStats = researchSummary(live);
  const backtestStats = researchSummary(backtest);
  els.researchLabMetrics.innerHTML = [
    researchMetricCard("樣本數", liveStats.count, backtestStats.count, (value) => String(value)),
    researchMetricCard("平均 R", liveStats.avgR, backtestStats.avgR, (value) => signed(value, "R")),
    researchMetricCard("勝率", liveStats.winRate, backtestStats.winRate, (value) => `${value.toFixed(1)}%`),
    researchMetricCard("最大回撤", liveStats.maxDrawdown, backtestStats.maxDrawdown, (value) => signed(value, "R"), "higher"),
  ].join("");

  const markets = [...new Set([...live.map(researchTradeMarket), ...backtest.map(researchTradeMarket)])].sort();
  const marketComparisons = markets.map((name) => {
    const liveMarket = researchSummary(live.filter((trade) => researchTradeMarket(trade) === name));
    const backtestMarket = researchSummary(backtest.filter((trade) => researchTradeMarket(trade) === name));
    return { name, live: liveMarket, backtest: backtestMarket, gap: liveMarket.avgR - backtestMarket.avgR };
  });
  els.researchMarketRows.innerHTML = marketComparisons.length
    ? marketComparisons.map((item) => `<tr><td><strong>${item.name}</strong></td><td>${item.live.count}</td><td>${signed(item.live.avgR, "R")}</td><td>${item.backtest.count}</td><td>${signed(item.backtest.avgR, "R")}</td><td class="${item.gap >= 0 ? "profit-pos" : "profit-neg"}">${signed(item.gap, "R")}</td></tr>`).join("")
    : `<tr><td colspan="6">目前沒有可比較的商品資料。</td></tr>`;

  const groupDates = (items) => items.reduce((map, trade) => {
    const date = normalizeDateValue(trade.date);
    if (!date) return map;
    const current = map.get(date) || { count: 0, r: 0 };
    current.count += 1;
    if (!trade.riskUnavailable && Number.isFinite(Number(trade.r))) current.r += Number(trade.r);
    map.set(date, current);
    return map;
  }, new Map());
  const liveDates = groupDates(live);
  const backtestDates = groupDates(backtest);
  const pairedDates = [...liveDates.keys()].filter((date) => backtestDates.has(date)).sort().reverse();
  els.researchDateRows.innerHTML = pairedDates.length
    ? pairedDates.map((date) => {
      const liveDay = liveDates.get(date);
      const backtestDay = backtestDates.get(date);
      const gap = liveDay.r - backtestDay.r;
      return `<tr><td><strong>${date}</strong></td><td>${liveDay.count}</td><td>${signed(liveDay.r, "R")}</td><td>${backtestDay.count}</td><td>${signed(backtestDay.r, "R")}</td><td class="${gap >= 0 ? "profit-pos" : "profit-neg"}">${signed(gap, "R")}</td></tr>`;
    }).join("")
    : `<tr><td colspan="6">目前沒有同日期資料；仍可使用上方整體與商品比較。</td></tr>`;

  const weakest = marketComparisons.filter((item) => item.live.count && item.backtest.count).sort((a, b) => a.gap - b.gap)[0];
  const expectancyGap = liveStats.avgR - backtestStats.avgR;
  els.researchLabInsight.innerHTML = `
    <div class="research-verdict ${expectancyGap >= 0 ? "positive" : "negative"}"><span>整體執行落差</span><strong>${signed(expectancyGap, "R / trade")}</strong><p>${expectancyGap >= 0 ? "實盤目前守住或超過回測期望值。" : "實盤期望值低於回測，優先檢查進場、出場與漏單。"}</p></div>
    <div class="research-focus"><span>優先研究商品</span><strong>${weakest?.name || "樣本不足"}</strong><p>${weakest ? `實盤比回測低 ${Math.abs(weakest.gap).toFixed(2)}R / trade。` : "至少需要一個兩邊都有紀錄的商品。"}</p></div>
    <div class="research-focus"><span>同日期配對</span><strong>${pairedDates.length} 天</strong><p>用相同市場環境檢查策略與實際執行差異。</p></div>`;

  const attribution = ATTRIBUTION_FIELDS.map(([field, label]) => ({
    field,
    label,
    value: live.reduce((sum, trade) => sum + Math.max(0, Number(trade[field]) || 0), 0),
  }));
  const attributionTotal = attribution.reduce((sum, item) => sum + item.value, 0);
  const attributionMax = Math.max(...attribution.map((item) => item.value), 0.01);
  els.researchAttribution.innerHTML = attributionTotal
    ? `<div class="attribution-total"><span>已歸因執行損失</span><strong>-${attributionTotal.toFixed(2)}R</strong></div>${attribution.map((item) => `<div class="attribution-row"><span>${item.label}</span><i><b style="width:${item.value / attributionMax * 100}%"></b></i><strong>${item.value ? `-${item.value.toFixed(2)}R` : "—"}</strong></div>`).join("")}`
    : `<div class="empty-state compact-empty">尚未在實盤復盤填寫 R 落差原因。</div>`;

  const versionIds = [...new Set([...live, ...backtest].map((trade) => trade.strategyVersionId || "unassigned"))];
  els.researchStrategyComparison.innerHTML = versionIds.length
    ? versionIds.map((id) => {
      const liveVersion = researchSummary(live.filter((trade) => String(trade.strategyVersionId || "unassigned") === String(id)));
      const backtestVersion = researchSummary(backtest.filter((trade) => String(trade.strategyVersionId || "unassigned") === String(id)));
      const gap = liveVersion.avgR - backtestVersion.avgR;
      return `<div class="strategy-compare-row"><div><strong>${escapeHtml(id === "unassigned" ? "未綁定策略" : strategyVersionLabel(id))}</strong><small>實盤 ${liveVersion.count} 筆 · 回測 ${backtestVersion.count} 筆</small></div><span>${signed(liveVersion.avgR, "R")}</span><span>${signed(backtestVersion.avgR, "R")}</span><b class="${gap >= 0 ? "profit-pos" : "profit-neg"}">${signed(gap, "R")}</b></div>`;
    }).join("")
    : `<div class="empty-state compact-empty">目前篩選條件沒有策略版本資料。</div>`;
}

function renderHomeComparisons() {
  if (!els.homeComparisonCards) return;
  const live = tradesForActiveView();
  const research = readResearchBreakpoints();
  const selected = research.batches.find((batch) => String(batch.id) === String(research.activeBatch)) || research.batches[0];
  const backtest = selected?.trades || [];
  const liveStats = researchSummary(live);
  const backtestStats = researchSummary(backtest);
  const expectancyGap = liveStats.avgR - backtestStats.avgR;
  const reviewed = live.filter((trade) => trade.reviewClass).length;
  const reviewRate = live.length ? reviewed / live.length * 100 : 0;
  const attributedR = live.reduce((sum, trade) => sum + tradeAttributionTotal(trade), 0);
  const liveDates = new Set(live.map((trade) => normalizeDateValue(trade.date)).filter(Boolean));
  const pairedDays = new Set(backtest.map((trade) => normalizeDateValue(trade.date)).filter((date) => liveDates.has(date))).size;
  els.homeComparisonCards.innerHTML = `
    <a href="../analysis-system/index.html"><span>三層差異診斷</span><strong class="${expectancyGap >= 0 ? "profit-pos" : "profit-neg"}">${backtestStats.count ? signed(expectancyGap, "R / trade") : "尚無回測"}</strong><small>回測 → 復盤 → 實盤，定位績效流失層級</small><em>進入分析系統 →</em></a>
    <a href="../review-system/index.html"><span>實盤復盤完成率</span><strong>${reviewRate.toFixed(1)}%</strong><small>${reviewed} / ${live.length} 筆 · 已歸因 ${attributedR ? `-${attributedR.toFixed(2)}R` : "—"}</small><em>進入復盤系統 →</em></a>
    <a href="../research-system/index.html"><span>歷史回測樣本</span><strong>${backtestStats.count} 筆</strong><small>${escapeHtml(selected?.name || "尚未建立斷點")} · 同日期 ${pairedDays} 天</small><em>進入回測系統 →</em></a>`;
}

function inRange(trade, start, end) {
  const date = parseTradeDate(trade);
  if (!date) return false;
  return date >= start && date <= end;
}

function tradeText(trade) {
  return `${trade.lesson || ""} ${trade.review || ""} ${trade.improvement || ""} ${trade.setup || ""} ${trade.checklist || ""}`.toLowerCase();
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
  const batchTrades = tradesForActiveView();
  const years = ["all", ...new Set(batchTrades.map((trade) => trade.year).filter(Boolean))].sort((a, b) => {
    if (a === "all") return -1;
    if (b === "all") return 1;
    return b - a;
  });
  const pairs = ["all", ...Array.from(new Set(batchTrades.map((trade) => trade.pair).filter(Boolean))).sort()];

  els.year.innerHTML = years.map((year) => `<option value="${year}">${year === "all" ? "All" : year}</option>`).join("");
  els.pair.innerHTML = pairs.map((pair) => `<option value="${pair}">${pair === "all" ? "All" : pair}</option>`).join("");

  if (current.year && years.map(String).includes(current.year)) els.year.value = current.year;
  if (current.pair && pairs.includes(current.pair)) els.pair.value = current.pair;
}

function baseFilteredTrades() {
  const query = els.search.value.trim().toLowerCase();
  return tradesForActiveView().filter((trade) => {
    const yearOk = els.year.value === "all" || String(trade.year) === els.year.value;
    const pairOk = els.pair.value === "all" || trade.pair === els.pair.value;
    const outcomeOk = els.outcome.value === "all" || trade.outcome === els.outcome.value;
    const haystack = `${trade.pair} ${trade.source} ${trade.setup || ""} ${trade.review || ""} ${trade.lesson || ""} ${trade.mambaDecision || ""} ${trade.date || ""}`.toLowerCase();
    const queryOk = !query || haystack.includes(query);
    return yearOk && pairOk && outcomeOk && queryOk;
  });
}

function filteredTrades() {
  let items = sortByDate(baseFilteredTrades());
  if (els.window.value === "week") {
    const { start, end } = getWeekRange(latestTradeDate(items));
    items = items.filter((trade) => inRange(trade, start, end));
  } else if (els.window.value === "month") {
    const currentMonth = monthKey(latestTradeDate(items));
    items = items.filter((trade) => {
      const date = parseTradeDate(trade);
      return date && monthKey(date) === currentMonth;
    });
  } else if (els.window.value !== "all") {
    items = items.slice(-Number(els.window.value));
  }

  return items;
}

function periodComparisons() {
  const items = sortByDate(baseFilteredTrades());
  const anchor = latestTradeDate(items);
  const currentWeek = getWeekRange(anchor);
  const previousWeek = getWeekRange(addDays(currentWeek.start, -1));
  const currentMonth = monthRange(anchor);
  const previousMonth = monthRange(anchor, -1);

  return [
    {
      current: items.filter((trade) => inRange(trade, currentWeek.start, currentWeek.end)),
      previous: items.filter((trade) => inRange(trade, previousWeek.start, previousWeek.end)),
      title: "本週 vs 上週",
      currentLabel: "本週",
      previousLabel: "上週",
      range: `${rangeLabel(currentWeek)} / ${rangeLabel(previousWeek)}`,
    },
    {
      current: items.filter((trade) => inRange(trade, currentMonth.start, currentMonth.end)),
      previous: items.filter((trade) => inRange(trade, previousMonth.start, previousMonth.end)),
      title: "本月 vs 上月",
      currentLabel: "本月",
      previousLabel: "上月",
      range: `${rangeLabel(currentMonth)} / ${rangeLabel(previousMonth)}`,
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

  const rItems = items.filter((trade) => !trade.riskUnavailable && trade.r != null && Number.isFinite(Number(trade.r)));
  for (const trade of rItems) {
    const tradeR = Number(trade.r);
    equity += tradeR;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak);
    currentLoss = tradeR < 0 ? currentLoss + 1 : 0;
    worstLoss = Math.max(worstLoss, currentLoss);
    currentWin = tradeR > 0 ? currentWin + 1 : 0;
    bestWin = Math.max(bestWin, currentWin);
  }

  const wins = items.filter((trade) => trade.profit > 0);
  const losses = items.filter((trade) => trade.profit < 0);
  const rWins = rItems.filter((trade) => Number(trade.r) > 0);
  const rLosses = rItems.filter((trade) => Number(trade.r) < 0);
  const decided = wins.length + losses.length;
  const totalProfit = items.reduce((sum, trade) => sum + trade.profit, 0);
  const totalR = rItems.reduce((sum, trade) => sum + Number(trade.r), 0);
  const grossWinR = rWins.reduce((sum, trade) => sum + Number(trade.r), 0);
  const grossLossR = Math.abs(rLosses.reduce((sum, trade) => sum + Number(trade.r), 0));
  const pairStats = summarizePairs(items);

  return {
    totalProfit,
    totalR,
    rTradeCount: rItems.length,
    winRate: decided ? (wins.length / decided) * 100 : 0,
    maxDd,
    worstLoss,
    bestWin,
    profitFactor: grossLossR ? grossWinR / grossLossR : grossWinR ? Infinity : 0,
    expectancy: rItems.length ? totalR / rItems.length : 0,
    averageWin: rWins.length ? grossWinR / rWins.length : 0,
    averageLoss: rLosses.length ? -grossLossR / rLosses.length : 0,
    bestPair: pairStats[0],
    worstPair: pairStats.at(-1),
  };
}

function comparisonDelta(value, formatter, inverse = false) {
  const positive = inverse ? value <= 0 : value >= 0;
  const state = value === 0 ? "" : positive ? "up" : "down";
  return `<span class="trend ${state}">${value > 0 ? "↑" : value < 0 ? "↓" : "—"} ${formatter(Math.abs(value))}</span>`;
}

function renderPeriodComparisonCards() {
  els.periodComparisonCards.innerHTML = periodComparisons().map((comparison) => {
    const current = computeStats(comparison.current);
    const previous = computeStats(comparison.previous);
    const rDelta = current.totalR - previous.totalR;
    return `
      <article class="period-compare-card">
        <div class="period-compare-head">
          <div>
            <span>${comparison.title}</span>
            <strong>${signed(current.totalR, "R")}</strong>
          </div>
          <span class="period-delta-label">差 ${comparisonDelta(rDelta, (value) => `${value.toFixed(2)}R`)}</span>
        </div>
        <dl>
          <div>
            <dt>${comparison.currentLabel} R</dt>
            <dd>${signed(current.totalR, "R")}</dd>
          </div>
          <div>
            <dt>${comparison.previousLabel} R</dt>
            <dd>${signed(previous.totalR, "R")}</dd>
          </div>
          <div>
            <dt>${comparison.currentLabel}勝率</dt>
            <dd>${current.winRate.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>${comparison.previousLabel}勝率</dt>
            <dd>${previous.winRate.toFixed(1)}%</dd>
          </div>
        </dl>
        <div class="period-compare-foot">
          <span>${comparison.current.length} vs ${comparison.previous.length} trades</span>
          <span>${comparison.currentLabel} ${current.winRate.toFixed(1)}% WR / ${comparison.previousLabel} ${previous.winRate.toFixed(1)}% WR</span>
        </div>
        <small>${comparison.range}</small>
      </article>
    `;
  }).join("");
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
  animateMetric(els.totalProfit, stats.totalProfit, money);
  els.avgProfit.textContent = `Avg ${money(items.length ? stats.totalProfit / items.length : 0)} / trade`;
  animateMetric(els.totalR, stats.totalR, (value) => signed(value, "R"));
  els.avgR.textContent = stats.rTradeCount
    ? `Avg ${signed(stats.totalR / stats.rTradeCount, "R")} / R trade`
    : "Avg - / R trade";
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
  renderPeriodComparisonCards();
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
    els.equityLatestPoint.hidden = true;
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
  els.equityLatestPoint.style.left = `${px(last.x)}px`;
  els.equityLatestPoint.style.top = `${py(last.y)}px`;
  els.equityLatestPoint.hidden = false;
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
  return baseFilteredTrades().filter((trade) => {
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
  for (const trade of baseFilteredTrades()) {
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
  const review = trade.review || trade.lesson || "尚未填寫賽後檢討。";
  return trade.improvement ? `${review} · 下次行動：${trade.improvement}` : review;
}

function renderRows(items) {
  const labels = ["日期", "編號", "商品", "結果", "損益", "R 倍數", "手數", "止損點數", "Entry", "SL", "TP", "Mamba", "Mamba R", "策略", "來源"];
  const outcomeLabels = { win: "獲利", loss: "虧損", be: "損益兩平" };
  if (els.toggleReviews) {
    els.toggleReviews.textContent = reviewsExpanded ? "收合 Review" : "展開 Review";
    els.toggleReviews.setAttribute("aria-pressed", String(reviewsExpanded));
  }
  els.rows.innerHTML = sortByDate(items)
    .reverse()
    .slice(0, 100)
    .map((trade) => {
      const isMissed = trade.recordType === "missed_opportunity" || trade.reviewClass === "missed_trade";
      const profitClass = trade.profit == null ? "" : trade.profit >= 0 ? "profit-pos" : "profit-neg";
      const mainRow = `
        <tr data-id="${trade.id}" tabindex="0">
          <td data-label="${labels[0]}"><strong>${trade.date || "-"}</strong><small>${trade.time || ""}</small></td>
          <td data-label="${labels[1]}">${trade.id}</td>
          <td data-label="${labels[2]}"><strong>${trade.pair}</strong></td>
          <td data-label="${labels[3]}"><span class="pill ${isMissed ? "be" : trade.outcome}">${isMissed ? "漏單" : outcomeLabels[trade.outcome] || String(trade.outcome || "-").toUpperCase()}</span></td>
          <td data-label="${labels[4]}" class="${profitClass}">${trade.profit == null ? "—" : money(trade.profit)}</td>
          <td data-label="${labels[5]}">${tradeRLabel(trade)}</td>
          <td data-label="${labels[6]}">${trade.lots ?? "-"}</td>
          <td data-label="${labels[7]}">${trade.slPips ?? "-"}</td>
          <td data-label="${labels[8]}">${trade.entry ?? "-"}</td>
          <td data-label="${labels[9]}">${trade.stopLoss ?? "-"}</td>
          <td data-label="${labels[10]}">${trade.takeProfit ?? "-"}</td>
          <td data-label="${labels[11]}"><span class="mamba-chip">${mambaDecisionLabel(trade.mambaDecision)}</span><small>${mambaAgreementLabel(trade)}</small></td>
          <td data-label="${labels[12]}" class="${mambaRClass(trade.mambaR)}">${mambaRLabel(trade.mambaR)}</td>
          <td data-label="${labels[13]}">${trade.setup || trade.checklist || "-"}<small>${escapeHtml(strategyVersionLabel(trade.strategyVersionId))}</small></td>
          <td data-label="${labels[14]}">${trade.origin === "local" ? (trade.partialExitCount > 1 ? `MT4 分批出場 · ${trade.partialExitCount} 段` : "手動新增") : `第 ${trade.row} 列`}</td>
        </tr>`;
      if (!reviewsExpanded) return mainRow;
      return `${mainRow}
        <tr class="review-row">
          <td colspan="15">
            <span>Review</span>
            <p><b>${reviewClassLabel(trade.reviewClass)}</b> · ${tradeReviewText(trade)}${tradeAttributionTotal(trade) ? ` · 已歸因 -${tradeAttributionTotal(trade).toFixed(2)}R` : ""}</p>
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
  runMonteCarloSimulation();
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function maxDrawdownFromBalances(balances) {
  let peak = balances[0] || 1;
  let maxDrawdown = 0;
  for (const balance of balances) {
    peak = Math.max(peak, balance);
    maxDrawdown = Math.min(maxDrawdown, peak ? ((balance - peak) / peak) * 100 : 0);
  }
  return maxDrawdown;
}

function simulateMonteCarloFromRValues(rValues, { startingBalance, riskPercent, tradeCount, runCount }) {
  const finalReturns = [];
  const finalRValues = [];
  const drawdowns = [];
  const rDrawdowns = [];
  const lossStreaks = [];
  const lossStreakRValues = [];
  const minEquityRValues = [];
  let worstRun = null;
  const checkpoints = Array.from({ length: tradeCount + 1 }, () => []);

  for (let run = 0; run < runCount; run += 1) {
    let balance = startingBalance;
    let equityR = 0;
    let peakR = 0;
    let maxRDrawdown = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;
    let currentLossStreakR = 0;
    let maxLossStreakR = 0;
    let minEquityR = 0;
    const balances = [balance];
    checkpoints[0].push(0);
    for (let tradeIndex = 1; tradeIndex <= tradeCount; tradeIndex += 1) {
      const sampledR = rValues[Math.floor(Math.random() * rValues.length)];
      balance += balance * (riskPercent / 100) * sampledR;
      equityR += sampledR;
      peakR = Math.max(peakR, equityR);
      maxRDrawdown = Math.min(maxRDrawdown, equityR - peakR);
      minEquityR = Math.min(minEquityR, equityR);
      if (sampledR < 0) {
        currentLossStreak += 1;
        currentLossStreakR += sampledR;
      } else {
        currentLossStreak = 0;
        currentLossStreakR = 0;
      }
      maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      maxLossStreakR = Math.min(maxLossStreakR, currentLossStreakR);
      balances.push(balance);
      checkpoints[tradeIndex].push(((balance - startingBalance) / startingBalance) * 100);
    }
    const finalReturn = ((balance - startingBalance) / startingBalance) * 100;
    const maxDrawdown = maxDrawdownFromBalances(balances);
    finalReturns.push(finalReturn);
    finalRValues.push(equityR);
    drawdowns.push(maxDrawdown);
    rDrawdowns.push(maxRDrawdown);
    lossStreaks.push(maxLossStreak);
    lossStreakRValues.push(maxLossStreakR);
    minEquityRValues.push(minEquityR);
    if (!worstRun || equityR < worstRun.finalR) {
      worstRun = { finalR: equityR, finalReturn, maxRDrawdown, maxDrawdown, maxLossStreak, maxLossStreakR, minEquityR };
    }
  }

  const p10 = checkpoints.map((values) => percentile(values, 0.1));
  const p50 = checkpoints.map((values) => percentile(values, 0.5));
  const p90 = checkpoints.map((values) => percentile(values, 0.9));
  const losingRuns = finalReturns.filter((value) => value < 0).length;
  return {
    runCount,
    tradeCount,
    sampleSize: rValues.length,
    riskPercent,
    p10Final: percentile(finalReturns, 0.1),
    p50Final: percentile(finalReturns, 0.5),
    p90Final: percentile(finalReturns, 0.9),
    medianDrawdown: percentile(drawdowns, 0.5),
    worstDrawdown: percentile(drawdowns, 0.1),
    losingRunRate: (losingRuns / runCount) * 100,
    p95LossStreak: percentile(lossStreaks, 0.95),
    p99LossStreak: percentile(lossStreaks, 0.99),
    p95LossStreakR: percentile(lossStreakRValues, 0.05),
    p99LossStreakR: percentile(lossStreakRValues, 0.01),
    p95RDrawdown: percentile(rDrawdowns, 0.05),
    p99RDrawdown: percentile(rDrawdowns, 0.01),
    p5FinalR: percentile(finalRValues, 0.05),
    p1FinalR: percentile(finalRValues, 0.01),
    p5MinEquityR: percentile(minEquityRValues, 0.05),
    p1MinEquityR: percentile(minEquityRValues, 0.01),
    worstRun,
    p10,
    p50,
    p90,
  };
}

function runMonteCarloSimulation() {
  const items = filteredTrades().filter((trade) => Number.isFinite(trade.r) && trade.r !== 0);
  const rValues = items.map((trade) => trade.r);
  const startingBalance = Math.max(1, Number(els.simBalance.value) || 100000);
  const riskPercent = Math.max(0.01, Math.min(100, Number(els.simRisk.value) || 1));
  const tradeCount = Math.max(10, Math.min(1000, Math.round(Number(els.simTrades.value) || 100)));
  const runCount = Math.max(100, Math.min(5000, Math.round(Number(els.simRuns.value) || 1000)));
  const research = selectedResearchRValues();
  monteCarloResult = rValues.length >= 5
    ? simulateMonteCarloFromRValues(rValues, { startingBalance, riskPercent, tradeCount, runCount })
    : { sampleSize: rValues.length, runCount, tradeCount, riskPercent };
  monteCarloResult.research = research?.values.length >= 5
    ? { label: research.label, ...simulateMonteCarloFromRValues(research.values, { startingBalance, riskPercent, tradeCount, runCount }) }
    : research ? { label: research.label, sampleSize: research.values.length } : null;
  renderMonteCarloSimulation(monteCarloResult, rValues.length);
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

function monteCarloMetricCards(result) {
  const metrics = [
    ["P10 最終報酬", `${result.p10Final >= 0 ? "+" : ""}${result.p10Final.toFixed(1)}%`, result.p10Final >= 0 ? "profit-pos" : "profit-neg"],
    ["P50 最終報酬", `${result.p50Final >= 0 ? "+" : ""}${result.p50Final.toFixed(1)}%`, result.p50Final >= 0 ? "profit-pos" : "profit-neg"],
    ["P90 最終報酬", `${result.p90Final >= 0 ? "+" : ""}${result.p90Final.toFixed(1)}%`, result.p90Final >= 0 ? "profit-pos" : "profit-neg"],
    ["虧損機率", `${result.losingRunRate.toFixed(1)}%`, result.losingRunRate >= 50 ? "profit-neg" : ""],
    ["中位最大回撤", `${result.medianDrawdown.toFixed(1)}%`, "profit-neg"],
    ["偏差最大回撤", `${result.worstDrawdown.toFixed(1)}%`, "profit-neg"],
  ];
  return metrics.map(([label, value, className = ""]) => `
    <div><span>${label}</span><strong class="${className}">${value}</strong></div>
  `).join("");
}

function monteCarloStressBlock(result, sourceLabel) {
  return `
    <div class="stress-heading">
      <div>
        <h3>極端虧損範圍</h3>
        <p>${sourceLabel}，觀察尾端壓力與策略走偏警戒線。</p>
      </div>
      <strong>${result.tradeCount} trades / run</strong>
    </div>
    <div class="stress-grid">
      <div><span>95% 連敗壓力</span><strong>${Math.ceil(result.p95LossStreak)} 連敗</strong><small>${signed(result.p95LossStreakR, "R")} 連續虧損 R</small></div>
      <div><span>99% 連敗壓力</span><strong>${Math.ceil(result.p99LossStreak)} 連敗</strong><small>${signed(result.p99LossStreakR, "R")} 連續虧損 R</small></div>
      <div><span>95% 最大 R 回撤</span><strong>${signed(result.p95RDrawdown, "R")}</strong><small>資金低點 ${signed(result.p5MinEquityR, "R")}</small></div>
      <div><span>99% 最大 R 回撤</span><strong>${signed(result.p99RDrawdown, "R")}</strong><small>資金低點 ${signed(result.p1MinEquityR, "R")}</small></div>
      <div><span>5% 最差期末</span><strong>${signed(result.p5FinalR, "R")}</strong><small>100 條裡約 5 條低於此區</small></div>
      <div><span>1% 最差期末</span><strong>${signed(result.p1FinalR, "R")}</strong><small>100 條裡約 1 條低於此區</small></div>
    </div>
    <div class="stress-worst">
      <span>本次最差路徑</span>
      <strong>${signed(result.worstRun.finalR, "R")} / ${result.worstRun.finalReturn.toFixed(1)}%</strong>
      <small>最大 R 回撤 ${signed(result.worstRun.maxRDrawdown, "R")} · 最長 ${result.worstRun.maxLossStreak} 連敗 · 連敗段 ${signed(result.worstRun.maxLossStreakR, "R")}</small>
    </div>
  `;
}

function colorMonteCarloStress(container) {
  container.querySelectorAll(".stress-grid strong, .stress-worst strong").forEach((strong) => {
    const text = strong.textContent.trim();
    strong.classList.toggle("profit-pos", text.startsWith("+"));
    strong.classList.toggle("profit-neg", text.startsWith("-"));
  });
}

function drawMonteCarloChart(canvas, result) {
  const styles = getComputedStyle(document.body);
  drawLineChart(canvas, [
    { values: result.p90, color: styles.getPropertyValue("--win").trim(), width: 2, dash: [6, 6] },
    { values: result.p50, color: styles.getPropertyValue("--accent").trim(), width: 3 },
    { values: result.p10, color: styles.getPropertyValue("--loss").trim(), width: 2, dash: [6, 6] },
  ], { height: 300 });
}

function renderMonteCarloPanel({ result, sampleSize = 0, metricsEl, formulaEl, chartEl, stressEl, emptyLabel, stressLabel }) {
  if (!result || result.sampleSize < 5 || !result.worstRun) {
    metricsEl.innerHTML = `
      <div><span>Monte Carlo</span><strong>資料不足</strong></div>
      <div><span>可用 R 樣本</span><strong>${sampleSize || result?.sampleSize || 0}</strong></div>
    `;
    stressEl.innerHTML = "";
    formulaEl.textContent = emptyLabel;
    drawLineChart(chartEl, [{ values: [0], color: getComputedStyle(document.body).getPropertyValue("--muted").trim(), width: 2 }], { height: 300 });
    return;
  }

  metricsEl.innerHTML = monteCarloMetricCards(result);
  formulaEl.textContent = `${result.runCount} runs · ${result.tradeCount} trades · ${result.sampleSize} R samples · ${result.riskPercent}% risk`;
  stressEl.innerHTML = monteCarloStressBlock(result, stressLabel);
  colorMonteCarloStress(stressEl);
  drawMonteCarloChart(chartEl, result);
}

function renderMonteCarloSimulation(result, sampleSize = 0) {
  renderMonteCarloPanel({
    result,
    sampleSize,
    metricsEl: els.monteCarloMetrics,
    formulaEl: els.monteCarloFormula,
    chartEl: els.monteCarloChart,
    stressEl: els.monteCarloStress,
    emptyLabel: "至少需要 5 筆非 0R 實盤交易",
    stressLabel: "使用目前交易紀錄 R 分布重抽樣",
  });

  renderMonteCarloPanel({
    result: result?.research,
    sampleSize: result?.research?.sampleSize || 0,
    metricsEl: els.researchMonteCarloMetrics,
    formulaEl: els.researchMonteCarloFormula,
    chartEl: els.researchMonteCarloChart,
    stressEl: els.researchMonteCarloStress,
    emptyLabel: result?.research ? "回測斷點至少需要 5 筆非 0R 樣本" : "請選擇回測斷點",
    stressLabel: result?.research?.label ? `使用回測斷點「${result.research.label}」R 分布重抽樣` : "使用回測斷點 R 分布重抽樣",
  });

  els.monteCarloCompare.innerHTML = renderResearchMonteCarloComparison(result);
}

function renderResearchMonteCarloComparison(result) {
  if (!result?.research) {
    return `<div class="research-compare-empty"><strong>尚未選擇回測斷點</strong><span>先在上方選擇斷點，再按重新模擬。</span></div>`;
  }
  if (!result.worstRun) {
    return `<div class="research-compare-empty"><strong>實盤資料不足</strong><span>實盤至少需要 5 筆非 0R 交易，才能和回測比較。</span></div>`;
  }
  if (result.research.sampleSize < 5 || !result.research.worstRun) {
    return `<div class="research-compare-empty"><strong>${result.research.label}</strong><span>回測斷點只有 ${result.research.sampleSize} 筆非 0R 樣本，至少需要 5 筆才能比較。</span></div>`;
  }

  const research = result.research;
  const rows = [
    ["P50 期末 R", result.p50[result.p50.length - 1], research.p50[research.p50.length - 1], "higher"],
    ["P10 期末 R", result.p10[result.p10.length - 1], research.p10[research.p10.length - 1], "higher"],
    ["99% 最大 R 回撤", result.p99RDrawdown, research.p99RDrawdown, "higher"],
    ["99% 連敗壓力", result.p99LossStreak, research.p99LossStreak, "lower"],
    ["99% 連敗段 R", result.p99LossStreakR, research.p99LossStreakR, "higher"],
    ["虧損機率", result.losingRunRate, research.losingRunRate, "lower"],
  ];
  return `
    <div class="research-compare-grid">
      ${rows.map(([label, live, backtest, direction]) => {
        const delta = live - backtest;
        const improved = direction === "lower" ? delta <= 0 : delta >= 0;
        const className = delta === 0 ? "" : improved ? "profit-pos" : "profit-neg";
        const formatter = label.includes("機率") ? (value) => `${value.toFixed(1)}%` : label.includes("連敗壓力") ? (value) => `${Math.ceil(value)} 連敗` : (value) => signed(value, "R");
        return `
          <div>
            <span>${label}</span>
            <strong class="${className}">${formatter(live)}</strong>
            <small>回測 ${formatter(backtest)} · 差 ${label.includes("機率") ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp` : label.includes("連敗壓力") ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} 次` : signed(delta, "R")}</small>
          </div>
        `;
      }).join("")}
    </div>
  `;
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

function closeImagePreview() {
  document.querySelector(".image-lightbox")?.remove();
}

function openImagePreview(src, label = "交易截圖") {
  closeImagePreview();
  const preview = document.createElement("div");
  preview.className = "image-lightbox";
  preview.innerHTML = `
    <button type="button" class="image-lightbox-close" aria-label="關閉截圖預覽">×</button>
    <img src="${src}" alt="${label}">
  `;
  preview.addEventListener("click", (event) => {
    if (event.target === preview || event.target.closest(".image-lightbox-close")) closeImagePreview();
  });
  document.body.appendChild(preview);
}

function openTradeDetail(trade) {
  currentDetailId = trade.id;
  const profitClass = trade.profit == null ? "" : trade.profit >= 0 ? "profit-pos" : "profit-neg";
  const metric = (value, suffix = "", digits = 2) => Number.isFinite(Number(value))
    ? `${Number(value).toFixed(digits)}${suffix}`
    : "-";
  const hasMt4Metrics = Boolean(trade.externalId || trade.source === "TradingNote MT4 EA");
  const mt4Metrics = hasMt4Metrics ? `
    <div class="detail-section-heading">
      <span>MT4 EA 執行分析</span>
      <small>${trade.account || "-"} · Ticket ${trade.ticket || "-"}</small>
    </div>
    <div class="detail-stats ea-detail-stats">
      <div><span>MFE</span><strong class="profit-pos">${metric(trade.mfeR, "R")}</strong></div>
      <div><span>MAE</span><strong class="profit-neg">${metric(trade.maeR, "R")}</strong></div>
      <div><span>出場效率</span><strong>${metric(trade.exitEfficiencyPct, "%", 1)}</strong></div>
      <div><span>Gross R</span><strong>${metric(trade.grossR, "R")}</strong></div>
    </div>
    <dl class="detail-list ea-detail-list">
      <dt>Gross P/L</dt><dd>${trade.grossProfit == null ? "-" : money(trade.grossProfit)}</dd>
      <dt>Commission</dt><dd>${trade.commission == null ? "-" : money(trade.commission)}</dd>
      <dt>Swap</dt><dd>${trade.swap == null ? "-" : money(trade.swap)}</dd>
      <dt>初始風險</dt><dd>${trade.initialRiskMoney == null ? "-" : money(trade.initialRiskMoney)}</dd>
      <dt>Spread</dt><dd>進 ${metric(trade.entrySpreadPoints, " pt", 1)} · 出 ${metric(trade.exitSpreadPoints, " pt", 1)} · 最大 ${metric(trade.maxSpreadPoints, " pt", 1)}</dd>
      <dt>估算 Spread 成本</dt><dd>${trade.spreadCostEstimate == null ? "-" : money(trade.spreadCostEstimate)}</dd>
      <dt>出場原因／滑價</dt><dd>${trade.exitReason || "-"} · ${metric(trade.exitSlippagePoints, " pt", 1)}</dd>
      <dt>市場環境</dt><dd>${[trade.regime, trade.volatility, trade.htfAlignment].filter(Boolean).join(" · ") || "-"}</dd>
      <dt>Session</dt><dd>${trade.session || "-"}${trade.brokerUtcOffset == null ? "" : ` · UTC${Number(trade.brokerUtcOffset) >= 0 ? "+" : ""}${trade.brokerUtcOffset}`}</dd>
      <dt>資料品質</dt><dd>${captureQualityLabel(trade.captureQuality)}</dd>
    </dl>
  ` : "";
  const imageBlock = trade.image
    ? `<figure class="detail-image"><button type="button" class="detail-image-button" data-preview-image="${trade.id}" aria-label="放大交易截圖"><img src="${trade.image}" alt="${trade.pair} 交易截圖"><span>點擊放大</span></button><figcaption>交易截圖</figcaption></figure>`
    : "";
  els.detail.innerHTML = `
    <p class="eyebrow">${trade.origin === "local" ? "Local trade" : `${trade.source} · row ${trade.row}`}</p>
    <h2>${trade.pair} · ${trade.recordType === "missed_opportunity" ? "漏單" : String(trade.outcome || "-").toUpperCase()}</h2>
    <div class="detail-stats">
      <div><span>P/L</span><strong class="${profitClass}">${trade.profit == null ? "—" : money(trade.profit)}</strong></div>
      <div><span>R</span><strong>${tradeRLabel(trade)}</strong></div>
      <div><span>Lots</span><strong>${trade.lots ?? "-"}</strong></div>
      <div><span>SL pips</span><strong>${trade.slPips ?? "-"}</strong></div>
    </div>
    <dl class="detail-list">
      <dt>Date</dt><dd>${trade.date || "-"} ${trade.time || ""}</dd>
      <dt>斷點</dt><dd>${liveBatchLabel(trade.batchId)}</dd>
      <dt>Year</dt><dd>${trade.year || "-"}</dd>
      <dt>Direction</dt><dd>${trade.direction || "-"}</dd>
      <dt>Entry</dt><dd>${trade.entry ?? "-"}</dd>
      <dt>SL</dt><dd>${trade.stopLoss ?? "-"}</dd>
      <dt>TP</dt><dd>${trade.takeProfit ?? "-"}</dd>
      <dt>Exit</dt><dd>${trade.exitPrice ?? "-"}</dd>
      <dt>Mamba</dt><dd>${mambaDecisionLabel(trade.mambaDecision)} · ${mambaAgreementLabel(trade)}</dd>
      <dt>Mamba R</dt><dd>${mambaRLabel(trade.mambaR)}</dd>
      <dt>策略版本</dt><dd>${escapeHtml(strategyVersionLabel(trade.strategyVersionId))}</dd>
      <dt>復盤分類</dt><dd>${reviewClassLabel(trade.reviewClass)}</dd>
      <dt>紀錄類型</dt><dd>${trade.recordType === "missed_opportunity" ? "符合策略但漏單" : "實際交易"}</dd>
      <dt>已歸因 R 落差</dt><dd>${tradeAttributionTotal(trade) ? `-${tradeAttributionTotal(trade).toFixed(2)}R` : "尚未歸因"}</dd>
      <dt>Setup</dt><dd>${trade.setup || trade.checklist || "-"}</dd>
      <dt>Review</dt><dd>${trade.review || trade.lesson || "尚未填寫賽後檢討。"}</dd>
      <dt>下次改善</dt><dd>${trade.improvement || "尚未填寫改善行動。"}</dd>
    </dl>
    ${mt4Metrics}
    ${imageBlock}
    ${isAllLiveView()
      ? `<div class="drawer-actions"><p class="form-hint">完整紀錄為只讀彙總；請切換到「${liveBatchLabel(trade.batchId)}」後再編輯或刪除。</p></div>`
      : `<div class="drawer-actions">
          <button type="button" class="primary-button" data-trade-action="edit">編輯交易</button>
          <button type="button" class="ghost-button danger-button" data-trade-action="delete">刪除交易</button>
        </div>`}
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
  const profit = data.get("profit") === "" ? null : Number(data.get("profit"));
  const r = data.get("r") === "" ? null : Number(data.get("r"));
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
    recordType: data.get("recordType") || "trade",
    strategyVersionId: String(data.get("strategyVersionId") || ""),
    reviewClass: String(data.get("reviewClass") || ""),
    profit,
    r,
    lots: data.get("lots") === "" ? null : Number(data.get("lots")),
    slPips: data.get("slPips") === "" ? null : Number(data.get("slPips")),
    entry: numericOrNull("entry"),
    stopLoss: numericOrNull("stopLoss"),
    takeProfit: profit > 0 ? exitPrice : null,
    exitPrice,
    mambaDecision: String(data.get("mambaDecision") || "").trim(),
    mambaR: numericOrNull("mambaR"),
    batchId: data.get("batchId") || activeLiveBatch || "live-default",
    image: currentTradeImage || "",
    setup: String(data.get("setup") || "").trim(),
    review: String(data.get("review") || "").trim(),
    ...Object.fromEntries(ATTRIBUTION_FIELDS.map(([field]) => [field, numericOrNull(field)])),
    source: "Manual Entry",
  };
}

function resetTradeForm() {
  els.tradeForm.reset();
  els.tradeForm.elements.localId.value = "";
  els.tradeForm.elements.baseKey.value = "";
  els.tradeForm.elements.batchId.value = activeLiveBatch || "live-default";
  els.tradeForm.elements.year.value = new Date().getFullYear();
  els.tradeForm.elements.date.value = isoDate(new Date());
  els.tradeForm.elements.time.value = new Date().toTimeString().slice(0, 5);
  els.tradeForm.elements.pair.value = "NAS100";
  els.tradeForm.elements.mambaDecision.value = "";
  els.tradeForm.elements.mambaR.value = "";
  els.tradeForm.elements.recordType.value = "trade";
  els.tradeForm.elements.reviewClass.value = "";
  populateStrategySelects();
  els.tradeImageInput.value = "";
  updateTradeImagePreview("");
  delete els.tradeForm.elements.r.dataset.autoCalculated;
  els.dialogTitle.textContent = "新增交易";
  els.dialogSubtitle.textContent = `記錄核心欄位，將存到「${liveBatchLabel(activeLiveBatch)}」。`;
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
  populateStrategySelects();
  const fields = ["localId", "batchId", "year", "date", "time", "pair", "direction", "outcome", "recordType", "strategyVersionId", "profit", "r", "lots", "entry", "stopLoss", "exitPrice", "slPips", "mambaDecision", "mambaR", "setup", "reviewClass", "review", "improvement", ...ATTRIBUTION_FIELDS.map(([field]) => field)];
  for (const field of fields) {
    const input = els.tradeForm.elements[field];
    if (input) input.value = editable[field] ?? "";
  }
  els.tradeImageInput.value = "";
  updateTradeImagePreview(editable.image || "");
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
  populateLiveBatchOptions();
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
  const batchTotal = tradesForActiveView().length;
  els.filterSummary.textContent = `${liveBatchLabel(activeLiveBatch)} · 顯示 ${items.length} / ${batchTotal} 筆交易${activeCount ? ` · ${activeCount} 個條件` : ""}`;
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
  renderStrategyVersions();
  renderHomeComparisons();
  populateResearchLabControls();
  renderResearchLab();
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
  if (nextPage === "dashboard" || nextPage === "objectives" || nextPage === "analytics" || nextPage === "review" || nextPage === "strategy" || nextPage === "research-lab") render();
  if (nextPage === "research-lab") window.requestAnimationFrame(() => renderMonteCarloSimulation(monteCarloResult));
  if (nextPage === "calculator") renderReturnSimulation();
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function exportFilteredCsv() {
  const items = filteredTrades();
  const headers = ["id", "breakpointId", "breakpointName", "externalId", "account", "ticket", "magicNumber", "date", "time", "closeTime", "year", "pair", "direction", "outcome", "profit", "r", "grossProfit", "commission", "swap", "lots", "slPips", "entry", "stopLoss", "takeProfit", "exitPrice", "initialRiskMoney", "grossR", "mfeR", "maeR", "exitEfficiencyPct", "entrySpreadPoints", "exitSpreadPoints", "maxSpreadPoints", "spreadCostEstimate", "exitReason", "exitSlippagePoints", "regime", "volatility", "htfAlignment", "session", "captureQuality", "mambaDecision", "mambaR", "setup", "checklist", "source", "row", "lesson", "review", "improvement"];
  const rows = [
    headers.join(","),
    ...items.map((trade) => headers.map((key) => csvEscape(
      key === "breakpointId" ? trade.batchId : key === "breakpointName" ? liveBatchLabel(trade.batchId) : trade[key],
    )).join(",")),
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

function backupTradeRecord(trade) {
  const { id, origin, baseKey, ...record } = trade;
  return record;
}

function fingerprintNumber(value, digits = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "";
}

function tradeIdentityFingerprint(trade) {
  const externalId = String(trade.externalId || "").trim();
  if (externalId) return externalId;
  if (trade.ticket != null && String(trade.ticket).trim()) {
    return `MT4:${String(trade.account || "unknown").trim()}:${String(trade.ticket).trim()}`;
  }
  const date = normalizeDateValue(trade.date);
  const time = normalizeTimeValue(trade.time);
  const pair = String(trade.pair || trade.market || "").trim().toUpperCase();
  const profit = fingerprintNumber(trade.profit, 2);
  if (time) return [date, time, pair, profit].join("::");
  return [date, pair, profit, fingerprintNumber(trade.entry, 2), fingerprintNumber(trade.r, 2)].join("::");
}

function smartTradeFingerprint(trade) {
  return `${trade.batchId || "live-default"}::${tradeIdentityFingerprint(trade)}`;
}

function prepareBackupTrade(trade) {
  const record = backupTradeRecord(trade);
  return {
    ...record,
    localId: record.localId || crypto.randomUUID(),
    date: normalizeDateValue(record.date),
    time: normalizeTimeValue(record.time),
    pair: String(record.pair || record.market || "").trim().toUpperCase(),
    batchId: record.batchId || activeLiveBatch || "live-default",
    source: record.source || "Smart backup import",
  };
}

function tradeRLabel(trade) {
  return trade.riskUnavailable || trade.r == null || !Number.isFinite(Number(trade.r)) ? "-" : signed(trade.r, "R");
}

function captureQualityLabel(value) {
  const labels = {
    complete: "完整",
    attached_mid_trade: "EA 於持倉中途啟動",
    resumed_after_restart: "EA 重啟後續記",
    missing_initial_sl: "缺少初始 SL，無法計算 R / MFE / MAE",
  };
  if (!value) return "未標記";
  return String(value).split("+").map((part) => labels[part] || part).join(" · ");
}

function moveTradeKey(trade) {
  const value = trade.origin === "local" ? trade.localId : trade.baseKey;
  return `${trade.origin === "local" ? "local" : "excel"}:${encodeURIComponent(String(value || ""))}`;
}

function selectedMoveTradeKeys() {
  return [...els.moveTradesList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function updateMoveTradesPreview() {
  const selected = selectedMoveTradeKeys();
  const target = liveBatches.find((batch) => batch.id === els.moveTradesTarget.value);
  els.confirmMoveTrades.disabled = !selected.length || !target;
  els.moveTradesSelectAll.checked = Boolean(moveTradeCandidates.size) && selected.length === moveTradeCandidates.size;
  els.moveTradesSelectAll.indeterminate = selected.length > 0 && selected.length < moveTradeCandidates.size;
  els.moveTradesPreview.innerHTML = selected.length
    ? `<strong>${selected.length} 筆交易 → ${target?.name || "請選擇目的斷點"}</strong><span>完成後會切換到目的斷點；若目的地已有同一筆交易，會合併而不產生副本。</span>`
    : "<strong>尚未選擇交易</strong><span>移動後原始交易不會同時留在兩個斷點。</span>";
}

function openMoveTradesDialog() {
  if (!requireWritableLiveBatch()) return;
  const candidates = sortByDate(tradesInActiveBatch()).reverse();
  moveTradeCandidates = new Map(candidates.map((trade) => [moveTradeKey(trade), trade]));
  const targets = liveBatches.filter((batch) => batch.id !== activeLiveBatch);
  els.moveTradesSubtitle.textContent = `來源：${liveBatchLabel(activeLiveBatch)}（${candidates.length} 筆）`;
  els.moveTradesTarget.innerHTML = targets.length
    ? targets.map((batch) => `<option value="${batch.id}">${batch.name}</option>`).join("")
    : '<option value="">請先建立另一個斷點</option>';
  els.moveTradesTarget.disabled = !targets.length;
  els.moveTradesSelectAll.checked = false;
  els.moveTradesSelectAll.disabled = !candidates.length;
  els.moveTradesList.innerHTML = candidates.length
    ? candidates.map((trade) => `
      <label class="move-trade-row">
        <input type="checkbox" value="${moveTradeKey(trade)}" />
        <span><b>${trade.date || "-"} · ${trade.pair || "-"}</b><small>${trade.direction || "-"} · ${tradeRLabel(trade)} · ${trade.source || "Manual Entry"}</small></span>
        <strong class="${Number(trade.profit) >= 0 ? "profit-pos" : "profit-neg"}">${money(trade.profit)}</strong>
      </label>`).join("")
    : '<div class="empty-state"><strong>目前斷點沒有交易</strong><span>切換到有交易的斷點後再使用批次移動。</span></div>';
  updateMoveTradesPreview();
  els.moveTradesDialog.showModal();
}

function moveSelectedTradesToBreakpoint() {
  const keys = selectedMoveTradeKeys();
  const targetBatchId = els.moveTradesTarget.value;
  if (!keys.length || !targetBatchId || targetBatchId === activeLiveBatch) return { moved: 0, merged: 0 };
  const destinationKeys = new Set(
    trades
      .filter((trade) => (trade.batchId || "live-default") === targetBatchId)
      .map((trade) => smartTradeFingerprint({ ...trade, batchId: targetBatchId })),
  );
  let moved = 0;
  let merged = 0;
  for (const key of keys) {
    const trade = moveTradeCandidates.get(key);
    if (!trade) continue;
    const destinationKey = smartTradeFingerprint({ ...trade, batchId: targetBatchId });
    const alreadyExists = destinationKeys.has(destinationKey);
    if (trade.origin === "local") {
      const index = localTrades.findIndex((item) => item.localId === trade.localId);
      if (index < 0) continue;
      if (alreadyExists) localTrades.splice(index, 1);
      else localTrades[index] = { ...localTrades[index], batchId: targetBatchId };
    } else {
      if (!alreadyExists) localTrades.push(cloneTradeForBatch(trade, targetBatchId));
      if (trade.baseKey) deletedTrades.add(trade.baseKey);
    }
    destinationKeys.add(destinationKey);
    if (alreadyExists) merged += 1;
    else moved += 1;
  }
  saveLocalTrades();
  activeLiveBatch = targetBatchId;
  saveLiveBatches();
  els.moveTradesDialog.close();
  refreshAfterDataChange();
  animateBatchControl();
  return { moved, merged };
}

function prepareTradeForActiveBatch(trade, fallbackSource = "Import") {
  if (isAllLiveView()) throw new Error("請先切換到一個斷點，再匯入交易資料。");
  const { localId, batchId, ...record } = trade || {};
  return prepareBackupTrade({
    ...record,
    localId: crypto.randomUUID(),
    batchId: activeLiveBatch || "live-default",
    source: record.source || fallbackSource,
  });
}

function tradesInActiveBatch(items = trades) {
  return items.filter((trade) => (trade.batchId || "live-default") === activeLiveBatch);
}

function mergeMissingRecords(existing, incoming, fingerprint, idKey = "id") {
  const merged = [...existing];
  const ids = new Set(existing.map((item) => item?.[idKey]).filter(Boolean).map(String));
  const fingerprints = new Set(existing.map(fingerprint).filter(Boolean));
  let added = 0;
  for (const item of incoming) {
    if (!item) continue;
    const id = item[idKey] == null ? "" : String(item[idKey]);
    const key = fingerprint(item);
    if ((id && ids.has(id)) || (key && fingerprints.has(key))) continue;
    merged.push(item);
    if (id) ids.add(id);
    if (key) fingerprints.add(key);
    added += 1;
  }
  return { merged, added };
}

function researchTradeFingerprint(trade) {
  return [trade.date, trade.market, trade.session, trade.setup, trade.mine, trade.mentor, fingerprintNumber(trade.r, 4), String(trade.notes || "").trim().toLowerCase()].join("::");
}

function ruleFingerprint(rule) {
  return String(rule.title || rule.id || "").trim().toLowerCase();
}

function batchFingerprint(batch) {
  return String(batch.name || batch.id || "").trim().toLowerCase();
}

function storedArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function exportFullBackup() {
  const researchTrades = JSON.parse(localStorage.getItem(RESEARCH_TRADE_KEY) || "null");
  const researchRules = JSON.parse(localStorage.getItem(RESEARCH_RULE_KEY) || "null") || DEFAULT_RESEARCH_RULES;
  const legacyResearchTrades = JSON.parse(localStorage.getItem(LEGACY_RESEARCH_TRADE_KEY) || "null");
  const legacyResearchRules = JSON.parse(localStorage.getItem(LEGACY_RESEARCH_RULE_KEY) || "null") || DEFAULT_LEGACY_RESEARCH_RULES;
  const legacyResearchBatches = JSON.parse(localStorage.getItem(LEGACY_RESEARCH_BATCH_KEY) || "null");
  const legacyResearchActiveBatch = localStorage.getItem(LEGACY_RESEARCH_ACTIVE_BATCH_KEY);
  const visibleSnapshot = uniqueTrades(trades.map(backupTradeRecord));
  const backup = {
    app: "TradingNoteAll",
    version: 4,
    exportedAt: new Date().toISOString(),
    suggestedFolder: "backups",
    live: {
      localTrades,
      liveBatches,
      activeLiveBatch,
      visibleTrades: visibleSnapshot,
      deletedTrades: Array.from(deletedTrades),
      accountRules,
      strategyVersions,
    },
    research: {
      trades: Array.isArray(researchTrades) ? researchTrades : null,
      rules: Array.isArray(researchRules) ? researchRules : DEFAULT_RESEARCH_RULES,
      legacyTrades: Array.isArray(legacyResearchTrades) ? legacyResearchTrades : null,
      legacyRules: Array.isArray(legacyResearchRules) ? legacyResearchRules : DEFAULT_LEGACY_RESEARCH_RULES,
      legacyBatches: Array.isArray(legacyResearchBatches) ? legacyResearchBatches : null,
      legacyActiveBatch: legacyResearchActiveBatch || null,
    },
  };
  const researchCount = (backup.research.trades?.length || 0) + (backup.research.legacyTrades?.length || 0);
  downloadFile(`backups_tradingnote-all-${isoDate(new Date())}.json`, JSON.stringify(backup, null, 2), "application/json");
  const ruleCount = (backup.research.rules?.length || 0) + (backup.research.legacyRules?.length || 0);
  showToast(`已建立完整快照：${liveBatches.length} 個實盤斷點、${visibleSnapshot.length} 筆斷點交易、回測 ${researchCount} 筆、Rule Book ${ruleCount} 條。`);
}

function restoreUnifiedBackup(payload, mode = "merge") {
  const isUnified = payload?.app === "TradingNoteAll" || payload?.live || payload?.research;
  const livePayload = isUnified ? payload.live || {} : payload;
  const researchPayload = isUnified ? payload.research || {} : {};

  const incomingTrades = Array.isArray(livePayload.visibleTrades)
    ? livePayload.visibleTrades
    : Array.isArray(livePayload.localTrades) ? livePayload.localTrades : [];
  let liveAdded = 0;
  let researchAdded = 0;
  let rulesAdded = 0;
  let strategiesAdded = 0;

  if (mode === "replace") {
    localTrades = incomingTrades.map(prepareBackupTrade);
    deletedTrades = Array.isArray(livePayload.visibleTrades)
      ? new Set(importedTrades.map(baseTradeKey))
      : new Set(Array.isArray(livePayload.deletedTrades) ? livePayload.deletedTrades : []);
    if (livePayload.accountRules) accountRules = { ...accountRules, ...livePayload.accountRules };
    strategyVersions = Array.isArray(livePayload.strategyVersions) ? livePayload.strategyVersions : [];
    if (Array.isArray(livePayload.liveBatches)) liveBatches = livePayload.liveBatches;
    if (livePayload.activeLiveBatch) activeLiveBatch = livePayload.activeLiveBatch;
    if (Array.isArray(researchPayload.trades)) localStorage.setItem(RESEARCH_TRADE_KEY, JSON.stringify(researchPayload.trades));
    if (Array.isArray(researchPayload.rules)) localStorage.setItem(RESEARCH_RULE_KEY, JSON.stringify(researchPayload.rules));
    if (Array.isArray(researchPayload.legacyTrades)) localStorage.setItem(LEGACY_RESEARCH_TRADE_KEY, JSON.stringify(researchPayload.legacyTrades));
    if (Array.isArray(researchPayload.legacyRules)) localStorage.setItem(LEGACY_RESEARCH_RULE_KEY, JSON.stringify(researchPayload.legacyRules));
    if (Array.isArray(researchPayload.legacyBatches)) localStorage.setItem(LEGACY_RESEARCH_BATCH_KEY, JSON.stringify(researchPayload.legacyBatches));
    if (researchPayload.legacyActiveBatch) localStorage.setItem(LEGACY_RESEARCH_ACTIVE_BATCH_KEY, researchPayload.legacyActiveBatch);
  } else {
    const visibleFingerprints = new Set(trades.map(smartTradeFingerprint));
    const incomingUnique = [];
    for (const trade of incomingTrades) {
      const key = smartTradeFingerprint(trade);
      if (!key || visibleFingerprints.has(key)) continue;
      visibleFingerprints.add(key);
      incomingUnique.push(prepareBackupTrade(trade));
    }
    localTrades.push(...incomingUnique);
    liveAdded = incomingUnique.length;
    if (livePayload.accountRules) accountRules = { ...livePayload.accountRules, ...accountRules };
    if (Array.isArray(livePayload.strategyVersions)) {
      const result = mergeMissingRecords(strategyVersions, livePayload.strategyVersions, (item) => `${String(item.name || "").trim().toLowerCase()}::${String(item.version || "").trim().toLowerCase()}`);
      strategyVersions = result.merged;
      strategiesAdded = result.added;
    }
    if (Array.isArray(livePayload.liveBatches)) {
      const result = mergeMissingRecords(liveBatches, livePayload.liveBatches, batchFingerprint);
      liveBatches = result.merged;
    }
    if (livePayload.activeLiveBatch === ALL_LIVE_BATCH_ID || (livePayload.activeLiveBatch && liveBatches.some((batch) => batch.id === livePayload.activeLiveBatch))) {
      activeLiveBatch = livePayload.activeLiveBatch;
    }

    if (Array.isArray(researchPayload.trades)) {
      const result = mergeMissingRecords(storedArray(RESEARCH_TRADE_KEY), researchPayload.trades, researchTradeFingerprint);
      localStorage.setItem(RESEARCH_TRADE_KEY, JSON.stringify(result.merged));
      researchAdded += result.added;
    }
    if (Array.isArray(researchPayload.rules)) {
      const result = mergeMissingRecords(storedArray(RESEARCH_RULE_KEY), researchPayload.rules, ruleFingerprint);
      localStorage.setItem(RESEARCH_RULE_KEY, JSON.stringify(result.merged));
      rulesAdded += result.added;
    }
    if (Array.isArray(researchPayload.legacyTrades)) {
      const result = mergeMissingRecords(storedArray(LEGACY_RESEARCH_TRADE_KEY), researchPayload.legacyTrades, researchTradeFingerprint);
      localStorage.setItem(LEGACY_RESEARCH_TRADE_KEY, JSON.stringify(result.merged));
      researchAdded += result.added;
    }
    if (Array.isArray(researchPayload.legacyRules)) {
      const result = mergeMissingRecords(storedArray(LEGACY_RESEARCH_RULE_KEY), researchPayload.legacyRules, ruleFingerprint);
      localStorage.setItem(LEGACY_RESEARCH_RULE_KEY, JSON.stringify(result.merged));
      rulesAdded += result.added;
    }
    if (Array.isArray(researchPayload.legacyBatches)) {
      const result = mergeMissingRecords(storedArray(LEGACY_RESEARCH_BATCH_KEY), researchPayload.legacyBatches, batchFingerprint);
      localStorage.setItem(LEGACY_RESEARCH_BATCH_KEY, JSON.stringify(result.merged));
    }
  }

  saveAccountRules();
  saveStrategyVersions();
  populateAccountRulesForm();
  saveLocalTrades();
  if (activeLiveBatch !== ALL_LIVE_BATCH_ID && !liveBatches.some((batch) => batch.id === activeLiveBatch)) {
    activeLiveBatch = liveBatches[0]?.id || "live-default";
  }
  saveLiveBatches();
  refreshAfterDataChange();
  showToast(mode === "replace"
    ? `強制覆蓋完成：目前實盤 ${trades.length} 筆。`
    : `智慧合併完成：新增實盤 ${liveAdded} 筆、回測 ${researchAdded} 筆、策略版本 ${strategiesAdded} 個、規則 ${rulesAdded} 條；重複資料已略過。`);
}

async function importBackupFile(file, mode = "merge") {
  const payload = JSON.parse(await file.text());
  const hasBackupShape = payload?.app === "TradingNoteAll" || payload?.app === "TradingNote" || payload?.live || Array.isArray(payload?.localTrades);
  if (!hasBackupShape) throw new Error("這不是 TradingNote 備份 JSON。");
  if (mode === "replace") {
    const phrase = window.prompt("強制覆蓋會先下載目前完整備份，然後以選取檔案重建所有本機資料。\n\n請輸入「覆蓋」確認：");
    if (phrase !== "覆蓋") return;
    exportFullBackup();
  }
  restoreUnifiedBackup(payload, mode);
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

function parseMt4Journal(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((value) => value.trim());
  const normalized = new Set(headers.map(normalizeHeader));
  if (!normalized.has("ticket") || !normalized.has("account") || !normalized.has("symbol")) {
    throw new Error("這不是 TradingNote MT4 EA 記錄：找不到 account、ticket 或 symbol 標題欄。");
  }
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function mt4Number(row, aliases) {
  const value = pickRowValue(row, aliases);
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mt4PositiveNumber(row, aliases) {
  const number = mt4Number(row, aliases);
  return number != null && number > 0 ? number : null;
}

function normalizeMt4JournalRows(rows) {
  return rows.map((row, index) => {
    const account = String(pickRowValue(row, ["account"]) || "unknown").trim();
    const ticket = String(pickRowValue(row, ["ticket"]) || "").trim();
    const pair = String(pickRowValue(row, ["symbol", "pair"]) || "").trim().toUpperCase();
    const date = normalizeDateValue(pickRowValue(row, ["date", "open_date"]));
    const time = normalizeTimeValue(pickRowValue(row, ["time", "open_time"]));
    const profit = mt4Number(row, ["net_profit", "profit"]);
    const netR = mt4Number(row, ["net_r", "r"]);
    if (!ticket || !pair || !date || profit == null) return null;
    const directionRaw = String(pickRowValue(row, ["direction", "type"])).trim().toLowerCase();
    const direction = directionRaw === "buy" || directionRaw === "long" ? "Long" : directionRaw === "sell" || directionRaw === "short" ? "Short" : directionRaw;
    const comment = String(pickRowValue(row, ["comment", "order_comment"])).trim();
    const rawCaptureQuality = String(pickRowValue(row, ["capture_quality"])).trim();
    const stopLoss = mt4PositiveNumber(row, ["stop_loss", "sl"]);
    const takeProfit = mt4PositiveNumber(row, ["take_profit", "tp"]);
    const initialRiskMoney = mt4PositiveNumber(row, ["initial_risk_money"]);
    const slPips = mt4PositiveNumber(row, ["initial_risk_points", "sl_points", "slpips"]);
    const riskMissing = netR == null || stopLoss == null || initialRiskMoney == null || slPips == null;
    const captureQuality = riskMissing
      ? rawCaptureQuality && rawCaptureQuality !== "complete"
        ? `${rawCaptureQuality}+missing_initial_sl`
        : "missing_initial_sl"
      : rawCaptureQuality || "complete";
    const autoReview = [
      comment && `MT4 Comment: ${comment}`,
      riskMissing && "EA：下單時沒有有效初始 SL，無法計算 R。",
      captureQuality && captureQuality !== "complete" && `資料品質：${captureQualityLabel(captureQuality)}`,
    ].filter(Boolean).join(" · ");
    return {
      localId: crypto.randomUUID(),
      externalId: `MT4:${account}:${ticket}`,
      account,
      ticket,
      magicNumber: mt4Number(row, ["magic", "magic_number"]),
      year: Number(date.slice(0, 4)),
      date,
      time,
      closeTime: String(pickRowValue(row, ["close_time"])).trim(),
      pair,
      direction,
      outcome: profit > 0 ? "win" : profit < 0 ? "loss" : "be",
      profit,
      r: riskMissing ? null : netR,
      riskUnavailable: riskMissing,
      grossProfit: mt4Number(row, ["gross_profit"]),
      commission: mt4Number(row, ["commission"]),
      swap: mt4Number(row, ["swap"]),
      lots: mt4Number(row, ["lots"]),
      slPips: riskMissing ? null : slPips,
      entry: mt4Number(row, ["entry", "open_price"]),
      stopLoss,
      takeProfit,
      exitPrice: mt4Number(row, ["exit_price", "close_price"]),
      initialRiskMoney: riskMissing ? null : initialRiskMoney,
      grossR: riskMissing ? null : mt4Number(row, ["gross_r"]),
      mfeR: riskMissing ? null : mt4Number(row, ["mfe_r"]),
      maeR: riskMissing ? null : mt4Number(row, ["mae_r"]),
      exitEfficiencyPct: riskMissing ? null : mt4Number(row, ["exit_efficiency_pct"]),
      entrySpreadPoints: mt4Number(row, ["entry_spread_points"]),
      exitSpreadPoints: mt4Number(row, ["exit_spread_points"]),
      maxSpreadPoints: mt4Number(row, ["max_spread_points"]),
      spreadCostEstimate: mt4Number(row, ["spread_cost_estimate"]),
      exitReason: String(pickRowValue(row, ["exit_reason"])).trim(),
      exitSlippagePoints: mt4Number(row, ["exit_slippage_points"]),
      regime: String(pickRowValue(row, ["regime"])).trim(),
      volatility: String(pickRowValue(row, ["volatility"])).trim(),
      htfAlignment: String(pickRowValue(row, ["htf_alignment"])).trim(),
      session: String(pickRowValue(row, ["session"])).trim(),
      brokerUtcOffset: mt4Number(row, ["broker_utc_offset"]),
      captureQuality,
      batchId: activeLiveBatch || "live-default",
      setup: String(pickRowValue(row, ["setup", "regime"])).trim(),
      review: autoReview,
      source: "TradingNote MT4 EA",
      row: index + 2,
    };
  }).filter(Boolean);
}

function isMt4Trade(trade) {
  return Boolean(trade && (trade.source === "TradingNote MT4 EA" || String(trade.externalId || "").startsWith("MT4:" ) || String(trade.externalId || "").startsWith("MT4-GROUP:")));
}

function mt4PositionGroupKey(trade) {
  if (!isMt4Trade(trade)) return "";
  const account = String(trade.account || "unknown").trim();
  const pair = String(trade.pair || trade.market || "").trim().toUpperCase();
  const direction = String(trade.direction || "").trim().toLowerCase();
  const date = normalizeDateValue(trade.date);
  const time = normalizeTimeValue(trade.time);
  const entry = fingerprintNumber(trade.entry, 2);
  if (!date || !time || !pair) return `ticket:${account}:${trade.ticket || trade.externalId || trade.localId}`;
  return [account, date, time, pair, direction, entry].join("::");
}

function mt4TradeLegs(trade) {
  return Array.isArray(trade.partialExits) && trade.partialExits.length ? trade.partialExits : [trade];
}

function mt4WeightedValue(legs, field, weightField = "lots") {
  let total = 0;
  let weight = 0;
  for (const leg of legs) {
    const value = Number(leg[field]);
    const legWeight = Number(leg[weightField]);
    if (!Number.isFinite(value) || !Number.isFinite(legWeight) || legWeight <= 0) continue;
    total += value * legWeight;
    weight += legWeight;
  }
  return weight ? Number((total / weight).toFixed(6)) : null;
}

function consolidateMt4Position(positions) {
  const legsByTicket = new Map();
  for (const position of positions) {
    for (const leg of mt4TradeLegs(position)) {
      const key = `${leg.account || "unknown"}:${leg.ticket || leg.externalId || leg.localId}`;
      if (!legsByTicket.has(key)) legsByTicket.set(key, { ...leg, partialExits: undefined });
    }
  }
  const legs = [...legsByTicket.values()];
  const base = positions.find((trade) => Array.isArray(trade.partialExits)) || legs[0] || positions[0];
  const sum = (field) => legs.reduce((total, leg) => total + (Number.isFinite(Number(leg[field])) ? Number(leg[field]) : 0), 0);
  const lots = sum("lots");
  const profit = sum("profit");
  const riskUnavailable = legs.some((leg) => leg.riskUnavailable || !Number.isFinite(Number(leg.initialRiskMoney)) || Number(leg.initialRiskMoney) <= 0);
  const initialRiskMoney = riskUnavailable ? null : sum("initialRiskMoney");
  const tickets = legs.map((leg) => String(leg.ticket || "")).filter(Boolean);
  const closeTimes = legs.map((leg) => String(leg.closeTime || "")).filter(Boolean).sort();
  const groupKey = mt4PositionGroupKey(base || legs[0]);
  const reviews = [...new Set(legs.map((leg) => String(leg.review || "").trim()).filter(Boolean))];
  return {
    ...base,
    localId: base?.localId || crypto.randomUUID(),
    externalId: `MT4-GROUP:${groupKey}`,
    ticket: tickets.join(", "),
    partialExitTickets: tickets,
    partialExitCount: legs.length,
    partialExits: legs,
    closeTime: closeTimes.at(-1) || base?.closeTime || "",
    lots: Number(lots.toFixed(4)),
    profit: Number(profit.toFixed(2)),
    grossProfit: Number(sum("grossProfit").toFixed(2)),
    commission: Number(sum("commission").toFixed(2)),
    swap: Number(sum("swap").toFixed(2)),
    initialRiskMoney,
    r: riskUnavailable ? null : Number((profit / initialRiskMoney).toFixed(6)),
    grossR: riskUnavailable ? null : Number((sum("grossProfit") / initialRiskMoney).toFixed(6)),
    entry: mt4WeightedValue(legs, "entry"),
    exitPrice: mt4WeightedValue(legs, "exitPrice"),
    entrySpreadPoints: mt4WeightedValue(legs, "entrySpreadPoints"),
    exitSpreadPoints: mt4WeightedValue(legs, "exitSpreadPoints"),
    maxSpreadPoints: Math.max(...legs.map((leg) => Number(leg.maxSpreadPoints)).filter(Number.isFinite), 0),
    spreadCostEstimate: Number(sum("spreadCostEstimate").toFixed(2)),
    outcome: profit > 0 ? "win" : profit < 0 ? "loss" : "be",
    riskUnavailable,
    captureQuality: riskUnavailable ? "missing_initial_sl" : legs.every((leg) => !leg.captureQuality || leg.captureQuality === "complete") ? "complete" : "partial_capture",
    exitReason: legs.length > 1 ? "partial_exit" : base?.exitReason,
    review: [`MT4 分批出場已合併：${legs.length} 段（Ticket ${tickets.join("、")}）`, ...reviews].join(" · "),
    source: "TradingNote MT4 EA",
  };
}

function consolidateMt4Trades(items) {
  const groups = new Map();
  const other = [];
  for (const trade of items) {
    const positionKey = mt4PositionGroupKey(trade);
    if (!positionKey) {
      other.push(trade);
      continue;
    }
    const key = `${trade.batchId || "live-default"}::${positionKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  }
  return [...other, ...[...groups.values()].map(consolidateMt4Position)];
}

function mt4JournalPreview() {
  const text = els.mt4Paste.value;
  if (!text.trim()) {
    els.mt4ImportPreview.innerHTML = "<strong>等待貼上</strong><span>貼上 EA 記錄後，這裡會先顯示可辨識的交易筆數。</span>";
    return;
  }
  try {
    const rows = parseMt4Journal(text);
    const tradesInPaste = normalizeMt4JournalRows(rows);
    const positions = consolidateMt4Trades(tradesInPaste);
    const exitCount = new Set(tradesInPaste.map((trade) => trade.externalId)).size;
    els.mt4ImportPreview.innerHTML = `<strong>${positions.length} 組交易 · ${exitCount} 段出場</strong><span>相同帳號、商品、方向、開倉時間與開倉價會自動合併；原始 Ticket 仍會保留。</span>`;
  } catch (error) {
    els.mt4ImportPreview.innerHTML = `<strong>格式無法辨識</strong><span>${error.message}</span>`;
  }
}

function importMt4JournalText(text) {
  if (isAllLiveView()) throw new Error("完整紀錄不能直接匯入；請先選擇要存入的斷點。");
  const rows = parseMt4Journal(text);
  const normalized = normalizeMt4JournalRows(rows);
  if (!normalized.length) throw new Error("沒有找到可匯入的已平倉交易。");
  const groupedIncoming = new Map();
  for (const trade of normalized) {
    const key = mt4PositionGroupKey(trade);
    if (!groupedIncoming.has(key)) groupedIncoming.set(key, []);
    groupedIncoming.get(key).push(trade);
  }
  let added = 0;
  let skipped = 0;
  for (const [groupKey, incomingLegs] of groupedIncoming) {
    const existingPositions = localTrades.filter((trade) => trade.batchId === activeLiveBatch && mt4PositionGroupKey(trade) === groupKey);
    const existingTickets = new Set(existingPositions.flatMap(mt4TradeLegs).map((leg) => `${leg.account || "unknown"}:${leg.ticket || leg.externalId}`));
    const uniqueIncoming = [...new Map(incomingLegs.map((leg) => [`${leg.account || "unknown"}:${leg.ticket || leg.externalId}`, leg])).values()];
    const newLegs = uniqueIncoming.filter((leg) => !existingTickets.has(`${leg.account || "unknown"}:${leg.ticket || leg.externalId}`));
    skipped += incomingLegs.length - newLegs.length;
    if (!newLegs.length) continue;
    localTrades = localTrades.filter((trade) => !(trade.batchId === activeLiveBatch && mt4PositionGroupKey(trade) === groupKey));
    localTrades.push(consolidateMt4Position([...existingPositions, ...newLegs]));
    added += 1;
  }
  saveLocalTrades();
  refreshAfterDataChange();
  return { added, skipped };
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
      mambaDecision: String(pickRowValue(row, ["mambaDecision", "mamba", "mamba有沒有做", "mamba決策", "mamba方向"])).trim(),
      mambaR: numberOrNull(["mambaR", "mamba績效", "mamba績效R", "mambarmultiple", "mamba r"]),
      batchId: activeLiveBatch || "live-default",
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
      mambaDecision: String(pickRowValue(row, ["mambaDecision", "mamba", "mamba有沒有做", "mamba決策", "mamba方向"])).trim(),
      mambaR: numberOrNull(["mambaR", "mamba績效", "mamba績效R", "mambarmultiple", "mamba r"]),
      batchId: activeLiveBatch || "live-default",
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
    const fingerprint = smartTradeFingerprint(trade);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

async function importDataFile(file, mode = "merge") {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "json") {
    const payload = JSON.parse(await file.text());
    if (payload?.app === "TradingNoteAll" || payload?.live || payload?.research) {
      restoreUnifiedBackup(payload, "merge");
      return;
    }
    if (isAllLiveView()) throw new Error("完整紀錄不能直接匯入；請先選擇要存入的斷點。");
    const incoming = Array.isArray(payload) ? payload : payload.localTrades;
    if (!Array.isArray(incoming)) throw new Error("JSON 備份格式不正確。");
    const prepared = incoming.map((trade) => prepareTradeForActiveBatch(trade, `Import: ${file.name}`));
    const existing = new Set(tradesInActiveBatch().map(smartTradeFingerprint));
    const missing = prepared.filter((trade) => {
      const key = smartTradeFingerprint(trade);
      if (!key || existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    localTrades.push(...missing);
    saveLocalTrades();
    refreshAfterDataChange();
    showToast(`JSON 智慧合併完成：新增 ${missing.length} 筆，略過 ${incoming.length - missing.length} 筆重複資料。`);
    return;
  }

  if (isAllLiveView()) throw new Error("完整紀錄不能直接匯入；請先選擇要存入的斷點。");

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
    const currentBatchCount = tradesInActiveBatch().length;
    const confirmed = window.confirm(
      `即將以「${file.name}」的 ${imported.length} 筆交易，取代斷點「${liveBatchLabel(activeLiveBatch)}」中的 ${currentBatchCount} 筆資料。\n\n其他斷點不會受影響；系統會先下載完整 JSON 備份，確定繼續嗎？`,
    );
    if (!confirmed) return;
    exportFullBackup();
    localTrades = [
      ...localTrades.filter((trade) => (trade.batchId || "live-default") !== activeLiveBatch),
      ...imported,
    ];
    if (activeLiveBatch === "live-default") deletedTrades = new Set(importedTrades.map(baseTradeKey));
  } else {
    const existing = new Set(tradesInActiveBatch().map(smartTradeFingerprint));
    localTrades.push(...imported.filter((trade) => {
      const fingerprint = smartTradeFingerprint(trade);
      if (existing.has(fingerprint)) return false;
      existing.add(fingerprint);
      return true;
    }));
  }
  saveLocalTrades();
  refreshAfterDataChange();
  showToast(mode === "replace"
    ? `「${liveBatchLabel(activeLiveBatch)}」已取代為 ${file.name}，共 ${imported.length} 筆交易；其他斷點未變更。`
    : `已合併至「${liveBatchLabel(activeLiveBatch)}」，並自動略過此斷點內的重複交易。`);
}

populateFilters();
populateLiveBatchOptions();
populateResearchBreakpointOptions();
populateAccountRulesForm();
renderChecklist();
renderCalc();
runReturnSimulation();
resetTradeForm();
attachRippleFeedback();
attachCustomCursor();
attachCursorClickEffects();
attachCursorTrailEffects();
render();

[els.year, els.pair, els.outcome, els.window, els.search].forEach((el) => el.addEventListener("input", render));
els.liveBatch.addEventListener("change", () => {
  activeLiveBatch = els.liveBatch.value;
  saveLiveBatches();
  populateFilters();
  render();
  runMonteCarloSimulation();
  animateBatchControl();
});
els.addLiveBatch.addEventListener("click", () => {
  closeActionMenus();
  openLiveBatchDialog();
});
els.deleteLiveBatch.addEventListener("click", deleteActiveLiveBatch);
els.moveTrades.addEventListener("click", openMoveTradesDialog);
els.closeMoveTradesDialog.addEventListener("click", () => els.moveTradesDialog.close());
els.cancelMoveTrades.addEventListener("click", () => els.moveTradesDialog.close());
els.moveTradesTarget.addEventListener("change", updateMoveTradesPreview);
els.moveTradesList.addEventListener("change", updateMoveTradesPreview);
els.moveTradesSelectAll.addEventListener("change", () => {
  els.moveTradesList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = els.moveTradesSelectAll.checked;
  });
  updateMoveTradesPreview();
});
els.moveTradesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = moveSelectedTradesToBreakpoint();
  showToast(`交易移動完成：移動 ${result.moved} 筆、合併 ${result.merged} 筆重複資料。`);
});
els.closeLiveBatchDialog.addEventListener("click", () => els.liveBatchDialog.close());
els.cancelLiveBatch.addEventListener("click", () => els.liveBatchDialog.close());
[els.liveBatchMode, els.liveBatchStart, els.liveBatchEnd].forEach((el) => el.addEventListener("input", updateLiveBatchPreview));
els.liveBatchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createLiveBatchFromDialog();
  animateBatchControl();
});
[els.breakpointMenu, els.dataMenu].forEach((menu) => {
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    [els.breakpointMenu, els.dataMenu].forEach((other) => {
      if (other !== menu) other.open = false;
    });
  });
});
els.dataMenu.addEventListener("click", (event) => {
  if (event.target.closest(".menu-action")) window.setTimeout(closeActionMenus, 120);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".action-menu")) closeActionMenus();
});
[els.account, els.risk, els.sl, els.pip].forEach((el) => el.addEventListener("input", renderCalc));
els.returnSimulatorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  populateResearchBreakpointOptions();
  runReturnSimulation();
});
els.useJournalStats.addEventListener("click", useJournalSimulationStats);
els.researchBreakpoint.addEventListener("change", runMonteCarloSimulation);
window.addEventListener("resize", () => {
  render();
  renderReturnSimulation();
  renderMonteCarloSimulation(monteCarloResult);
});

els.theme.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  render();
  renderReturnSimulation();
  renderMonteCarloSimulation(monteCarloResult);
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

els.addStrategyVersion?.addEventListener("click", () => openStrategyVersionForm());
els.closeStrategyVersionDialog?.addEventListener("click", () => els.strategyVersionDialog.close());
els.cancelStrategyVersion?.addEventListener("click", () => els.strategyVersionDialog.close());
els.strategyVersionGrid?.addEventListener("click", handleStrategyAction);
els.strategyVersionForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const id = String(data.get("id") || "");
  const existing = strategyVersions.find((strategy) => String(strategy.id) === id);
  if (existing?.locked) {
    showToast("已鎖定的策略不能直接修改，請複製成新版。", "error");
    return;
  }
  const values = {
    name: String(data.get("name") || "").trim(),
    version: String(data.get("version") || "").trim(),
    status: String(data.get("status") || "Draft"),
    riskR: data.get("riskR") === "" ? null : Number(data.get("riskR")),
    effectiveFrom: String(data.get("effectiveFrom") || ""),
    effectiveTo: String(data.get("effectiveTo") || ""),
    scope: String(data.get("scope") || "").trim(),
    entryRules: String(data.get("entryRules") || "").trim(),
    exitRules: String(data.get("exitRules") || "").trim(),
    noTradeRules: String(data.get("noTradeRules") || "").trim(),
    notes: String(data.get("notes") || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  const duplicate = strategyVersions.some((strategy) => strategy.id !== id && String(strategy.name || "").toLowerCase() === values.name.toLowerCase() && String(strategy.version || "").toLowerCase() === values.version.toLowerCase());
  if (duplicate) {
    showToast("同名同版本已存在，請改用新的版本號。", "error");
    return;
  }
  if (existing) Object.assign(existing, values);
  else strategyVersions.unshift({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), locked: false, ...values });
  saveStrategyVersions();
  els.strategyVersionDialog.close();
  renderStrategyVersions();
  renderResearchLab();
  showToast(existing ? "策略版本已更新。" : "策略版本已建立。完成驗證後可鎖定版本。");
});

els.addMissedTrade?.addEventListener("click", () => {
  if (!requireWritableLiveBatch()) return;
  resetTradeForm();
  els.tradeForm.elements.recordType.value = "missed_opportunity";
  els.tradeForm.elements.reviewClass.value = "missed_trade";
  els.dialogTitle.textContent = "記錄符合策略但漏單";
  els.dialogSubtitle.textContent = "不需要填損益或 R；記下當時應做的策略版本、Setup 與錯過原因。";
  els.tradeDialog.showModal();
});
[els.liveReviewClassFilter, els.liveReviewStrategyFilter].forEach((control) => control?.addEventListener("change", renderLiveReview));
els.liveReviewSearch?.addEventListener("input", renderLiveReview);
els.liveReviewRows?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-action='edit']");
  const row = event.target.closest("[data-review-id]");
  if (!button || !row) return;
  const trade = tradesForActiveView().find((item) => String(item.id) === String(row.dataset.reviewId));
  if (trade) editTrade(trade);
});

els.newTrade.addEventListener("click", () => {
  if (!requireWritableLiveBatch()) return;
  resetTradeForm();
  els.tradeDialog.showModal();
});
els.closeTradeDialog.addEventListener("click", () => els.tradeDialog.close());
els.tradeImageInput.addEventListener("change", async () => {
  const [file] = els.tradeImageInput.files;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("請選擇圖片檔。", "error");
    els.tradeImageInput.value = "";
    return;
  }
  if (file.size > 2.5 * 1024 * 1024 && !window.confirm("圖片超過 2.5MB，會讓本機備份變大。仍要加入嗎？")) {
    els.tradeImageInput.value = "";
    return;
  }
  try {
    updateTradeImagePreview(await readFileAsDataUrl(file));
  } catch (error) {
    showToast(error.message || "圖片讀取失敗。", "error");
  }
});
els.removeTradeImage.addEventListener("click", () => {
  els.tradeImageInput.value = "";
  updateTradeImagePreview("");
});
els.tradeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!requireWritableLiveBatch()) return;
  updateTradeDerivedFields();
  const trade = createTradeFromForm(els.tradeForm);
  if (trade.recordType === "missed_opportunity") {
    trade.reviewClass = "missed_trade";
    trade.profit = null;
    trade.r = null;
    trade.outcome = "be";
  }
  if (trade.recordType === "trade" && trade.profit > 0 && trade.exitPrice == null) {
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
  const signMismatch = trade.profit != null &&
    (trade.outcome === "win" && trade.profit < 0) ||
    (trade.outcome === "loss" && trade.profit > 0) ||
    (trade.outcome === "be" && Math.abs(trade.profit) > 0.01);
  if (signMismatch && !window.confirm("交易結果與損益正負不一致，仍要儲存嗎？")) return;
  const replacedBaseKey = els.tradeForm.elements.baseKey.value;
  if (replacedBaseKey) deletedTrades.add(replacedBaseKey);
  const existingIndex = localTrades.findIndex((item) => item.localId === trade.localId);
  if (existingIndex >= 0) localTrades[existingIndex] = { ...localTrades[existingIndex], ...trade };
  else localTrades.push(trade);
  saveLocalTrades();
  els.tradeDialog.close();
  resetTradeForm();
  refreshAfterDataChange();
  showToast(existingIndex >= 0 ? "交易已更新。" : "交易已新增。");
});

["date", "time", "pair", "direction", "outcome", "recordType", "profit", "r", "lots", "entry", "stopLoss", "exitPrice", "slPips"].forEach((name) => {
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
  const previewButton = event.target.closest("[data-preview-image]");
  if (previewButton) {
    const trade = trades.find((item) => String(item.id) === previewButton.dataset.previewImage);
    if (trade?.image) openImagePreview(trade.image, `${trade.pair} 交易截圖`);
    return;
  }
  const action = event.target.closest("[data-trade-action]")?.dataset.tradeAction;
  if (!action || currentDetailId == null) return;
  if (!requireWritableLiveBatch()) return;
  const trade = trades.find((item) => item.id === currentDetailId);
  if (!trade) return;
  if (action === "edit") editTrade(trade);
  if (action === "delete") deleteTrade(trade);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeImagePreview();
});
els.exportCsv.addEventListener("click", exportFilteredCsv);
els.exportJson.addEventListener("click", exportFullBackup);
els.openMt4Import.addEventListener("click", () => {
  if (!requireWritableLiveBatch()) return;
  closeActionMenus();
  els.mt4Paste.value = "";
  mt4JournalPreview();
  els.mt4ImportDialog.showModal();
  window.setTimeout(() => els.mt4Paste.focus(), 80);
});
els.mt4Paste.addEventListener("input", mt4JournalPreview);
els.closeMt4ImportDialog.addEventListener("click", () => els.mt4ImportDialog.close());
els.cancelMt4Import.addEventListener("click", () => els.mt4ImportDialog.close());
els.mt4ImportForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const result = importMt4JournalText(els.mt4Paste.value);
    els.mt4ImportDialog.close();
    showToast(`MT4 匯入完成：新增／更新 ${result.added} 組交易，略過 ${result.skipped} 段重複出場。`);
  } catch (error) {
    showToast(error.message || "MT4 記錄匯入失敗。", "error");
    els.mt4Paste.focus();
  }
});
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
els.backupImport.addEventListener("change", async () => {
  const [file] = els.backupImport.files;
  if (!file) return;
  try {
    await importBackupFile(file);
  } catch (error) {
    showToast(error.message || "備份匯入失敗，請確認 JSON 格式。", "error");
  } finally {
    els.backupImport.value = "";
  }
});
els.backupForceImport.addEventListener("change", async () => {
  const [file] = els.backupForceImport.files;
  if (!file) return;
  try {
    await importBackupFile(file, "replace");
  } catch (error) {
    showToast(error.message || "強制覆蓋失敗，請確認 JSON 格式。", "error");
  } finally {
    els.backupForceImport.value = "";
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

els.researchLabBreakpoint?.addEventListener("change", () => {
  populateResearchLabControls();
  renderResearchLab();
  runMonteCarloSimulation();
});
els.researchLabMarket?.addEventListener("change", renderResearchLab);
els.researchLabStrategy?.addEventListener("change", renderResearchLab);

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
