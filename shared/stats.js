// Pure statistics helpers for TradingNote analytics. No DOM access: every function takes plain
// arrays/trade objects and tolerates missing fields, so it can be unit-tested in Node.
(function (root) {
  const finite = (value) => value !== null && value !== "" && value !== undefined && Number.isFinite(Number(value));
  const num = (value) => (finite(value) ? Number(value) : null);
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const mean = (values) => (values.length ? sum(values) / values.length : 0);
  const variance = (values) => {
    if (values.length < 2) return 0;
    const m = mean(values);
    return sum(values.map((value) => (value - m) ** 2)) / (values.length - 1);
  };
  const sd = (values) => Math.sqrt(variance(values));
  const quantile = (values, q) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
  };
  const median = (values) => quantile(values, 0.5);

  // Deterministic PRNG so bootstrap / Monte Carlo results do not flicker between renders.
  function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Student t distribution (two-sided p) via the regularized incomplete beta function ----
  function logGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let series = 1.000000000190015;
    for (let j = 0; j < 6; j += 1) series += c[j] / (y += 1);
    return -tmp + Math.log((2.5066282746310005 * series) / x);
  }
  function betaContinuedFraction(a, b, x) {
    const tiny = 1e-30;
    let c = 1;
    let d = 1 - ((a + b) * x) / (a + 1);
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 200; m += 1) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 3e-12) break;
    }
    return h;
  }
  function incompleteBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2)
      ? (front * betaContinuedFraction(a, b, x)) / a
      : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
  }
  const tTwoSidedP = (t, df) => (df > 0 && Number.isFinite(t) ? incompleteBeta(df / (df + t * t), df / 2, 0.5) : 1);
  const normalCdf = (z) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  };

  function welch(a, b) {
    if (a.length < 2 || b.length < 2) return { t: 0, df: 0, p: 1, diff: mean(a) - mean(b) };
    const va = variance(a) / a.length;
    const vb = variance(b) / b.length;
    const se = Math.sqrt(va + vb);
    if (!se) return { t: 0, df: a.length + b.length - 2, p: 1, diff: mean(a) - mean(b) };
    const t = (mean(a) - mean(b)) / se;
    const df = (va + vb) ** 2 / ((va ** 2) / (a.length - 1) + (vb ** 2) / (b.length - 1));
    return { t, df, p: tTwoSidedP(t, df), diff: mean(a) - mean(b) };
  }

  const rOf = (trade) => num(trade?.r);
  const rValues = (items) => (items || []).map(rOf).filter((value) => value !== null);

  // ---- Core R statistics ----
  function basics(values) {
    const n = values.length;
    const wins = values.filter((value) => value > 0);
    const losses = values.filter((value) => value < 0);
    const grossWin = sum(wins);
    const grossLoss = Math.abs(sum(losses));
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    return {
      n,
      total: sum(values),
      mean: mean(values),
      sd: sd(values),
      winRate: n ? (wins.length / n) * 100 : 0,
      avgWin,
      avgLoss,
      payoff: avgLoss ? avgWin / avgLoss : avgWin ? Infinity : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
    };
  }

  function edgeSignificance(values, { runs = 2000, seed = 7 } = {}) {
    const n = values.length;
    if (n < 3) return { n, mean: mean(values), t: 0, p: 1, ci95: null, probPositive: null };
    const m = mean(values);
    const se = sd(values) / Math.sqrt(n);
    const t = se ? m / se : 0;
    const random = mulberry32(seed);
    const means = [];
    for (let run = 0; run < runs; run += 1) {
      let total = 0;
      for (let i = 0; i < n; i += 1) total += values[Math.floor(random() * n)];
      means.push(total / n);
    }
    return {
      n,
      mean: m,
      se,
      t,
      p: tTwoSidedP(t, n - 1),
      ci95: [quantile(means, 0.025), quantile(means, 0.975)],
      probPositive: means.filter((value) => value > 0).length / runs,
    };
  }

  // ---- Equity, drawdown and time under water ----
  function drawdownProfile(values) {
    const equity = [];
    const drawdown = [];
    let running = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let maxDrawdownIndex = -1;
    let underwaterStart = null;
    const episodes = [];
    values.forEach((value, index) => {
      running += value;
      equity.push(running);
      if (running >= peak) {
        if (underwaterStart !== null) {
          episodes.push({ start: underwaterStart, end: index, length: index - underwaterStart, depth: Math.min(...drawdown.slice(underwaterStart, index)), recovered: true });
          underwaterStart = null;
        }
        peak = running;
      } else if (underwaterStart === null) {
        underwaterStart = index;
      }
      const dd = running - peak;
      drawdown.push(dd);
      if (dd < maxDrawdown) { maxDrawdown = dd; maxDrawdownIndex = index; }
    });
    if (underwaterStart !== null) {
      episodes.push({ start: underwaterStart, end: values.length - 1, length: values.length - underwaterStart, depth: Math.min(...drawdown.slice(underwaterStart)), recovered: false });
    }
    const longest = episodes.reduce((best, episode) => (episode.length > (best?.length || 0) ? episode : best), null);
    return {
      equity,
      drawdown,
      maxDrawdown,
      maxDrawdownIndex,
      currentDrawdown: drawdown.at(-1) ?? 0,
      episodes,
      longest,
      recoveryFactor: maxDrawdown ? sum(values) / Math.abs(maxDrawdown) : null,
    };
  }

  function dailyR(items) {
    const byDay = new Map();
    for (const trade of items || []) {
      const r = rOf(trade);
      if (r === null || !trade.date) continue;
      byDay.set(trade.date, (byDay.get(trade.date) || 0) + r);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
  }

  // Empirical Kelly: the risk fraction (of equity, per 1R) that maximises mean log growth.
  function empiricalKelly(values) {
    const losses = values.filter((value) => value < 0);
    if (!values.length || !losses.length || mean(values) <= 0) return { fraction: 0, growth: 0 };
    const worst = Math.abs(Math.min(...values));
    const limit = (1 / worst) * 0.999;
    let best = { fraction: 0, growth: 0 };
    for (let step = 1; step <= 400; step += 1) {
      const fraction = (limit * step) / 400;
      const growth = mean(values.map((value) => Math.log(1 + fraction * value)));
      if (growth > best.growth) best = { fraction, growth };
    }
    return best;
  }

  function riskAdjusted(items) {
    const values = rValues(items);
    const core = basics(values);
    const days = dailyR(items).map((day) => day.value);
    const profile = drawdownProfile(values);
    const dailyMean = mean(days);
    const dailySd = sd(days);
    const downside = days.length ? Math.sqrt(mean(days.map((value) => Math.min(0, value) ** 2))) : 0;
    const kelly = empiricalKelly(values);
    const formulaKelly = core.payoff && Number.isFinite(core.payoff)
      ? core.winRate / 100 - (1 - core.winRate / 100) / core.payoff
      : null;
    return {
      ...core,
      tradingDays: days.length,
      sqn: core.n >= 2 && core.sd ? (Math.sqrt(Math.min(core.n, 100)) * core.mean) / core.sd : null,
      sharpeDaily: days.length >= 5 && dailySd ? (dailyMean / dailySd) * Math.sqrt(252) : null,
      sortinoDaily: days.length >= 5 && downside ? (dailyMean / downside) * Math.sqrt(252) : null,
      maxDrawdown: profile.maxDrawdown,
      recoveryFactor: profile.recoveryFactor,
      kelly: formulaKelly,
      empiricalKelly: kelly.fraction,
      halfKelly: kelly.fraction / 2,
      edge: edgeSignificance(values),
    };
  }

  // ---- Prop-firm style survival: bootstrap the R distribution at a chosen risk per trade ----
  function breachProbability(values, { riskPct = 1, maxLossPct = 10, targetPct = 10, trades = 100, runs = 3000, seed = 11 } = {}) {
    if (values.length < 5) return null;
    const random = mulberry32(seed);
    let staticBreach = 0;
    let trailingBreach = 0;
    let passed = 0;
    const finals = [];
    const worstDrawdowns = [];
    const tradesToTarget = [];
    for (let run = 0; run < runs; run += 1) {
      let equity = 0;
      let peak = 0;
      let worst = 0;
      let breached = false;
      let trailing = false;
      let hitAt = null;
      for (let i = 0; i < trades; i += 1) {
        equity += values[Math.floor(random() * values.length)] * riskPct;
        peak = Math.max(peak, equity);
        worst = Math.max(worst, peak - equity);
        if (!breached && equity <= -maxLossPct) breached = true;
        if (!trailing && peak - equity >= maxLossPct) trailing = true;
        if (hitAt === null && !breached && equity >= targetPct) hitAt = i + 1;
      }
      if (breached) staticBreach += 1;
      if (trailing) trailingBreach += 1;
      if (hitAt !== null) { passed += 1; tradesToTarget.push(hitAt); }
      finals.push(equity);
      worstDrawdowns.push(worst);
    }
    return {
      runs,
      trades,
      staticBreach: staticBreach / runs,
      trailingBreach: trailingBreach / runs,
      passRate: passed / runs,
      medianTradesToTarget: median(tradesToTarget),
      finalP5: quantile(finals, 0.05),
      finalP50: quantile(finals, 0.5),
      finalP95: quantile(finals, 0.95),
      drawdownP95: quantile(worstDrawdowns, 0.95),
    };
  }

  // ---- Sequence dependence and edge decay ----
  function rollingMetrics(values, window) {
    const size = Math.max(2, Math.min(window || 30, values.length));
    const rows = [];
    for (let end = size; end <= values.length; end += 1) {
      const slice = values.slice(end - size, end);
      const wins = slice.filter((value) => value > 0).length;
      const gain = sum(slice.filter((value) => value > 0));
      const loss = Math.abs(sum(slice.filter((value) => value < 0)));
      rows.push({ index: end - 1, mean: mean(slice), winRate: (wins / slice.length) * 100, profitFactor: loss ? gain / loss : null });
    }
    return { window: size, rows };
  }

  function edgeDecay(values, window) {
    const size = Math.max(5, Math.min(window || 30, Math.floor(values.length / 2)));
    if (values.length < size * 2) return null;
    const recent = values.slice(-size);
    const earlier = values.slice(0, -size);
    const test = welch(recent, earlier);
    return { window: size, recent: mean(recent), earlier: mean(earlier), diff: test.diff, p: test.p, declining: test.diff < 0 && test.p < 0.1 };
  }

  const isLoss = (value) => value < -0.05;
  const isWin = (value) => value > 0.05;

  function afterLosses(values) {
    const buckets = [
      { label: "贏單之後", match: (streak, previous) => isWin(previous) },
      { label: "虧 1 筆之後", match: (streak) => streak === 1 },
      { label: "連虧 2 筆之後", match: (streak) => streak === 2 },
      { label: "連虧 3 筆以上之後", match: (streak) => streak >= 3 },
    ].map((bucket) => ({ ...bucket, values: [] }));
    let streak = 0;
    for (let i = 0; i < values.length - 1; i += 1) {
      streak = isLoss(values[i]) ? streak + 1 : 0;
      const next = values[i + 1];
      for (const bucket of buckets) if (bucket.match(streak, values[i])) bucket.values.push(next);
    }
    return buckets.map((bucket) => ({
      label: bucket.label,
      n: bucket.values.length,
      mean: mean(bucket.values),
      winRate: bucket.values.length ? (bucket.values.filter((value) => value > 0).length / bucket.values.length) * 100 : 0,
    }));
  }

  // Wald–Wolfowitz runs test on win/loss order (break-even trades ignored).
  function runsTest(values) {
    const signs = values.filter((value) => isWin(value) || isLoss(value)).map(isWin);
    const n1 = signs.filter(Boolean).length;
    const n2 = signs.length - n1;
    if (n1 < 5 || n2 < 5) return null;
    let runs = 1;
    for (let i = 1; i < signs.length; i += 1) if (signs[i] !== signs[i - 1]) runs += 1;
    const total = n1 + n2;
    const expected = (2 * n1 * n2) / total + 1;
    const varianceRuns = (2 * n1 * n2 * (2 * n1 * n2 - total)) / (total ** 2 * (total - 1));
    const z = varianceRuns ? (runs - expected) / Math.sqrt(varianceRuns) : 0;
    return { runs, expected, z, p: 2 * (1 - normalCdf(Math.abs(z))), pattern: z < -1.96 ? "clustered" : z > 1.96 ? "alternating" : "random" };
  }

  // ---- Exit quality (needs mfeR / maeR from the EA) ----
  function exitQuality(items) {
    const rows = (items || [])
      .map((trade) => ({ r: rOf(trade), mfe: num(trade.mfeR), mae: num(trade.maeR), efficiency: num(trade.exitEfficiencyPct), giveback: num(trade.maxGivebackR) }))
      .filter((row) => row.r !== null && row.mfe !== null);
    const total = (items || []).length;
    const base = { total, covered: rows.length, coverage: total ? rows.length / total : 0 };
    if (!rows.length) return base;
    const winners = rows.filter((row) => row.r > 0);
    const losers = rows.filter((row) => row.r < 0);
    const withMae = rows.filter((row) => row.mae !== null);
    const winnersMae = winners.filter((row) => row.mae !== null);
    const efficiencyOf = (row) => (row.efficiency !== null ? row.efficiency : row.mfe > 0 ? Math.max(0, Math.min(100, (row.r / row.mfe) * 100)) : null);
    const efficiencies = winners.map(efficiencyOf).filter((value) => value !== null);
    const maeBuckets = [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, Infinity]].map(([low, high]) => {
      const count = winnersMae.filter((row) => -row.mae >= low && -row.mae < high).length;
      return { label: high === Infinity ? "≥ -0.75R" : `-${low.toFixed(2)} ~ -${high.toFixed(2)}R`, count, share: winnersMae.length ? count / winnersMae.length : 0 };
    });
    const touched = (threshold) => losers.filter((row) => row.mfe >= threshold).length;
    const stopSimulation = [0.5, 0.6, 0.7, 0.8, 0.9].map((stop) => {
      let delta = 0;
      let stoppedWinners = 0;
      let stoppedLosers = 0;
      for (const row of withMae) {
        if (row.mae <= -stop) {
          // A tighter stop would have closed the trade at -stop instead of its actual result.
          delta += -stop - row.r;
          if (row.r > 0) stoppedWinners += 1; else stoppedLosers += 1;
        }
      }
      return { stop, delta, stoppedWinners, stoppedLosers };
    });
    return {
      ...base,
      avgMfeWin: mean(winners.map((row) => row.mfe)),
      avgMfeLoss: losers.length ? mean(losers.map((row) => row.mfe)) : null,
      avgMaeWin: winnersMae.length ? mean(winnersMae.map((row) => row.mae)) : null,
      avgMaeLoss: withMae.filter((row) => row.r < 0).length ? mean(withMae.filter((row) => row.r < 0).map((row) => row.mae)) : null,
      efficiency: efficiencies.length ? mean(efficiencies) : null,
      leftOnTable: winners.length ? mean(winners.map((row) => Math.max(0, row.mfe - row.r))) : null,
      avgGiveback: rows.filter((row) => row.giveback !== null).length ? mean(rows.filter((row) => row.giveback !== null).map((row) => row.giveback)) : null,
      lostAfterHalfR: { count: touched(0.5), share: losers.length ? touched(0.5) / losers.length : 0 },
      lostAfterOneR: { count: touched(1), share: losers.length ? touched(1) / losers.length : 0 },
      reachedOneR: rows.filter((row) => row.mfe >= 1).length,
      maeBuckets,
      maeCoverage: withMae.length,
      stopSimulation,
      points: rows.filter((row) => row.mae !== null).map((row) => ({ mae: row.mae, mfe: row.mfe, r: row.r })),
    };
  }

  // ---- Holding time ----
  const HOLD_BUCKETS = [
    ["< 5 分鐘", 0, 300], ["5–15 分鐘", 300, 900], ["15–60 分鐘", 900, 3600], ["1–4 小時", 3600, 14400], ["4 小時以上", 14400, Infinity],
  ];
  function pearson(xs, ys) {
    if (xs.length < 3) return null;
    const mx = mean(xs);
    const my = mean(ys);
    let numerator = 0;
    let dx = 0;
    let dy = 0;
    xs.forEach((x, i) => { numerator += (x - mx) * (ys[i] - my); dx += (x - mx) ** 2; dy += (ys[i] - my) ** 2; });
    return dx && dy ? numerator / Math.sqrt(dx * dy) : null;
  }
  function holdingAnalysis(items) {
    const rows = (items || []).map((trade) => ({ r: rOf(trade), seconds: num(trade.holdingSeconds) })).filter((row) => row.r !== null && row.seconds !== null && row.seconds >= 0);
    const total = (items || []).length;
    const base = { total, covered: rows.length, coverage: total ? rows.length / total : 0 };
    if (!rows.length) return base;
    const winners = rows.filter((row) => row.r > 0).map((row) => row.seconds);
    const losers = rows.filter((row) => row.r < 0).map((row) => row.seconds);
    return {
      ...base,
      medianWin: winners.length ? median(winners) : null,
      medianLoss: losers.length ? median(losers) : null,
      lossToWinRatio: winners.length && losers.length && median(winners) ? median(losers) / median(winners) : null,
      correlation: pearson(rows.map((row) => Math.log1p(row.seconds)), rows.map((row) => row.r)),
      buckets: HOLD_BUCKETS.map(([label, low, high]) => {
        const group = rows.filter((row) => row.seconds >= low && row.seconds < high).map((row) => row.r);
        return { label, n: group.length, mean: group.length ? mean(group) : null, winRate: group.length ? (group.filter((value) => value > 0).length / group.length) * 100 : null, total: sum(group) };
      }),
    };
  }

  // ---- Costs ----
  function tradeCostMoney(trade) {
    const commission = num(trade.commission);
    const swap = num(trade.swap);
    if (commission !== null || swap !== null) return -((commission || 0) + (swap || 0));
    const gross = num(trade.grossProfit);
    const net = num(trade.profit);
    return gross !== null && net !== null ? gross - net : null;
  }
  function tradeCostR(trade) {
    const grossR = num(trade.grossR);
    const r = rOf(trade);
    if (grossR !== null && r !== null) return grossR - r;
    const money = tradeCostMoney(trade);
    const risk = num(trade.initialRiskMoney);
    return money !== null && risk ? money / risk : null;
  }
  function costAnalysis(items, groupers = {}) {
    const list = items || [];
    const rows = list.map((trade) => ({ trade, costMoney: tradeCostMoney(trade), costR: tradeCostR(trade) })).filter((row) => row.costMoney !== null || row.costR !== null);
    const base = { total: list.length, covered: rows.length, coverage: list.length ? rows.length / list.length : 0 };
    if (!rows.length) return base;
    const withR = rows.filter((row) => row.costR !== null);
    const grossMoney = sum(rows.map((row) => num(row.trade.grossProfit) ?? (num(row.trade.profit) !== null && row.costMoney !== null ? num(row.trade.profit) + row.costMoney : 0)));
    const spreads = rows.map((row) => num(row.trade.entrySpreadPoints)).filter((value) => value !== null);
    const group = (keyFn) => {
      const map = new Map();
      for (const row of withR) {
        const key = keyFn(row.trade);
        if (!key) continue;
        const bucket = map.get(key) || [];
        bucket.push(row.costR);
        map.set(key, bucket);
      }
      return [...map.entries()].map(([label, values]) => ({ label, n: values.length, avgCostR: mean(values), totalCostR: sum(values) })).sort((a, b) => b.avgCostR - a.avgCostR);
    };
    const grossValues = list.map((trade) => num(trade.grossR)).filter((value) => value !== null);
    const gross = grossValues.length ? mean(grossValues) : null;
    return {
      ...base,
      costMoney: sum(rows.map((row) => row.costMoney || 0)),
      commission: -sum(rows.map((row) => num(row.trade.commission) || 0)),
      swap: -sum(rows.map((row) => num(row.trade.swap) || 0)),
      spreadCost: sum(rows.map((row) => num(row.trade.spreadCostEstimate) || 0)),
      costPctOfGross: grossMoney > 0 ? (sum(rows.map((row) => row.costMoney || 0)) / grossMoney) * 100 : null,
      avgCostR: withR.length ? mean(withR.map((row) => row.costR)) : null,
      grossExpectancy: gross,
      netExpectancy: mean(rValues(rows.map((row) => row.trade))),
      avgEntrySpread: spreads.length ? mean(spreads) : null,
      maxSpread: spreads.length ? Math.max(...spreads) : null,
      groups: Object.fromEntries(Object.entries(groupers).map(([name, keyFn]) => [name, group(keyFn)])),
    };
  }

  // ---- Exposure and over-trading ----
  const tradeTime = (trade) => {
    if (!trade?.date) return null;
    const time = Date.parse(`${trade.date}T${String(trade.time || "00:00:00").slice(0, 8)}`);
    return Number.isNaN(time) ? null : time;
  };
  function describeGroup(values) {
    return { n: values.length, mean: values.length ? mean(values) : null, winRate: values.length ? (values.filter((value) => value > 0).length / values.length) * 100 : null, total: sum(values) };
  }
  function exposureAnalysis(items, { revengeMinutes = 20 } = {}) {
    const list = (items || []).filter((trade) => rOf(trade) !== null);
    const riskPcts = list.map((trade) => num(trade.riskPctEquity)).filter((value) => value !== null && value > 0);
    const byOpen = (match) => describeGroup(list.filter((trade) => num(trade.openTradesAtEntry) !== null && match(Number(trade.openTradesAtEntry))).map(rOf));
    const bySame = (match) => describeGroup(list.filter((trade) => num(trade.sameSymbolTradesAtEntry) !== null && match(Number(trade.sameSymbolTradesAtEntry))).map(rOf));
    const days = new Map();
    for (const trade of list) {
      if (!trade.date) continue;
      const bucket = days.get(trade.date) || [];
      bucket.push(rOf(trade));
      days.set(trade.date, bucket);
    }
    const perDay = (match) => {
      const selected = [...days.values()].filter((values) => match(values.length));
      return { days: selected.length, trades: sum(selected.map((values) => values.length)), avgPerTrade: selected.length ? mean(selected.flat()) : null, avgDayR: selected.length ? mean(selected.map(sum)) : null };
    };
    const ordered = list.map((trade) => ({ trade, time: tradeTime(trade) })).filter((row) => row.time !== null).sort((a, b) => a.time - b.time);
    const fast = [];
    const other = [];
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1];
      const gapMinutes = (ordered[i].time - previous.time) / 60000;
      (rOf(previous.trade) < 0 && gapMinutes <= revengeMinutes ? fast : other).push(rOf(ordered[i].trade));
    }
    return {
      total: list.length,
      risk: riskPcts.length ? { covered: riskPcts.length, mean: mean(riskPcts), sd: sd(riskPcts), cv: mean(riskPcts) ? sd(riskPcts) / mean(riskPcts) : 0, min: Math.min(...riskPcts), max: Math.max(...riskPcts) } : null,
      openTrades: { alone: byOpen((n) => n === 0), one: byOpen((n) => n === 1), multiple: byOpen((n) => n >= 2) },
      sameSymbol: { first: bySame((n) => n === 0), stacked: bySame((n) => n >= 1) },
      perDay: { one: perDay((n) => n === 1), two: perDay((n) => n === 2), three: perDay((n) => n === 3), fourPlus: perDay((n) => n >= 4) },
      revenge: { minutes: revengeMinutes, quick: describeGroup(fast), other: describeGroup(other), test: fast.length >= 3 && other.length >= 3 ? welch(fast, other) : null },
    };
  }

  // ---- Cross tabulation with multiple-comparison control ----
  function crossTab(items, rowFn, colFn, { minN = 5, alpha = 0.05 } = {}) {
    const list = (items || []).filter((trade) => rOf(trade) !== null);
    const all = list.map(rOf);
    const cells = new Map();
    const rowSet = new Set();
    const colSet = new Set();
    for (const trade of list) {
      const row = rowFn(trade);
      const col = colFn(trade);
      if (!row || !col) continue;
      rowSet.add(row);
      colSet.add(col);
      const key = `${row}\u0000${col}`;
      const bucket = cells.get(key) || [];
      bucket.push(rOf(trade));
      cells.set(key, bucket);
    }
    const tested = [...cells.values()].filter((values) => values.length >= minN).length;
    const adjusted = tested ? alpha / tested : alpha;
    const result = new Map();
    for (const [key, values] of cells) {
      const rest = [];
      // Compare against every other trade that is not in this cell.
      const inCell = new Set();
      const [row, col] = key.split("\u0000");
      list.forEach((trade, index) => { if (rowFn(trade) === row && colFn(trade) === col) inCell.add(index); });
      list.forEach((trade, index) => { if (!inCell.has(index)) rest.push(all[index]); });
      const test = values.length >= minN ? welch(values, rest) : null;
      result.set(key, {
        ...describeGroup(values),
        enough: values.length >= minN,
        p: test ? test.p : null,
        significant: Boolean(test && test.p < adjusted),
        looksSignificant: Boolean(test && test.p < alpha),
      });
    }
    return { rows: [...rowSet], cols: [...colSet], cell: (row, col) => result.get(`${row}\u0000${col}`) || null, testedCells: tested, adjustedAlpha: adjusted };
  }

  root.TradingNoteStats = {
    finite, num, mean, sd, median, quantile, mulberry32, tTwoSidedP, welch, basics, edgeSignificance, drawdownProfile,
    dailyR, empiricalKelly, riskAdjusted, breachProbability, rollingMetrics, edgeDecay, afterLosses, runsTest,
    exitQuality, holdingAnalysis, costAnalysis, exposureAnalysis, crossTab, pearson,
  };
})(globalThis);
