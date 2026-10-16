(function initTpAnalysis(root) {
  const finite = (value) => value !== "" && value != null && Number.isFinite(Number(value));
  const number = (value, fallback = 0) => finite(value) ? Number(value) : fallback;
  const round = (value, digits = 4) => Number(Number(value).toFixed(digits));

  function positionLegs(trade) {
    return Array.isArray(trade?.partialExits) && trade.partialExits.length ? trade.partialExits : [trade];
  }

  function firstPositive(values) {
    const value = values.find((item) => finite(item) && Number(item) > 0);
    return value == null ? null : Number(value);
  }

  function positionFavorablePrice(trade) {
    const legs = positionLegs(trade);
    const values = [trade?.mfePrice, ...legs.map((leg) => leg?.mfePrice)].filter(finite).map(Number);
    if (!values.length) return null;
    const direction = String(trade?.direction || trade?.mine || legs[0]?.direction || "").toLowerCase();
    return direction === "short" ? Math.min(...values) : Math.max(...values);
  }

  function priceDerivedMfeR(trade) {
    const legs = positionLegs(trade);
    const entry = firstPositive([trade?.entry, ...legs.map((leg) => leg?.entry)]);
    const stopLoss = firstPositive([trade?.stopLoss, ...legs.flatMap((leg) => [leg?.stopLoss, leg?.initialStop])]);
    const favorablePrice = positionFavorablePrice(trade);
    if (!finite(entry) || !finite(stopLoss) || !finite(favorablePrice) || entry === stopLoss) return null;
    const direction = String(trade?.direction || trade?.mine || legs[0]?.direction || "").toLowerCase();
    const favorableDistance = direction === "short"
      ? Math.max(0, entry - Number(favorablePrice))
      : Math.max(0, Number(favorablePrice) - entry);
    return favorableDistance / Math.abs(entry - stopLoss);
  }

  function positionMfe(trade) {
    const derived = priceDerivedMfeR(trade);
    if (finite(derived)) return Number(derived);
    const legs = positionLegs(trade);
    const values = legs.map((leg) => leg?.mfeR).filter(finite).map(Number);
    if (finite(trade?.mfeR)) values.push(Number(trade.mfeR));
    return values.length ? Math.max(...values) : null;
  }

  function positionMae(trade) {
    const legs = positionLegs(trade);
    const entry = firstPositive([trade?.entry, ...legs.map((leg) => leg?.entry)]);
    const stopLoss = firstPositive([trade?.stopLoss, ...legs.flatMap((leg) => [leg?.stopLoss, leg?.initialStop])]);
    const adversePrices = [trade?.maePrice, ...legs.map((leg) => leg?.maePrice)].filter(finite).map(Number);
    if (finite(entry) && finite(stopLoss) && entry !== stopLoss && adversePrices.length) {
      const direction = String(trade?.direction || trade?.mine || legs[0]?.direction || "").toLowerCase();
      const adversePrice = direction === "short" ? Math.max(...adversePrices) : Math.min(...adversePrices);
      const adverseDistance = direction === "short" ? Math.max(0, adversePrice - entry) : Math.max(0, entry - adversePrice);
      return -adverseDistance / Math.abs(entry - stopLoss);
    }
    const values = legs.map((leg) => leg?.maeR).filter(finite).map(Number);
    if (finite(trade?.maeR)) values.push(Number(trade.maeR));
    return values.length ? Math.min(...values) : null;
  }

  function captureTokens(value) {
    return String(value || "complete").trim().toLowerCase().split("+").filter(Boolean);
  }

  function partialExitPathIsReconstructable(trade) {
    const legs = Array.isArray(trade?.partialExits) ? trade.partialExits : [];
    if (legs.length <= 1) return false;
    const tokens = legs.flatMap((leg) => captureTokens(leg?.captureQuality));
    const hasCompleteStart = tokens.some((quality) => quality === "complete" || quality === "complete_partial_exit");
    const hasContinuousPartsOnly = tokens.every((quality) => ["complete", "complete_partial_exit", "attached_mid_trade"].includes(quality));
    const allPartsHavePath = legs.every((leg) => finite(leg?.mfeR) && finite(leg?.maeR));
    return hasCompleteStart && hasContinuousPartsOnly && allPartsHavePath;
  }

  function captureIsReliable(trade) {
    const legs = Array.isArray(trade?.partialExits) && trade.partialExits.length ? trade.partialExits : [trade];
    const legTokens = legs.flatMap((leg) => captureTokens(leg?.captureQuality));
    const parentTokens = captureTokens(trade?.captureQuality);
    const fatal = new Set(["missing_initial_sl", "resumed_after_restart"]);
    if ([...legTokens, ...parentTokens].some((quality) => fatal.has(quality))) return false;
    if (partialExitPathIsReconstructable(trade)) return true;
    const accepted = new Set(["complete", "complete_partial_exit"]);
    return [...legTokens, ...parentTokens].every((quality) => accepted.has(quality));
  }

  function eligibilityReason(trade) {
    if (!trade || trade.recordType === "missed_opportunity") return "not_trade";
    const mfe = positionMfe(trade);
    if (!finite(mfe) || mfe < 0) return trade.riskUnavailable ? "missing_risk" : "missing_mfe";
    if (!captureIsReliable(trade)) return "partial_capture";
    return "eligible";
  }

  function referenceEligible(trade) {
    return eligibilityReason(trade) === "partial_capture"
      && finite(positionMfe(trade));
  }

  function buildCandidateLevels(minimum, maximum, step, limit = 80) {
    const min = Math.max(0.05, number(minimum, 0.5));
    const max = Math.max(min, number(maximum, 5));
    const increment = Math.max(0.05, number(step, 0.25));
    const values = [];
    for (let value = min; value <= max + increment / 10 && values.length < limit; value += increment) {
      values.push(round(value));
    }
    return values;
  }

  function simulatedTradeR(trade, targetR) {
    const mfe = positionMfe(trade);
    return finite(mfe) && Number(mfe) + 1e-9 >= Number(targetR) ? Number(targetR) : -1;
  }

  function statsFromValues(values) {
    const clean = values.map(Number).filter(Number.isFinite);
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let grossWin = 0;
    let grossLoss = 0;
    for (const value of clean) {
      equity += value;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, equity - peak);
      if (value > 0) grossWin += value;
      if (value < 0) grossLoss += Math.abs(value);
    }
    return {
      count: clean.length,
      totalR: equity,
      avgR: clean.length ? equity / clean.length : 0,
      winRate: clean.length ? clean.filter((value) => value > 0).length / clean.length * 100 : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
      maxDrawdown,
    };
  }

  function candidateResult(items, targetR) {
    const values = items.map((trade) => simulatedTradeR(trade, targetR));
    const stats = statsFromValues(values);
    const hitCount = items.filter((trade) => Number(positionMfe(trade)) + 1e-9 >= targetR).length;
    return {
      targetR,
      hitCount,
      hitRate: items.length ? hitCount / items.length * 100 : 0,
      ...stats,
    };
  }

  function percentile(values, ratio) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * Math.max(0, Math.min(1, ratio));
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function chronological(items) {
    return [...items].sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
  }

  function bestResult(results, key = "avgR") {
    return [...results].sort((a, b) => (b[key] - a[key]) || (b.maxDrawdown - a.maxDrawdown) || (a.targetR - b.targetR))[0] || null;
  }

  function stableRange(results, best) {
    if (!best || best.avgR <= 0) return [];
    const floor = best.avgR - Math.max(0.05, Math.abs(best.avgR) * 0.1);
    const qualifies = (item) => item.avgR >= floor && (item.validationCount < 5 || item.validationAvgR >= 0);
    const index = results.indexOf(best);
    let start = index;
    let end = index;
    while (start > 0 && qualifies(results[start - 1])) start -= 1;
    while (end < results.length - 1 && qualifies(results[end + 1])) end += 1;
    return results.slice(start, end + 1);
  }

  const api = {
    positionFavorablePrice,
    priceDerivedMfeR,
    positionMfe,
    positionMae,
    captureIsReliable,
    eligibilityReason,
    buildCandidateLevels,
    simulatedTradeR,
    statsFromValues,
    candidateResult,
    percentile,
    stableRange,
    partialExitPathIsReconstructable,
    referenceEligible,
  };
  root.TradingNoteTpAnalysis = api;
  if (typeof document === "undefined") return;

  const $ = (selector) => document.querySelector(selector);
  const fmt = (value, digits = 2) => finite(value) ? Number(value).toFixed(digits) : "—";
  const signedR = (value) => finite(value) ? `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}R` : "—";
  const escape = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
  let controlsBound = false;

  function replaceOptions(select, entries, firstLabel) {
    if (!select) return;
    const selected = select.value;
    select.replaceChildren(new Option(firstLabel, "all"), ...entries.map(([value, label]) => new Option(label, value)));
    select.value = [...select.options].some((option) => option.value === selected) ? selected : "all";
  }

  function filterKey(value) {
    return String(value || "").trim() || "__unassigned__";
  }

  function populateControls(items) {
    const uniqueEntries = (mapper, labeler = (value) => value === "__unassigned__" ? "未設定" : value) => [...new Set(items.map(mapper))]
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((value) => [value, labeler(value)]);
    replaceOptions($("#tpMarketFilter"), uniqueEntries((trade) => filterKey(trade.pair || trade.market)), "全部商品");
    replaceOptions($("#tpSetupFilter"), uniqueEntries((trade) => filterKey(trade.setup || trade.checklist)), "全部 Setup");
    replaceOptions($("#tpSessionFilter"), uniqueEntries((trade) => filterKey(trade.session)), "全部 Session");
    replaceOptions($("#tpStrategyFilter"), uniqueEntries(
      (trade) => filterKey(trade.strategyVersionId),
      (value) => value === "__unassigned__" ? "未綁定策略" : (typeof strategyVersionLabel === "function" ? strategyVersionLabel(value) : value),
    ), "全部版本");
  }

  function selectedItems(items) {
    const market = $("#tpMarketFilter")?.value || "all";
    const setup = $("#tpSetupFilter")?.value || "all";
    const session = $("#tpSessionFilter")?.value || "all";
    const strategy = $("#tpStrategyFilter")?.value || "all";
    return items.filter((trade) =>
      (market === "all" || filterKey(trade.pair || trade.market) === market)
      && (setup === "all" || filterKey(trade.setup || trade.checklist) === setup)
      && (session === "all" || filterKey(trade.session) === session)
      && (strategy === "all" || filterKey(trade.strategyVersionId) === strategy));
  }

  function bindControls() {
    if (controlsBound) return;
    const form = $("#tpAnalysisForm");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      renderTpAnalysis();
    });
    ["tpMarketFilter", "tpSetupFilter", "tpSessionFilter", "tpStrategyFilter", "tpIncludeInterrupted"].forEach((id) => {
      $("#" + id)?.addEventListener("change", renderTpAnalysis);
    });
    controlsBound = true;
  }

  function qualityCard(label, value, note, tone = "") {
    return `<article class="${tone}"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></article>`;
  }

  function exclusionSummary(reasons, includedInterrupted = 0) {
    const excludedInterrupted = Math.max(0, (reasons.partial_capture || 0) - includedInterrupted);
    const parts = [
      includedInterrupted ? `監控曾中斷 ${includedInterrupted}（已納入參考）` : "",
      excludedInterrupted ? `監控中斷且資料不足 ${excludedInterrupted}` : "",
      reasons.missing_risk ? `缺少初始停損／R ${reasons.missing_risk}` : "",
      reasons.missing_mfe ? `缺少最高浮盈 ${reasons.missing_mfe}` : "",
    ].filter(Boolean);
    return parts.length ? parts.join("、") : "沒有排除交易";
  }

  function emptyState(total, reasons) {
    $("#tpHeroSample").textContent = "0";
    $("#tpQualityMetrics").innerHTML = [
      qualityCard("目前交易", total, "目前斷點內的實際交易"),
      qualityCard("可用交易", 0, "需要完整的最高／最低走勢與 R", "warning"),
      qualityCard("缺少最高浮盈", reasons.missing_mfe || 0, "舊紀錄沒有保存持倉最高點"),
      qualityCard("缺少風險資料", reasons.missing_risk || 0, "沒有初始停損或無法換算 R"),
      qualityCard("監控曾中斷", reasons.partial_capture || 0, "EA 中途開啟或 MT4／EA 曾重啟"),
    ].join("");
    $("#tpRecommendation").className = "tp-recommendation insufficient";
    $("#tpRecommendation").innerHTML = `<div class="tp-verdict"><span>需要資料</span><strong>尚不能分析</strong></div><div><h3>目前沒有完整的持倉最高／最低走勢與 R</h3><p>${escape(exclusionSummary(reasons))}。請讓 MT4 EA 從開倉前持續運行，並在進場時建立初始停損。</p></div>`;
    $("#tpReachChart").innerHTML = '<div class="tp-empty">尚無 TP 到達資料</div>';
    $("#tpDistribution").innerHTML = '<div class="tp-empty">尚無可計算分布</div>';
    $("#tpResultRows").innerHTML = '<tr><td colspan="8"><div class="tp-empty">沒有符合條件的交易</div></td></tr>';
    $("#tpTableSummary").textContent = "等待資料";
  }

  function renderRecommendation(items, baseline, best, trainingChoice, stable, validationCount, reliableCount, referenceCount) {
    const node = $("#tpRecommendation");
    const enough = reliableCount >= 20 && validationCount >= 6;
    const validationPassed = enough && trainingChoice && trainingChoice.validationAvgR > 0;
    const rangeLabel = stable.length ? `${fmt(stable[0].targetR, 2)}R–${fmt(stable.at(-1).targetR, 2)}R` : best ? `${fmt(best.targetR, 2)}R` : "—";
    node.className = `tp-recommendation${validationPassed ? "" : " insufficient"}`;
    const status = !enough ? "繼續累積" : validationPassed ? "後續測試" : "尚未驗證";
    const verdict = !enough ? "樣本累積中" : validationPassed ? rangeLabel : "尚未通過驗證";
    const title = !enough
      ? `目前 ${items.length} 筆（完整 ${reliableCount}、參考 ${referenceCount}），只能觀察資料最佳 ${best ? `${fmt(best.targetR, 2)}R` : "—"}`
      : validationPassed
        ? `可把 ${rangeLabel} 當成下一個實盤觀察候選區間`
        : "訓練樣本的最佳 TP 沒有在後段資料延續";
    const body = !enough
      ? "至少累積 20 筆完整監控的交易，並保留最近 30% 作驗證後，才提供策略候選。所有測試只看持倉最有利點；到達 TP 算獲利，未到達一律按固定 SL -1R。"
      : validationPassed
        ? "這是完全忽略分批出場的固定 TP／固定 SL 路徑測試。請先建立新策略版本，在後續實盤或盤面重播中驗證，不要直接覆蓋原本規則。"
        : "先增加樣本或重新按商品、Setup 與市場狀態分組；不要使用整段歷史資料的最高點硬改 TP。";
    node.innerHTML = `<div class="tp-verdict"><span>${status}</span><strong>${escape(verdict)}</strong></div><div><h3>${escape(title)}</h3><p>${escape(body)}</p></div><div class="tp-recommendation-stats"><span>固定 1R 基準<b>${signedR(baseline.avgR)}</b></span><span>這批資料最佳<b>${best ? `${fmt(best.targetR, 2)}R` : "—"}</b></span><span>最近樣本結果<b>${trainingChoice && validationCount ? signedR(trainingChoice.validationAvgR) : "—"}</b></span></div>`;
  }

  function renderDistribution(items) {
    const mfeValues = items.map(positionMfe).filter(finite).map(Number);
    const maeValues = items.map(positionMae).filter(finite).map((value) => Math.abs(Number(value)));
    const oneRReach = items.length ? items.filter((trade) => Number(positionMfe(trade)) + 1e-9 >= 1).length / items.length * 100 : 0;
    const rows = [
      ["較低 25% 最多曾賺", percentile(mfeValues, 0.25)],
      ["典型交易最多曾賺", percentile(mfeValues, 0.5)],
      ["較高 25% 最多曾賺", percentile(mfeValues, 0.75)],
      ["前 10% 最多曾賺", percentile(mfeValues, 0.9)],
      ["典型交易最多曾虧", percentile(maeValues, 0.5)],
    ];
    const maximum = Math.max(...rows.map(([, value]) => Number(value) || 0), 1);
    $("#tpDistribution").innerHTML = rows.map(([label, value]) => `<div class="tp-distribution-row"><span>${escape(label)}</span><i><b style="width:${Math.max(2, (Number(value) || 0) / maximum * 100)}%"></b></i><strong>${finite(value) ? `${fmt(value, 2)}R` : "—"}</strong></div>`).join("")
      + `<div class="tp-distribution-note">完整持倉曾走到 +1R 的比例：<b>${fmt(oneRReach, 1)}%</b>。這裡只統計從進場到最有利／不利價格的距離，不使用任何分批出場結果。</div>`;
  }

  function renderReachChart(results, best) {
    const display = results.length <= 28 ? results : results.filter((_, index) => index % Math.ceil(results.length / 28) === 0 || index === results.length - 1);
    $("#tpReachChart").innerHTML = display.map((item) => `<div class="tp-reach-column${item === best ? " best" : ""}" title="${fmt(item.targetR, 2)}R · 最有利價格曾到達 ${fmt(item.hitRate, 1)}%"><strong>${fmt(item.hitRate, 0)}%</strong><i style="height:${Math.max(2, item.hitRate)}%"></i><small>${fmt(item.targetR, item.targetR % 1 ? 2 : 0)}R</small></div>`).join("");
  }

  function renderResultTable(results, baseline, best, trainingChoice) {
    $("#tpResultRows").innerHTML = results.map((item) => {
      const delta = item.avgR - baseline.avgR;
      const isBest = item === best;
      const isTraining = item === trainingChoice;
      const status = isBest ? "這批最佳" : isTraining ? "最近資料驗證" : item.validationCount && item.validationAvgR < 0 ? "最近轉負" : "觀察";
      return `<tr class="${isBest ? "best-row" : ""} ${isTraining ? "validation-row" : ""}"><td><b>${fmt(item.targetR, 2)}R</b></td><td>${fmt(item.hitRate, 1)}%</td><td class="${item.avgR >= 0 ? "tp-positive" : "tp-negative"}">${signedR(item.avgR)}</td><td class="${item.validationCount ? item.validationAvgR >= 0 ? "tp-positive" : "tp-negative" : ""}">${item.validationCount ? signedR(item.validationAvgR) : "—"}</td><td>${Number.isFinite(item.profitFactor) ? fmt(item.profitFactor, 2) : "∞"}</td><td class="tp-negative">${signedR(item.maxDrawdown)}</td><td class="${delta >= 0 ? "tp-positive" : "tp-negative"}">${signedR(delta)}</td><td><span class="tp-status ${isBest ? "best" : isTraining ? "validation" : ""}">${status}</span></td></tr>`;
    }).join("");
  }

  function renderTpAnalysis() {
    const form = $("#tpAnalysisForm");
    if (!form || typeof tradesForActiveView !== "function") return;
    bindControls();
    const all = tradesForActiveView().filter((trade) => trade.recordType !== "missed_opportunity");
    populateControls(all);
    const scoped = selectedItems(all);
    const categorized = scoped.map((trade) => ({ trade, reason: eligibilityReason(trade) }));
    const reasons = categorized.reduce((counts, { reason }) => {
      counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    }, {});
    const includeInterrupted = $("#tpIncludeInterrupted")?.checked !== false;
    const reliable = categorized.filter(({ reason }) => reason === "eligible").map(({ trade }) => trade);
    const references = includeInterrupted
      ? categorized.filter(({ reason, trade }) => reason === "partial_capture" && referenceEligible(trade)).map(({ trade }) => trade)
      : [];
    const eligible = chronological([...reliable, ...references]);
    $("#tpHeroSample").textContent = eligible.length;
    $("#tpHeroBatch").textContent = typeof liveBatchLabel === "function" ? liveBatchLabel(activeLiveBatch) : "目前斷點";
    if (!eligible.length) {
      emptyState(scoped.length, reasons);
      return;
    }

    const minimum = number($("#tpMinInput").value, 0.5);
    const maximum = number($("#tpMaxInput").value, 5);
    const step = number($("#tpStepInput").value, 0.25);
    if (maximum < minimum) {
      $("#tpMaxInput").setCustomValidity("最大 TP 必須大於起始 TP");
      form.reportValidity();
      return;
    }
    $("#tpMaxInput").setCustomValidity("");
    const levels = buildCandidateLevels(minimum, maximum, step);
    const validationCount = eligible.length >= 10 ? Math.max(3, Math.round(eligible.length * 0.3)) : 0;
    const training = validationCount ? eligible.slice(0, -validationCount) : eligible;
    const validation = validationCount ? eligible.slice(-validationCount) : [];
    const results = levels.map((targetR) => {
      const full = candidateResult(eligible, targetR);
      const train = candidateResult(training, targetR);
      const validate = candidateResult(validation, targetR);
      return {
        ...full,
        trainingAvgR: train.avgR,
        validationAvgR: validate.avgR,
        validationCount: validation.length,
      };
    });
    const baseline = candidateResult(eligible, 1);
    const best = bestResult(results);
    const trainingChoice = bestResult(results, "trainingAvgR");
    const stable = stableRange(results, best);
    const coverage = scoped.length ? eligible.length / scoped.length * 100 : 0;
    const medianMfe = percentile(eligible.map(positionMfe), 0.5);
    const medianMae = percentile(eligible.map(positionMae).filter(finite).map((value) => Math.abs(Number(value))), 0.5);
    const oneRReach = eligible.length ? eligible.filter((trade) => Number(positionMfe(trade)) + 1e-9 >= 1).length / eligible.length * 100 : 0;
    $("#tpQualityMetrics").innerHTML = [
      qualityCard("可用交易", eligible.length, `完整 ${reliable.length} 筆＋參考 ${references.length} 筆／共 ${scoped.length} 筆`, reliable.length >= 20 ? "positive" : "warning"),
      qualityCard("可用資料比例", `${fmt(coverage, 1)}%`, exclusionSummary(reasons, references.length), coverage >= 70 ? "positive" : "warning"),
      qualityCard("典型交易最多曾賺", `${fmt(medianMfe, 2)}R`, "一半交易高於此值、一半低於此值"),
      qualityCard("典型交易最多曾虧", `${fmt(medianMae, 2)}R`, "持倉途中一度承受的虧損"),
      qualityCard("曾走到 +1R", `${fmt(oneRReach, 1)}%`, "只看持倉最有利點，不看如何分批出場", oneRReach >= 50 ? "positive" : "warning"),
    ].join("");
    renderRecommendation(eligible, baseline, best, trainingChoice, stable, validationCount, reliable.length, references.length);
    renderReachChart(results, best);
    renderDistribution(eligible);
    renderResultTable(results, baseline, best, trainingChoice);
    $("#tpTableSummary").textContent = `${results.length} 組 TP · 最近樣本 ${validationCount} 筆`;
  }

  root.renderTpAnalysis = renderTpAnalysis;
})(typeof window !== "undefined" ? window : globalThis);
