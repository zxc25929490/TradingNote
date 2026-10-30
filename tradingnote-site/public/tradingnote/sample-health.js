// Sample health: how far each kind of evidence is from being able to answer its question.
// - Backtest: is the strategy's average R reliably above zero?
// - Live vs Replay pairs: how big is the execution gap? (same day, same setup, so market luck cancels)
// - Live: can the live average R be judged yet, and how long will that take at the current pace?
// Targets use the usual two-sided 5% test with 80% power: n = ((1.96 + 0.84) * sd / effect)^2.
(function initSampleHealth(root) {
  const Z = 1.96 + 0.84;
  const finite = (value) => value !== "" && value != null && Number.isFinite(Number(value));
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function describe(values) {
    const n = values.length;
    const mean = n ? sum(values) / n : 0;
    const sd = n > 1 ? Math.sqrt(sum(values.map((value) => (value - mean) ** 2)) / (n - 1)) : 0;
    const half = n > 1 ? 1.96 * sd / Math.sqrt(n) : null;
    return { n, mean, sd, ci: half == null ? null : [mean - half, mean + half] };
  }
  const neededFor = (sd, effect, [low, high]) => (sd > 0 && effect > 0 ? clamp(Math.ceil((Z * sd / effect) ** 2), low, high) : null);

  // Trades per week over the last 8 weeks that had trades data, from the latest trade date.
  function weeklyPace(trades) {
    const dates = trades.map((trade) => Date.parse(trade.date)).filter(Number.isFinite);
    if (!dates.length) return 0;
    const latest = Math.max(...dates);
    const windowStart = latest - 56 * 86400000;
    const recent = dates.filter((time) => time > windowStart);
    const spanWeeks = Math.max(1, Math.min(8, (latest - Math.min(...recent)) / (7 * 86400000) + 1));
    return recent.length / spanWeeks;
  }

  // Shared by the backtest and live rows: is the average R decided yet?
  function edgeRow(values, { minimum = 20, max = 2000 } = {}) {
    const stats = describe(values);
    const needed = stats.mean > 0 ? neededFor(stats.sd, stats.mean, [30, max]) : null;
    let state = "collecting";
    if (stats.n >= minimum && stats.ci) {
      if (stats.ci[0] > 0) state = "positive";
      else if (stats.ci[1] < 0) state = "negative";
      else if (stats.mean <= 0) state = "no-edge-yet";
    }
    return { ...stats, needed, target: needed ?? Math.max(minimum, stats.n), state };
  }

  function pairedRow(liveTrades) {
    const diffs = liveTrades.filter((trade) => finite(trade.r) && finite(trade.replayR)).map((trade) => Number(trade.r) - Number(trade.replayR));
    const stats = describe(diffs);
    const target = stats.n >= 5 ? neededFor(stats.sd, 0.2, [15, 300]) ?? 15 : 30;
    let state = stats.n ? "collecting" : "none";
    if (stats.n >= target && stats.ci) state = stats.ci[1] < 0 ? "behind" : stats.ci[0] > 0 ? "ahead" : "matched";
    return { ...stats, target, state };
  }

  function sampleHealth({ live = [], backtest = [] } = {}) {
    const liveR = live.filter((trade) => !trade.riskUnavailable && finite(trade.r)).map((trade) => Number(trade.r));
    const backtestR = backtest.filter((trade) => !trade.riskUnavailable && finite(trade.r)).map((trade) => Number(trade.r));
    const pace = weeklyPace(live);
    const liveRow = edgeRow(liveR);
    const remaining = liveRow.needed ? Math.max(0, liveRow.needed - liveRow.n) : null;
    return {
      backtest: edgeRow(backtestR),
      paired: pairedRow(live),
      live: { ...liveRow, pace, remaining, weeksLeft: remaining != null && pace > 0 ? Math.ceil(remaining / pace) : null },
    };
  }

  root.TradingNoteSampleHealth = { sampleHealth, describe, weeklyPace, edgeRow, pairedRow };

  if (typeof document === "undefined") return;
  const fmtR = (value) => `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}R`;
  const esc = (value) => (typeof escapeHtml === "function" ? escapeHtml(value) : String(value));

  function row({ title, subtitle, n, target, unit, tone, status, link }) {
    const pct = target ? Math.min(100, Math.round(n / target * 100)) : 0;
    return `<div class="sh-row" data-tone="${tone}">
      <div class="sh-head"><b>${title}</b><span>${subtitle}</span></div>
      <div class="sh-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.min(n, target)}"><i style="width:${pct}%"></i></div>
      <div class="sh-foot"><strong>${n} / ${target} ${unit}</strong><span>${status}</span>${link}</div>
    </div>`;
  }

  function render(container, { live, backtest, backtestName }) {
    const health = sampleHealth({ live, backtest });
    const bt = health.backtest;
    const btStatus = {
      positive: `平均 ${fmtR(bt.mean)}，95% 區間全在 0 以上：回測已證明有優勢。`,
      negative: `平均 ${fmtR(bt.mean)}，區間全在 0 以下：回測顯示目前規則沒有優勢。`,
      "no-edge-yet": `平均 ${fmtR(bt.mean)}，還看不出優勢，先檢查規則本身。`,
      collecting: bt.n < 20
        ? `少於 20 筆，先多累積回測。`
        : `平均 ${fmtR(bt.mean)}，區間 ${fmtR(bt.ci[0])} ～ ${fmtR(bt.ci[1])}，還差 ${Math.max(0, bt.target - bt.n)} 筆。`,
    }[bt.state];
    const pr = health.paired;
    const prStatus = {
      none: "還沒有任何配對：到「實盤復盤」用 Replay 重播交易日。",
      collecting: pr.n >= 2
        ? `目前執行落差平均 ${fmtR(pr.mean)}，還差 ${Math.max(0, pr.target - pr.n)} 筆可以下結論。`
        : `還差 ${Math.max(0, pr.target - pr.n)} 筆可以下結論。`,
      behind: `實盤平均比 Replay 少 ${fmtR(Math.abs(pr.mean)).replace("+", "")}，落差明確：問題在執行。`,
      ahead: `實盤平均比 Replay 多 ${fmtR(pr.mean).replace("+", "")}，執行沒有拖累。`,
      matched: `實盤與 Replay 差 ${fmtR(pr.mean)}，在誤差範圍內：執行與規則一致。`,
    }[pr.state];
    const lv = health.live;
    const pace = lv.pace ? `每週約 ${lv.pace.toFixed(1)} 筆` : "";
    const liveStatus = {
      positive: `平均 ${fmtR(lv.mean)}，區間全在 0 以上：實盤已確認有優勢。`,
      negative: `平均 ${fmtR(lv.mean)}，區間全在 0 以下：實盤確定在虧，先看配對找原因。`,
      "no-edge-yet": `平均 ${fmtR(lv.mean)}，目前沒有正期望；用上面兩列找原因，不必等更多筆。`,
      collecting: lv.n < 20
        ? `少於 20 筆，先只看有沒有照計畫。`
        : `區間 ${fmtR(lv.ci[0])} ～ ${fmtR(lv.ci[1])}，還不能判斷${lv.weeksLeft != null ? `；照${pace}約需 ${lv.weeksLeft} 週` : ""}。`,
    }[lv.state];
    const tone = (state) => ({ positive: "good", matched: "good", ahead: "good", negative: "bad", behind: "bad", "no-edge-yet": "warn", none: "warn" })[state] || "muted";
    container.innerHTML = `<div class="acct"><article class="acct-card sample-health">
      <div class="acct-card-head"><h3>樣本健康</h3><span class="acct-muted">${pace ? `${pace} · ` : ""}離「可以判斷」還差多少</span></div>
      <div class="sh-rows">
        ${row({ title: "回測樣本", subtitle: esc(backtestName || "尚未建立回測斷點"), n: bt.n, target: bt.target, unit: "筆", tone: tone(bt.state), status: btStatus, link: '<a class="acct-link" href="../research-system/index.html">新增回測 →</a>' })}
        ${row({ title: "實盤 vs Replay 配對", subtitle: "同一天重播，市場運氣互相抵消，最快看出執行落差", n: pr.n, target: pr.target, unit: "筆", tone: tone(pr.state), status: prStatus, link: '<a class="acct-link" href="../review-system/index.html">去 Replay →</a>' })}
        ${row({ title: "實盤", subtitle: "目前斷點的平均 R 能不能下結論", n: lv.n, target: lv.target, unit: "筆", tone: tone(lv.state), status: liveStatus, link: '<a class="acct-link" href="#breakpoint-compare">斷點比較 →</a>' })}
      </div>
    </article></div>`;
  }

  root.TradingNoteSampleHealth.render = render;
})(typeof window !== "undefined" ? window : globalThis);
