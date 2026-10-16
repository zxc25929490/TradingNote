// Single definition of R for backtest (research-system) records.
//
// Research records store the MAXIMUM R the trade reached in their `r` field (the form label is
// 「最大到達 R」); a losing trade stores its loss as a negative number. Before any backtest R is compared
// with live trades it must be converted to the R the current partial-exit plan would have realised.
// Every system goes through these helpers instead of reading `trade.r` directly:
//   maximumR(trade)  -> stored maximum R, or null when there was no trade / nothing recorded
//   realizedR(trade) -> R realised under the partial-exit plan (shared/partial-exit.js), or null
//   normalize(trade) -> copy with { maximumR, r: realizedR }; safe to call more than once
(function (root) {
  const toNumber = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

  function maximumR(trade) {
    if (!trade || String(trade.mine || "") === "No Trade") return null;
    // Prefer an already-normalised maximum so normalize() stays idempotent.
    return toNumber(trade.maximumR !== undefined ? trade.maximumR : trade.r);
  }

  function realizedR(trade) {
    const maximum = maximumR(trade);
    if (maximum === null) return null;
    const plan = root.TradingNotePartialExit;
    const realized = plan ? toNumber(plan.realizedR(maximum)) : maximum;
    return realized === null ? maximum : realized;
  }

  function normalize(trade) {
    return { ...trade, maximumR: maximumR(trade), r: realizedR(trade) };
  }

  root.TradingNoteBacktestR = { maximumR, realizedR, normalize };
})(typeof window !== "undefined" ? window : globalThis);
