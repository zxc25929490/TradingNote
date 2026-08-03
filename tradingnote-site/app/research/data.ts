import type { ResearchTrade, TradingRule } from "./types";

const rows = [
  ["2026-01-05","DJ30","New York","突破",26,"Long","Long","Long",22,"A",[],"趨勢清楚，等待突破確認。","突破後不追第一根，等回踩確認。"],
  ["2026-01-05","NAS100","New York","突破",18,"Long","Long","No Trade",0,"B",["Breakout Chase","Poor RR"],"回撤時機晚且 SL 要更大。","沒有合理停損就不是機會。"],
  ["2026-01-06","DJ30","New York","突破",18,"Long","Long","No Trade",0,"B",["Didn't Wait Candle Close"],"未等收線確認。","收線前的突破不是有效訊號。"],
  ["2026-01-06","NAS100","New York","突破",15,"Long","Long","No Trade",2.5,"B",["Ignored Liquidity"],"應選擇更乾淨的商品。","先比較 DJ30 與 NAS100 的結構。"],
  ["2026-01-07","NAS100","London","突破",12,"Long","Long","Long",4,"A",[],"流動性清掃後結構轉多。","乾淨結構可以持有到下一個流動性。"],
  ["2026-01-07","DJ30","New York","回撤",35,"Short","Short","No Trade",-1,"C",["Counter Trend","FOMO"],"逆勢回撤失敗。","高週期方向相反時不做。"],
  ["2026-01-08","NAS100","New York","突破",21,"Long","Long","Long",5,"A",[],"很多 BE 是正常的。","先保本，再讓有效突破延伸。"],
  ["2026-01-12","DJ30","New York","突破",35,"Long","No Trade","Long",0,"B",["Entered Too Early"],"錯過確認後沒有執行。","符合規則時必須執行，不用等完美。"],
  ["2026-03-02","DJ30","New York","回撤",45,"Long","Long","Long",3.53,"A",[],"回撤至支撐，風險結構清楚。","支撐停損比固定停損更貼近結構。"],
  ["2026-03-03","NAS100","New York","回撤",35,"Short","Short","No Trade",-1,"C",["News Trade","Emotional Trade"],"消息前強行找機會。","重大消息前 30 分鐘不開倉。"],
  ["2026-03-04","DJ30","New York","突破",50,"Long","Long","Long",3.25,"A",[],"突破後回測有效。","保留突破＋回測的標準模型。"],
  ["2026-03-05","DJ30","New York","突破",52,"Long","Long","No Trade",-1,"C",["Breakout Chase","FOMO"],"連續錯過後追價。","錯過就記錄，不補償性進場。"],
  ["2026-03-10","NAS100","London","突破",30,"Long","Long","Long",2.2,"B",[],"倫敦盤延續結構。","B 級訊號只在 RR 大於 2 時執行。"],
  ["2026-03-11","DJ30","New York","回撤",70,"Long","Long","No Trade",-1,"C",["Poor RR","Ignored Higher Timeframe"],"波動過大但仍進場。","ATR 過高時放棄，不縮小結構停損。"],
  ["2026-03-12","NAS100","New York","回撤",37,"Long","Long","Long",2.79,"A",[],"高週期與流動性方向一致。","A 級回撤模型可承擔完整 1R。"],
  ["2026-03-13","DJ30","New York","回撤",67,"Short","Short","No Trade",-1,"C",["Counter Trend"],"逆高週期做空。","方向不一致直接 No Trade。"],
] as const;

export const sampleTrades: ResearchTrade[] = rows.map((r, index) => ({
  id: `BT-${String(index + 1).padStart(3, "0")}`,
  date: r[0], market: r[1], session: r[2], setup: r[3], atr: r[4], myBias: r[5],
  myDecision: r[6], mambaDecision: r[7], rMultiple: r[8], confidence: r[9], mistakes: [...r[10]],
  notes: r[11], lesson: r[12], entry: 22100 + index * 37, stopLoss: 22070 + index * 37,
  takeProfit: 22170 + index * 37, riskReward: Math.max(1, Math.abs(r[8])),
  result: r[8] > 0 ? "Win" : r[8] < 0 ? "Loss" : "BE",
})) as ResearchTrade[];

export const sampleRules: TradingRule[] = [
  { id:"R-001", title:"等待 K 棒收線確認突破", description:"突破只能在 5m 或 15m K 棒收線後成立，避免假突破與追價。", status:"Verified", confidence:88, linkedTrades:["BT-002","BT-003","BT-011"] },
  { id:"R-002", title:"高週期方向不一致則 No Trade", description:"1H bias 與執行方向相反時，不以短週期訊號覆蓋。", status:"Testing", confidence:76, linkedTrades:["BT-006","BT-014","BT-016"] },
  { id:"R-003", title:"重大消息前 30 分鐘不進場", description:"CPI、NFP、FOMC 等事件前不建立新倉位。", status:"Verified", confidence:92, linkedTrades:["BT-010"] },
  { id:"R-004", title:"先比較同類指數的乾淨程度", description:"DJ30 與 NAS100 同時出現訊號時，只選結構、流動性與 RR 最清楚者。", status:"Testing", confidence:64, linkedTrades:["BT-004","BT-008"] },
];

export const mistakeRecommendations: Record<string,string> = {
  "Breakout Chase":"要求收線＋回測兩步確認，錯過後禁止補償性進場。",
  "Entered Too Early":"將確認條件寫在下單前 checklist。",
  "Didn't Wait Candle Close":"設定收線提醒，收線前不移動游標至下單區。",
  "Counter Trend":"圖表固定顯示 1H bias，方向衝突直接 No Trade。",
  "Poor RR":"低於 2R 的計畫不建立交易紀錄。",
  "News Trade":"重大數據前後 30 分鐘鎖定為禁入區。",
  "FOMO":"錯過的交易只截圖，不追價。",
  "Emotional Trade":"連續兩筆虧損後強制休息 30 分鐘。",
  "Ignored Liquidity":"進場前標記最近的 buy/sell-side liquidity。",
  "Ignored Higher Timeframe":"先完成 1H/4H bias，再開啟執行週期。",
};
