// Breakpoint manager: every breakpoint at a glance, plus range operations (delete / move / copy the
// trades matching a date range, time of day, weekday, market and result) with a preview and undo.
//
// Trades on screen are merged views: an imported row (origin "excel", hidden through deletedTrades)
// or a stored local record, and an MT4 position with partial exits is several stored legs. Every
// operation works on all stored entries behind a trade, so no leg is left behind in the old place.
// Pure functions (selectTrades, applyOperation) are tested; the page uses app.js globals.
(function initBreakpointManager(root) {
  const DEFAULT_BATCH = "live-default";
  const batchOf = (trade) => trade.batchId || DEFAULT_BATCH;
  const dateOf = (trade) => String(trade.date || "").replace(/[./]/g, "-").slice(0, 10);
  const timeOf = (trade) => String(trade.time || "").slice(0, 5);
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  function selectTrades(trades, filter = {}) {
    const { batchId, from = "", to = "", timeFrom = "", timeTo = "", pair = "all", outcome = "all", weekdays = null } = filter;
    return trades.filter((trade) => {
      if (batchId && batchOf(trade) !== batchId) return false;
      const date = dateOf(trade);
      if (from && date < from) return false;
      if (to && date > to) return false;
      const time = timeOf(trade);
      if ((timeFrom || timeTo) && !time) return false;
      if (timeFrom && time < timeFrom) return false;
      if (timeTo && time > timeTo) return false;
      if (pair !== "all" && String(trade.pair || "").toUpperCase() !== pair) return false;
      if (outcome === "missed" ? trade.recordType !== "missed_opportunity" : outcome !== "all" && trade.outcome !== outcome) return false;
      if (Array.isArray(weekdays) && weekdays.length < 7) {
        const day = new Date(`${date}T00:00:00`).getDay();
        if (!weekdays.includes(day)) return false;
      }
      return true;
    });
  }

  // Stored local entries behind one on-screen trade (itself, or each MT4 leg), within its breakpoint.
  function storedEntries(trade, localTrades) {
    const ids = new Set();
    const externalIds = new Set();
    const legs = Array.isArray(trade.partialExits) && trade.partialExits.length ? trade.partialExits : [];
    for (const leg of [trade, ...legs]) {
      if (leg.localId) ids.add(String(leg.localId));
      if (leg.externalId) externalIds.add(String(leg.externalId));
    }
    return localTrades.filter((item) => batchOf(item) === batchOf(trade)
      && (ids.has(String(item.localId)) || (item.externalId && externalIds.has(String(item.externalId)))));
  }

  // op: "delete" | "move" | "copy". Returns new arrays; inputs are not modified.
  // fingerprint(trade, batchId) identifies a trade inside a breakpoint (to merge instead of duplicating);
  // cloneImported(trade, batchId) turns an imported row into a local record; newId() makes local ids.
  function applyOperation({ op, selected, localTrades, deletedTrades, target, destinationTrades = [], fingerprint, cloneImported, newId }) {
    let local = localTrades.map((item) => ({ ...item }));
    const deleted = new Set(deletedTrades);
    const destinationKeys = new Set(destinationTrades.map((trade) => fingerprint(trade, target)));
    let changed = 0;
    let merged = 0;
    for (const trade of selected) {
      const entries = trade.origin === "local" ? storedEntries(trade, local) : [];
      const entryIds = new Set(entries.map((item) => item.localId));
      if (op === "delete") {
        if (trade.origin === "local") local = local.filter((item) => !entryIds.has(item.localId));
        else if (trade.baseKey) deleted.add(trade.baseKey);
        changed += 1;
        continue;
      }
      const key = fingerprint(trade, target);
      const exists = destinationKeys.has(key);
      if (op === "move") {
        if (trade.origin === "local") {
          local = exists
            ? local.filter((item) => !entryIds.has(item.localId))
            : local.map((item) => (entryIds.has(item.localId) ? { ...item, batchId: target } : item));
        } else {
          if (!exists) local.push(cloneImported(trade, target));
          if (trade.baseKey) deleted.add(trade.baseKey);
        }
      } else if (op === "copy" && !exists) {
        if (trade.origin === "local") entries.forEach((item) => local.push({ ...JSON.parse(JSON.stringify(item)), localId: newId(), batchId: target }));
        else local.push(cloneImported(trade, target));
      }
      destinationKeys.add(key);
      if (exists) merged += 1;
      else changed += 1;
    }
    return { localTrades: local, deletedTrades: deleted, changed, merged };
  }

  function summarize(items) {
    const r = items.filter((trade) => Number.isFinite(Number(trade.r)) && !trade.riskUnavailable).map((trade) => Number(trade.r));
    const money = items.filter((trade) => Number.isFinite(Number(trade.profit))).map((trade) => Number(trade.profit));
    const dates = items.map(dateOf).filter(Boolean).sort();
    return { count: items.length, totalR: r.reduce((a, b) => a + b, 0), profit: money.reduce((a, b) => a + b, 0), start: dates[0] || "", end: dates.at(-1) || "" };
  }

  root.TradingNoteBreakpointManager = { selectTrades, applyOperation, storedEntries, summarize };
  if (typeof document === "undefined") return;

  // ---------------------------------------------------------------- page
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (typeof escapeHtml === "function" ? escapeHtml(value) : String(value));
  const fmtR = (value) => `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}R`;
  const fmtMoney = (value) => (typeof money === "function" ? money(value) : `$${Number(value).toFixed(2)}`);
  const tone = (value) => (value > 0 ? "pos" : value < 0 ? "neg" : "");
  let undoSnapshot = null;
  let excluded = new Set(); // trades the user unticked in the preview
  let lastSelection = [];

  const allBatches = () => (typeof liveBatches !== "undefined" ? liveBatches : []);
  const tradesIn = (batchId) => trades.filter((trade) => batchOf(trade) === batchId);
  const fingerprint = (trade, batchId) => smartTradeFingerprint({ ...trade, batchId });

  function snapshot(label) {
    undoSnapshot = {
      label,
      localTrades: JSON.parse(JSON.stringify(localTrades)),
      deletedTrades: [...deletedTrades],
      liveBatches: JSON.parse(JSON.stringify(liveBatches)),
      activeLiveBatch,
    };
  }
  function commit(message) {
    saveLocalTrades();
    saveLiveBatches();
    refreshAfterDataChange();
    excluded = new Set();
    renderBreakpointManager(message);
  }
  function undo() {
    if (!undoSnapshot) return;
    localTrades = undoSnapshot.localTrades;
    deletedTrades = new Set(undoSnapshot.deletedTrades);
    liveBatches = undoSnapshot.liveBatches;
    activeLiveBatch = undoSnapshot.activeLiveBatch;
    const label = undoSnapshot.label;
    undoSnapshot = null;
    populateLiveBatchOptions();
    commit(`已復原：${label}`);
  }

  // ---- Breakpoint list with a shared timeline ----
  function renderList() {
    const batches = allBatches();
    const summaries = batches.map((batch) => ({ batch, ...summarize(tradesIn(batch.id)) }));
    const dated = summaries.filter((row) => row.start);
    const min = dated.length ? Date.parse(dated.map((row) => row.start).sort()[0]) : 0;
    const max = dated.length ? Date.parse(dated.map((row) => row.end).sort().at(-1)) : 0;
    const span = Math.max(1, max - min);
    const bar = (row) => {
      if (!row.start) return '<span class="bpm-dim">沒有交易</span>';
      const left = (Date.parse(row.start) - min) / span * 100;
      const width = Math.max(1.5, (Date.parse(row.end) - Date.parse(row.start)) / span * 100);
      return `<div class="bpm-timeline" title="${row.start} ～ ${row.end}"><i style="left:${left}%;width:${Math.min(width, 100 - left)}%"></i></div>`;
    };
    $("#bpmTimelineRange").textContent = dated.length ? `${new Date(min).toISOString().slice(0, 10)} ～ ${new Date(max).toISOString().slice(0, 10)}` : "";
    $("#bpmRows").innerHTML = summaries.map((row) => {
      const active = row.batch.id === activeLiveBatch;
      return `<tr data-batch="${esc(row.batch.id)}" class="${active ? "is-active" : ""}">
        <td><span class="bpm-name">${esc(row.batch.name)}</span>${active ? '<span class="bpm-badge">目前</span>' : ""}<small>建立 ${esc(row.batch.createdAt || "—")}</small></td>
        <td class="num">${row.count}</td>
        <td>${row.start ? `${row.start}<small>至 ${row.end}</small>` : "—"}</td>
        <td class="bpm-timeline-cell">${bar(row)}</td>
        <td class="num ${tone(row.totalR)}">${row.count ? fmtR(row.totalR) : "—"}</td>
        <td class="num ${tone(row.profit)}">${row.count ? fmtMoney(row.profit) : "—"}</td>
        <td class="bpm-actions">
          ${active ? "" : '<button type="button" class="ghost-button" data-bpm="switch">切換</button>'}
          <button type="button" class="ghost-button" data-bpm="rename">重新命名</button>
          <button type="button" class="ghost-button" data-bpm="pick">選為來源</button>
          ${batches.length > 1 ? '<button type="button" class="ghost-button bpm-danger" data-bpm="delete">刪除</button>' : ""}
        </td>
      </tr>`;
    }).join("");
  }

  // ---- Range operations ----
  function readFilter() {
    const weekdays = [...document.querySelectorAll("#bpmWeekdays input:checked")].map((input) => Number(input.value));
    return {
      batchId: $("#bpmSource").value,
      from: $("#bpmFrom").value,
      to: $("#bpmTo").value,
      timeFrom: $("#bpmTimeFrom").value,
      timeTo: $("#bpmTimeTo").value,
      pair: $("#bpmPair").value,
      outcome: $("#bpmOutcome").value,
      weekdays,
    };
  }

  function syncControls() {
    const batches = allBatches();
    const source = $("#bpmSource");
    const current = source.value || activeLiveBatch;
    source.innerHTML = batches.map((batch) => `<option value="${esc(batch.id)}">${esc(batch.name)}（${tradesIn(batch.id).length}）</option>`).join("");
    source.value = batches.some((batch) => batch.id === current) ? current : batches[0]?.id || "";
    const target = $("#bpmTarget");
    const targetValue = target.value;
    target.innerHTML = batches.filter((batch) => batch.id !== source.value)
      .map((batch) => `<option value="${esc(batch.id)}">${esc(batch.name)}</option>`).join("") + '<option value="__new">＋ 新斷點…</option>';
    if ([...target.options].some((option) => option.value === targetValue)) target.value = targetValue;
    const pair = $("#bpmPair");
    const pairValue = pair.value || "all";
    const pairs = [...new Set(tradesIn(source.value).map((trade) => String(trade.pair || "").toUpperCase()).filter(Boolean))].sort();
    pair.innerHTML = `<option value="all">全部商品</option>${pairs.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}`;
    pair.value = pairs.includes(pairValue) ? pairValue : "all";
  }

  function renderPreview() {
    lastSelection = sortByDate(selectTrades(trades, readFilter())).reverse();
    const chosen = lastSelection.filter((trade) => !excluded.has(fingerprint(trade, batchOf(trade))));
    const sum = summarize(chosen);
    $("#bpmSummary").innerHTML = lastSelection.length
      ? `符合 <b>${lastSelection.length}</b> 筆，已勾選 <b>${chosen.length}</b> 筆 · <span class="${tone(sum.totalR)}">${fmtR(sum.totalR)}</span> · <span class="${tone(sum.profit)}">${fmtMoney(sum.profit)}</span>${sum.start ? ` · ${sum.start} ～ ${sum.end}` : ""}`
      : "沒有符合條件的交易。";
    const shown = lastSelection.slice(0, 300);
    $("#bpmPreviewRows").innerHTML = shown.map((trade) => {
      const key = fingerprint(trade, batchOf(trade));
      const legs = Array.isArray(trade.partialExits) && trade.partialExits.length > 1 ? `<small>${trade.partialExits.length} 段</small>` : "";
      return `<tr>
        <td><input type="checkbox" data-key="${esc(key)}" ${excluded.has(key) ? "" : "checked"} aria-label="選取這筆" /></td>
        <td>${esc(dateOf(trade))} <span class="bpm-dim">${esc(timeOf(trade))} 週${WEEKDAYS[new Date(`${dateOf(trade)}T00:00:00`).getDay()]}</span></td>
        <td>${esc(trade.pair || "")}${legs}</td>
        <td class="num ${tone(Number(trade.r))}">${Number.isFinite(Number(trade.r)) ? fmtR(Number(trade.r)) : "—"}</td>
        <td class="num ${tone(Number(trade.profit))}">${Number.isFinite(Number(trade.profit)) ? fmtMoney(Number(trade.profit)) : "—"}</td>
      </tr>`;
    }).join("") + (lastSelection.length > shown.length ? `<tr><td colspan="5" class="bpm-dim">另有 ${lastSelection.length - shown.length} 筆未列出（仍會一起處理，可縮小條件）</td></tr>` : "");
    $("#bpmCheckAll").checked = lastSelection.length > 0 && chosen.length === lastSelection.length;
    for (const button of document.querySelectorAll("[data-bpm-op]")) button.disabled = !chosen.length;
  }

  function runOperation(op) {
    const chosen = lastSelection.filter((trade) => !excluded.has(fingerprint(trade, batchOf(trade))));
    if (!chosen.length) return;
    const source = allBatches().find((batch) => batch.id === $("#bpmSource").value);
    let target = $("#bpmTarget").value;
    if (op !== "delete" && target === "__new") {
      const name = window.prompt("新斷點名稱", `${source?.name || "斷點"}（拆分）`);
      if (!name) return;
      target = `live-${Date.now()}`;
      snapshot(`${op === "move" ? "移動" : "複製"} ${chosen.length} 筆到「${name.trim()}」`);
      liveBatches.push({ id: target, name: name.trim(), createdAt: isoDate(new Date()) });
    } else {
      const targetName = allBatches().find((batch) => batch.id === target)?.name || "";
      const verb = { delete: "刪除", move: `移動到「${targetName}」`, copy: `複製到「${targetName}」` }[op];
      if (op === "delete" && !window.confirm(`確定從「${source?.name}」刪除這 ${chosen.length} 筆交易？\n\n刪除後可以在這一頁按「復原」，也建議定期下載完整備份。`)) return;
      snapshot(`${verb} ${chosen.length} 筆`);
    }
    const result = applyOperation({
      op,
      selected: chosen,
      localTrades,
      deletedTrades,
      target,
      destinationTrades: op === "delete" ? [] : tradesIn(target),
      fingerprint,
      cloneImported: cloneTradeForBatch,
      newId: () => crypto.randomUUID(),
    });
    localTrades = result.localTrades;
    deletedTrades = result.deletedTrades;
    if (op !== "delete") populateLiveBatchOptions();
    const targetName = allBatches().find((batch) => batch.id === target)?.name || "";
    const message = op === "delete"
      ? `已刪除 ${result.changed} 筆交易。`
      : `已${op === "move" ? "移動" : "複製"} ${result.changed} 筆到「${targetName}」${result.merged ? `，${result.merged} 筆目的地已有、已合併` : ""}。`;
    commit(message);
  }

  function renameBatch(id) {
    const batch = allBatches().find((item) => item.id === id);
    const name = batch && window.prompt("斷點名稱", batch.name);
    if (!name || !name.trim() || name.trim() === batch.name) return;
    snapshot(`重新命名「${batch.name}」`);
    batch.name = name.trim();
    populateLiveBatchOptions();
    commit(`已改名為「${batch.name}」。`);
  }

  function deleteBatch(id) {
    const batch = allBatches().find((item) => item.id === id);
    if (!batch || allBatches().length <= 1) return;
    const inside = tradesIn(id);
    if (!window.confirm(`確定刪除斷點「${batch.name}」與其中 ${inside.length} 筆交易？\n\n刪除後可以在這一頁按「復原」。`)) return;
    snapshot(`刪除斷點「${batch.name}」`);
    const result = applyOperation({ op: "delete", selected: inside, localTrades, deletedTrades, fingerprint, target: "" });
    localTrades = result.localTrades.filter((item) => batchOf(item) !== id);
    deletedTrades = result.deletedTrades;
    const index = liveBatches.findIndex((item) => item.id === id);
    liveBatches = liveBatches.filter((item) => item.id !== id);
    if (activeLiveBatch === id) activeLiveBatch = liveBatches[Math.min(index, liveBatches.length - 1)].id;
    populateLiveBatchOptions();
    commit(`已刪除斷點「${batch.name}」。`);
  }

  function createBatch() {
    const name = window.prompt("新斷點名稱", `實盤斷點 ${allBatches().length + 1}`);
    if (!name || !name.trim()) return;
    snapshot(`新增斷點「${name.trim()}」`);
    liveBatches.push({ id: `live-${Date.now()}`, name: name.trim(), createdAt: isoDate(new Date()) });
    populateLiveBatchOptions();
    commit(`已建立「${name.trim()}」。`);
  }

  function renderBreakpointManager(message = "") {
    if (!$("#bpmRows") || typeof trades === "undefined") return;
    bind();
    renderList();
    syncControls();
    renderPreview();
    const status = $("#bpmStatus");
    status.hidden = !message && !undoSnapshot;
    status.innerHTML = message || undoSnapshot
      ? `<span>${esc(message || `上一步：${undoSnapshot.label}`)}</span>${undoSnapshot ? `<button type="button" class="ghost-button" data-bpm-undo>復原</button>` : ""}`
      : "";
  }

  function bind() {
    const page = $("#breakpoints");
    if (!page || page.dataset.bound) return;
    page.dataset.bound = "true";
    page.addEventListener("click", (event) => {
      const action = event.target.closest("[data-bpm]");
      if (action) {
        const id = action.closest("tr")?.dataset.batch;
        if (action.dataset.bpm === "switch") { activeLiveBatch = id; saveLiveBatches(); populateLiveBatchOptions(); refreshAfterDataChange(); renderBreakpointManager(`已切換到「${liveBatchLabel(id)}」。`); }
        if (action.dataset.bpm === "rename") renameBatch(id);
        if (action.dataset.bpm === "delete") deleteBatch(id);
        if (action.dataset.bpm === "pick") { $("#bpmSource").value = id; excluded = new Set(); renderBreakpointManager(); $("#bpmRange").scrollIntoView({ behavior: "smooth", block: "start" }); }
        return;
      }
      if (event.target.closest("[data-bpm-undo]")) return undo();
      if (event.target.closest("#bpmCreate")) return createBatch();
      if (event.target.closest("#bpmReset")) {
        for (const id of ["#bpmFrom", "#bpmTo", "#bpmTimeFrom", "#bpmTimeTo"]) $(id).value = "";
        $("#bpmPair").value = "all";
        $("#bpmOutcome").value = "all";
        document.querySelectorAll("#bpmWeekdays input").forEach((input) => { input.checked = true; });
        excluded = new Set();
        return renderPreview();
      }
      const op = event.target.closest("[data-bpm-op]");
      if (op) runOperation(op.dataset.bpmOp);
    });
    page.addEventListener("change", (event) => {
      if (event.target.matches("#bpmPreviewRows input[data-key]")) {
        if (event.target.checked) excluded.delete(event.target.dataset.key);
        else excluded.add(event.target.dataset.key);
        return renderPreview();
      }
      if (event.target.matches("#bpmCheckAll")) {
        excluded = event.target.checked ? new Set() : new Set(lastSelection.map((trade) => fingerprint(trade, batchOf(trade))));
        return renderPreview();
      }
      if (event.target.matches("#bpmSource")) { excluded = new Set(); syncControls(); return renderPreview(); }
      if (event.target.closest("#bpmRange")) { excluded = new Set(); renderPreview(); }
    });
  }

  root.renderBreakpointManager = () => renderBreakpointManager();
})(typeof window !== "undefined" ? window : globalThis);
