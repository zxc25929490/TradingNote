export type Decision = "Long" | "Short" | "No Trade";
export type Session = "Asia" | "London" | "New York";
export type Result = "Win" | "Loss" | "BE";

export interface ResearchTrade {
  id: string;
  date: string;
  market: string;
  session: Session;
  setup: "突破" | "回撤";
  atr: number;
  myBias: "Long" | "Short" | "Neutral";
  myDecision: Decision;
  mambaDecision: Decision;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  result: Result;
  rMultiple: number;
  confidence: "A" | "B" | "C";
  mistakes: string[];
  notes: string;
  lesson: string;
  beforeImage?: string;
  afterImage?: string;
}

export interface TradingRule {
  id: string;
  title: string;
  description: string;
  status: "Testing" | "Verified" | "Discarded";
  confidence: number;
  linkedTrades: string[];
}
