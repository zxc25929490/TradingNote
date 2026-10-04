// Closed-loop review analytics: which execution mistakes cost the most R, whether execution is
// improving, and whether a written improvement action actually reduced the problem it targeted.
// Pure functions only; the review system supplies the trades and the attribution field list.
(function (root) {
  const amount = (trade, field) => {
    const value = Number(trade?.[field]);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  };
  const chronological = (trades) => [...(trades || [])].sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
  const mean = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0);
  const dayNumber = (date) => {
    const time = Date.parse(`${date}T00:00:00Z`);
    return Number.isNaN(time) ? null : Math.floor(time / 86400000);
  };
  const gapOf = (trade, fields) => fields.reduce((total, [field]) => total + amount(trade, field), 0);

  // Total R lost per mistake type, plus the last `days` days against the `days` before them.
  // The window is anchored on the latest trade date so old datasets still compare sensibly.
  function costRanking(trades, fields, { days = 30 } = {}) {
    const list = trades || [];
    const dated = list.map((trade) => dayNumber(trade.date)).filter((value) => value !== null);
    const anchor = dated.length ? Math.max(...dated) : null;
    const rows = fields.map(([field, label]) => {
      let total = 0;
      let count = 0;
      let recent = 0;
      let previous = 0;
      for (const trade of list) {
        const value = amount(trade, field);
        if (!value) continue;
        total += value;
        count += 1;
        const day = dayNumber(trade.date);
        if (anchor === null || day === null) continue;
        const age = anchor - day;
        if (age < days) recent += value;
        else if (age < days * 2) previous += value;
      }
      return { field, label, total, count, average: count ? total / count : 0, recent, previous, change: recent - previous };
    });
    const grand = rows.reduce((sum, row) => sum + row.total, 0);
    return rows.map((row) => ({ ...row, share: grand ? row.total / grand : 0 })).sort((a, b) => b.total - a.total);
  }

  function monthlyTrend(trades, fields, classOf = (trade) => trade.reviewClass) {
    const months = new Map();
    for (const trade of trades || []) {
      const month = String(trade.date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const bucket = months.get(month) || [];
      bucket.push(trade);
      months.set(month, bucket);
    }
    return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, items]) => {
      const reviewed = items.filter((trade) => classOf(trade));
      const count = (name) => reviewed.filter((trade) => classOf(trade) === name).length;
      const gap = items.reduce((sum, trade) => sum + gapOf(trade, fields), 0);
      return {
        month,
        trades: items.length,
        reviewed: reviewed.length,
        correctRate: reviewed.length ? count("correct_execution") / reviewed.length : null,
        violationRate: reviewed.length ? count("rule_violation") / reviewed.length : null,
        gapTotal: gap,
        gapPerTrade: items.length ? gap / items.length : 0,
        reasons: Object.fromEntries(fields.map(([field]) => [field, items.reduce((sum, trade) => sum + amount(trade, field), 0)])),
      };
    });
  }

  // First half of the history against the second half, measured per trade.
  function halves(trades, fields, classOf = (trade) => trade.reviewClass) {
    const ordered = chronological(trades);
    if (ordered.length < 10) return null;
    const middle = Math.floor(ordered.length / 2);
    const describe = (items) => {
      const reviewed = items.filter((trade) => classOf(trade));
      return {
        trades: items.length,
        gapPerTrade: mean(items.map((trade) => gapOf(trade, fields))),
        correctRate: reviewed.length ? reviewed.filter((trade) => classOf(trade) === "correct_execution").length / reviewed.length : null,
      };
    };
    const earlier = describe(ordered.slice(0, middle));
    const later = describe(ordered.slice(middle));
    const diff = later.gapPerTrade - earlier.gapPerTrade;
    const threshold = Math.max(0.02, earlier.gapPerTrade * 0.15);
    return { earlier, later, diff, direction: diff <= -threshold ? "improving" : diff >= threshold ? "worsening" : "flat" };
  }

  // For every improvement action written on a trade, compare how much R that trade's main mistake
  // cost over the `window` trades before it against the `window` trades after it.
  function improvementTracking(trades, fields, { window = 10, minSide = 5 } = {}) {
    const ordered = chronological(trades);
    const results = [];
    ordered.forEach((trade, index) => {
      const action = String(trade.improvement || "").trim();
      if (!action) return;
      let dominant = null;
      for (const [field, label] of fields) {
        const value = amount(trade, field);
        if (value > 0 && (!dominant || value > dominant.value)) dominant = { field, label, value };
      }
      const base = { date: trade.date || "", pair: trade.pair || "", action, reason: dominant?.label || null, field: dominant?.field || null, cost: dominant?.value || 0 };
      if (!dominant) { results.push({ ...base, verdict: "no-reason" }); return; }
      const before = ordered.slice(Math.max(0, index - window), index);
      const after = ordered.slice(index + 1, index + 1 + window);
      if (before.length < minSide || after.length < minSide) { results.push({ ...base, verdict: "insufficient", beforeN: before.length, afterN: after.length }); return; }
      const beforeAvg = mean(before.map((item) => amount(item, dominant.field)));
      const afterAvg = mean(after.map((item) => amount(item, dominant.field)));
      const verdict = beforeAvg > 0 && afterAvg <= beforeAvg * 0.7 ? "improved" : afterAvg >= beforeAvg * 1.3 && afterAvg > 0 ? "worse" : "flat";
      results.push({ ...base, verdict, before: beforeAvg, after: afterAvg, delta: afterAvg - beforeAvg, beforeN: before.length, afterN: after.length });
    });
    return results.sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
  }

  function summarizeActions(tracked) {
    const counts = { improved: 0, flat: 0, worse: 0, insufficient: 0, "no-reason": 0 };
    for (const item of tracked) counts[item.verdict] += 1;
    const judged = counts.improved + counts.flat + counts.worse;
    return { ...counts, total: tracked.length, judged, successRate: judged ? counts.improved / judged : null };
  }

  root.TradingNoteReviewLoop = { costRanking, monthlyTrend, halves, improvementTracking, summarizeActions, gapOf };
})(globalThis);
