import type { ResearchTrade, TradingRule } from "./types";
import { sampleRules, sampleTrades } from "./data";

const TRADE_KEY = "trading-research.trades.v1";
const RULE_KEY = "trading-research.rules.v1";

export const researchStore = {
  loadTrades(): ResearchTrade[] {
    if (typeof window === "undefined") return sampleTrades;
    try { return JSON.parse(localStorage.getItem(TRADE_KEY) || "null") || sampleTrades; } catch { return sampleTrades; }
  },
  saveTrades(items: ResearchTrade[]) { localStorage.setItem(TRADE_KEY, JSON.stringify(items)); },
  loadRules(): TradingRule[] {
    if (typeof window === "undefined") return sampleRules;
    try { return JSON.parse(localStorage.getItem(RULE_KEY) || "null") || sampleRules; } catch { return sampleRules; }
  },
  saveRules(items: TradingRule[]) { localStorage.setItem(RULE_KEY, JSON.stringify(items)); },
};
