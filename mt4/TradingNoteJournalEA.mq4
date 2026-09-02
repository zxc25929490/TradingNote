#property strict
#property version   "4.00"
#property description "Records MT4 closed trades for TradingNote local import."

input string JournalFileName = "TradingNote_MT4_Journal_v4.tsv";
input string StateFileName = "TradingNote_MT4_OpenState_v4.tsv";
input string ExportedTicketsFileName = "TradingNote_MT4_ExportedTickets_v4.txt";
string LegacyStateFileName = "TradingNote_MT4_OpenState_v3.tsv";
string LegacyExportedTicketsFileName = "TradingNote_MT4_ExportedTickets_v3.txt";
input int TimerSeconds = 1;
input int MagicNumberFilter = -1; // -1 = all manual and EA trades
input ENUM_TIMEFRAMES AnalysisTimeframe = PERIOD_H1;
input int FastEmaPeriod = 20;
input int SlowEmaPeriod = 50;
input int AdxPeriod = 14;
input double TrendAdxThreshold = 20.0;
input int AtrPeriod = 14;
input int AtrBaselineBars = 40;

struct TradeTracker
{
   int ticket;
   string symbol;
   int type;
   double lots;
   datetime openTime;
   double openPrice;
   double initialStop;
   double takeProfit;
   double initialRiskPrice;
   double initialRiskMoney;
   double bestExitPrice;
   double worstExitPrice;
   datetime trackingStartedAt;
   datetime lastObservedAt;
   datetime mfeTime;
   datetime maeTime;
   int trackingDelaySeconds;
   int monitoringGapSeconds;
   int monitoredSeconds;
   int favorableSeconds;
   int adverseSeconds;
   int sampleCount;
   int first05RSeconds;
   int first10RSeconds;
   int first15RSeconds;
   int first20RSeconds;
   int first25RSeconds;
   int first30RSeconds;
   int firstMinus05RSeconds;
   int firstMinus10RSeconds;
   double lastStop;
   double lastTakeProfit;
   int stopChangeCount;
   int takeProfitChangeCount;
   datetime firstStopChangeTime;
   datetime breakEvenTime;
   double plannedRR;
   double maxLockedR;
   double maxRiskR;
   double maxGivebackR;
   int slTightenCount;
   int slWidenCount;
   double entryAtrPoints;
   double entryAdx;
   double entryEmaGapPoints;
   double entryPreviousDayPositionPct;
   double balanceAtEntry;
   double equityAtEntry;
   double freeMarginAtEntry;
   double riskPctEquity;
   int openTradesAtEntry;
   int sameSymbolTradesAtEntry;
   double entrySpreadPoints;
   double maxSpreadPoints;
   string regime;
   string volatility;
   string htfAlignment;
   string session;
   double brokerUtcOffset;
   string orderComment;
   string captureQuality;
};

TradeTracker trackers[];
int exportedTickets[];
uint lastScanAt = 0;
uint lastStateSaveAt = 0;

string CleanText(string value)
{
   StringReplace(value, "\t", " ");
   StringReplace(value, "\r", " ");
   StringReplace(value, "\n", " ");
   return value;
}

string DateText(datetime value)
{
   string text = TimeToString(value, TIME_DATE);
   StringReplace(text, ".", "-");
   return text;
}

string TimeText(datetime value)
{
   return TimeToString(value, TIME_SECONDS);
}

string DateTimeText(datetime value)
{
   if(value <= 0) return "";
   return DateText(value) + " " + TimeText(value);
}

string AppendQualityToken(string current, string token)
{
   if(token == "") return current;
   if(current == "") return token;
   if(StringFind("+" + current + "+", "+" + token + "+") >= 0) return current;
   return current + "+" + token;
}

double TrackerMfeR(TradeTracker &tracker)
{
   if(tracker.initialRiskPrice <= 0) return EMPTY_VALUE;
   double distance = tracker.type == OP_BUY
      ? MathMax(0, tracker.bestExitPrice - tracker.openPrice)
      : MathMax(0, tracker.openPrice - tracker.bestExitPrice);
   return distance / tracker.initialRiskPrice;
}

double TrackerMaeR(TradeTracker &tracker)
{
   if(tracker.initialRiskPrice <= 0) return EMPTY_VALUE;
   double distance = tracker.type == OP_BUY
      ? MathMax(0, tracker.openPrice - tracker.worstExitPrice)
      : MathMax(0, tracker.worstExitPrice - tracker.openPrice);
   return -distance / tracker.initialRiskPrice;
}

double StopLevelR(TradeTracker &tracker, double stopPrice)
{
   if(tracker.initialRiskPrice <= 0 || stopPrice <= 0) return EMPTY_VALUE;
   return tracker.type == OP_BUY
      ? (stopPrice - tracker.openPrice) / tracker.initialRiskPrice
      : (tracker.openPrice - stopPrice) / tracker.initialRiskPrice;
}

int CountMarketOrders(string symbolFilter)
{
   int count = 0;
   int selectedTicket = OrderTicket();
   for(int position = OrdersTotal() - 1; position >= 0; position--)
   {
      if(!OrderSelect(position, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
      if(symbolFilter != "" && OrderSymbol() != symbolFilter) continue;
      count++;
   }
   if(selectedTicket > 0) OrderSelect(selectedTicket, SELECT_BY_TICKET);
   return count;
}

void RecordMilestone(int &field, double currentR, double targetR, datetime observedAt, datetime openTime)
{
   if(field > 0 || currentR == EMPTY_VALUE || currentR < targetR) return;
   field = (int)MathMax(1, observedAt - openTime);
}

string NumberText(double value, int digits)
{
   if(value == EMPTY_VALUE || !MathIsValidNumber(value)) return "";
   return DoubleToString(value, digits);
}

double PointSize(string symbol)
{
   double point = MarketInfo(symbol, MODE_POINT);
   return point > 0 ? point : 0.00001;
}

double MoneyForDistance(string symbol, double lots, double priceDistance)
{
   // These broker index symbols expose tick value at a scale that does not
   // match realized account P/L. Use displayed index points and lots directly.
   if(symbol == "NAS100.R" || symbol == "US100.R" || symbol == "DJ30.R" || symbol == "US30.R")
      return MathAbs(priceDistance) * lots;

   double point = PointSize(symbol);
   double tickSizePoints = MarketInfo(symbol, MODE_TICKSIZE);
   double tickValue = MarketInfo(symbol, MODE_TICKVALUE);
   double tickSizePrice = tickSizePoints > 0 ? tickSizePoints * point : point;
   if(tickSizePrice <= 0 || tickValue <= 0 || lots <= 0) return 0;
   return MathAbs(priceDistance) / tickSizePrice * tickValue * lots;
}

double CurrentSpreadPoints(string symbol)
{
   double bid = MarketInfo(symbol, MODE_BID);
   double ask = MarketInfo(symbol, MODE_ASK);
   double point = PointSize(symbol);
   if(bid <= 0 || ask <= 0 || point <= 0) return 0;
   return MathMax(0, (ask - bid) / point);
}

double ExitQuote(string symbol, int type)
{
   return type == OP_BUY ? MarketInfo(symbol, MODE_BID) : MarketInfo(symbol, MODE_ASK);
}

int AnalysisShift(string symbol, datetime openTime)
{
   int shift = iBarShift(symbol, AnalysisTimeframe, openTime, false);
   if(shift < 1) shift = 1;
   return shift;
}

string DetectRegime(string symbol, datetime openTime)
{
   int shift = AnalysisShift(symbol, openTime);
   double fast = iMA(symbol, AnalysisTimeframe, FastEmaPeriod, 0, MODE_EMA, PRICE_CLOSE, shift);
   double slow = iMA(symbol, AnalysisTimeframe, SlowEmaPeriod, 0, MODE_EMA, PRICE_CLOSE, shift);
   double adx = iADX(symbol, AnalysisTimeframe, AdxPeriod, PRICE_CLOSE, MODE_MAIN, shift);
   if(adx < TrendAdxThreshold) return "range";
   if(fast > slow) return "trend_up";
   if(fast < slow) return "trend_down";
   return "range";
}

string DetectVolatility(string symbol, datetime openTime)
{
   int shift = AnalysisShift(symbol, openTime);
   double currentAtr = iATR(symbol, AnalysisTimeframe, AtrPeriod, shift);
   double total = 0;
   int count = 0;
   int bars = MathMax(10, AtrBaselineBars);
   for(int i = shift; i < shift + bars; i++)
   {
      double atr = iATR(symbol, AnalysisTimeframe, AtrPeriod, i);
      if(atr > 0)
      {
         total += atr;
         count++;
      }
   }
   if(currentAtr <= 0 || count == 0) return "unknown";
   double ratio = currentAtr / (total / count);
   if(ratio >= 1.25) return "high_volatility";
   if(ratio <= 0.75) return "low_volatility";
   return "normal_volatility";
}

string DetectHtfAlignment(string symbol, int type, datetime openTime)
{
   int shift = AnalysisShift(symbol, openTime);
   double fast = iMA(symbol, AnalysisTimeframe, FastEmaPeriod, 0, MODE_EMA, PRICE_CLOSE, shift);
   double slow = iMA(symbol, AnalysisTimeframe, SlowEmaPeriod, 0, MODE_EMA, PRICE_CLOSE, shift);
   bool aligned = (type == OP_BUY && fast >= slow) || (type == OP_SELL && fast <= slow);
   return aligned ? "aligned" : "counter_trend";
}

string DetectSession(datetime value)
{
   int hour = TimeHour(value);
   if(hour >= 0 && hour < 8) return "Asia";
   if(hour >= 8 && hour < 13) return "London";
   if(hour >= 13 && hour < 21) return "New_York";
   return "Off_Hours";
}

double BrokerUtcOffsetHours()
{
   return NormalizeDouble((double)(TimeCurrent() - TimeGMT()) / 3600.0, 1);
}

bool PassesFilter()
{
   if(OrderType() != OP_BUY && OrderType() != OP_SELL) return false;
   if(MagicNumberFilter >= 0 && OrderMagicNumber() != MagicNumberFilter) return false;
   return true;
}

int FindTracker(int ticket)
{
   for(int i = 0; i < ArraySize(trackers); i++)
      if(trackers[i].ticket == ticket) return i;
   return -1;
}

bool WasExported(int ticket)
{
   for(int i = 0; i < ArraySize(exportedTickets); i++)
      if(exportedTickets[i] == ticket) return true;
   return false;
}

void AddExportedTicket(int ticket)
{
   if(WasExported(ticket)) return;
   int count = ArraySize(exportedTickets);
   ArrayResize(exportedTickets, count + 1);
   exportedTickets[count] = ticket;

   int handle = FileOpen(ExportedTicketsFileName, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(handle == INVALID_HANDLE)
   {
      Print("TradingNote: cannot write exported-ticket checkpoint. Error ", GetLastError());
      return;
   }
   FileSeek(handle, 0, SEEK_END);
   FileWriteString(handle, IntegerToString(ticket) + "\r\n");
   FileClose(handle);
}

void LoadExportedTicketsFromFile(string fileName)
{
   int handle = FileOpen(fileName, FILE_READ | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(handle == INVALID_HANDLE) return;
   while(!FileIsEnding(handle))
   {
      string line = FileReadString(handle);
      int ticket = (int)StringToInteger(line);
      if(ticket <= 0 || WasExported(ticket)) continue;
      int count = ArraySize(exportedTickets);
      ArrayResize(exportedTickets, count + 1);
      exportedTickets[count] = ticket;
   }
   FileClose(handle);
}

void SaveExportedTicketsCheckpoint()
{
   int handle = FileOpen(ExportedTicketsFileName, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(handle == INVALID_HANDLE)
   {
      Print("TradingNote: cannot migrate exported-ticket checkpoint. Error ", GetLastError());
      return;
   }
   for(int i = 0; i < ArraySize(exportedTickets); i++)
      FileWriteString(handle, IntegerToString(exportedTickets[i]) + "\r\n");
   FileClose(handle);
}

void LoadExportedTickets()
{
   ArrayResize(exportedTickets, 0);
   bool hasV4Checkpoint = FileIsExist(ExportedTicketsFileName);
   if(!hasV4Checkpoint) LoadExportedTicketsFromFile(LegacyExportedTicketsFileName);
   LoadExportedTicketsFromFile(ExportedTicketsFileName);
   if(!hasV4Checkpoint && ArraySize(exportedTickets) > 0) SaveExportedTicketsCheckpoint();
}

void AddSelectedOrder()
{
   if(!PassesFilter() || FindTracker(OrderTicket()) >= 0 || WasExported(OrderTicket())) return;

   TradeTracker tracker;
   tracker.ticket = OrderTicket();
   tracker.symbol = OrderSymbol();
   tracker.type = OrderType();
   tracker.lots = OrderLots();
   tracker.openTime = OrderOpenTime();
   tracker.openPrice = OrderOpenPrice();
   tracker.initialStop = OrderStopLoss();
   tracker.takeProfit = OrderTakeProfit();
   tracker.initialRiskPrice = tracker.initialStop > 0 ? MathAbs(tracker.openPrice - tracker.initialStop) : 0;
   tracker.initialRiskMoney = MoneyForDistance(tracker.symbol, tracker.lots, tracker.initialRiskPrice);
   double quote = ExitQuote(tracker.symbol, tracker.type);
   if(quote <= 0) quote = tracker.openPrice;
   tracker.bestExitPrice = quote;
   tracker.worstExitPrice = quote;
   tracker.trackingStartedAt = TimeCurrent();
   tracker.lastObservedAt = tracker.trackingStartedAt;
   tracker.mfeTime = tracker.trackingStartedAt;
   tracker.maeTime = tracker.trackingStartedAt;
   tracker.trackingDelaySeconds = (int)MathMax(0, tracker.trackingStartedAt - tracker.openTime);
   tracker.monitoringGapSeconds = 0;
   tracker.monitoredSeconds = 0;
   tracker.favorableSeconds = 0;
   tracker.adverseSeconds = 0;
   tracker.sampleCount = 0;
   tracker.first05RSeconds = 0;
   tracker.first10RSeconds = 0;
   tracker.first15RSeconds = 0;
   tracker.first20RSeconds = 0;
   tracker.first25RSeconds = 0;
   tracker.first30RSeconds = 0;
   tracker.firstMinus05RSeconds = 0;
   tracker.firstMinus10RSeconds = 0;
   tracker.lastStop = tracker.initialStop;
   tracker.lastTakeProfit = tracker.takeProfit;
   tracker.stopChangeCount = 0;
   tracker.takeProfitChangeCount = 0;
   tracker.firstStopChangeTime = 0;
   tracker.breakEvenTime = 0;
   tracker.plannedRR = tracker.initialRiskPrice > 0 && tracker.takeProfit > 0
      ? MathAbs(tracker.takeProfit - tracker.openPrice) / tracker.initialRiskPrice
      : EMPTY_VALUE;
   double initialStopR = StopLevelR(tracker, tracker.initialStop);
   tracker.maxLockedR = initialStopR == EMPTY_VALUE ? 0 : initialStopR;
   tracker.maxRiskR = initialStopR == EMPTY_VALUE ? 0 : MathMax(0, -initialStopR);
   tracker.maxGivebackR = 0;
   tracker.slTightenCount = 0;
   tracker.slWidenCount = 0;
   int entryShift = AnalysisShift(tracker.symbol, tracker.openTime);
   tracker.entryAtrPoints = iATR(tracker.symbol, AnalysisTimeframe, AtrPeriod, entryShift) / PointSize(tracker.symbol);
   tracker.entryAdx = iADX(tracker.symbol, AnalysisTimeframe, AdxPeriod, PRICE_CLOSE, MODE_MAIN, entryShift);
   double entryFastEma = iMA(tracker.symbol, AnalysisTimeframe, FastEmaPeriod, 0, MODE_EMA, PRICE_CLOSE, entryShift);
   double entrySlowEma = iMA(tracker.symbol, AnalysisTimeframe, SlowEmaPeriod, 0, MODE_EMA, PRICE_CLOSE, entryShift);
   tracker.entryEmaGapPoints = (entryFastEma - entrySlowEma) / PointSize(tracker.symbol);
   int entryDayShift = iBarShift(tracker.symbol, PERIOD_D1, tracker.openTime, false);
   int previousDayShift = entryDayShift >= 0 ? entryDayShift + 1 : 1;
   double previousDayHigh = iHigh(tracker.symbol, PERIOD_D1, previousDayShift);
   double previousDayLow = iLow(tracker.symbol, PERIOD_D1, previousDayShift);
   tracker.entryPreviousDayPositionPct = previousDayHigh > previousDayLow
      ? (tracker.openPrice - previousDayLow) / (previousDayHigh - previousDayLow) * 100.0
      : EMPTY_VALUE;
   tracker.balanceAtEntry = AccountBalance();
   tracker.equityAtEntry = AccountEquity();
   tracker.freeMarginAtEntry = AccountFreeMargin();
   tracker.riskPctEquity = tracker.equityAtEntry > 0 && tracker.initialRiskMoney > 0
      ? tracker.initialRiskMoney / tracker.equityAtEntry * 100.0
      : EMPTY_VALUE;
   tracker.entrySpreadPoints = CurrentSpreadPoints(tracker.symbol);
   tracker.maxSpreadPoints = tracker.entrySpreadPoints;
   tracker.regime = DetectRegime(tracker.symbol, tracker.openTime);
   tracker.volatility = DetectVolatility(tracker.symbol, tracker.openTime);
   tracker.htfAlignment = DetectHtfAlignment(tracker.symbol, tracker.type, tracker.openTime);
   tracker.session = DetectSession(tracker.openTime);
   tracker.brokerUtcOffset = BrokerUtcOffsetHours();
   tracker.orderComment = CleanText(OrderComment());
   tracker.captureQuality = tracker.trackingDelaySeconds <= MathMax(5, TimerSeconds * 2) ? "complete" : "attached_mid_trade";
   tracker.openTradesAtEntry = CountMarketOrders("");
   tracker.sameSymbolTradesAtEntry = CountMarketOrders(tracker.symbol);

   int count = ArraySize(trackers);
   ArrayResize(trackers, count + 1);
   trackers[count] = tracker;
   Print("TradingNote: tracking ticket ", tracker.ticket, " ", tracker.symbol);
}

void UpdateTracker(int index)
{
   datetime observedAt = TimeCurrent();
   double point = PointSize(trackers[index].symbol);
   double currentStop = OrderStopLoss();
   double currentTakeProfit = OrderTakeProfit();
   if(trackers[index].initialStop <= 0 && OrderStopLoss() > 0)
   {
      trackers[index].initialStop = currentStop;
      trackers[index].initialRiskPrice = MathAbs(trackers[index].openPrice - trackers[index].initialStop);
      trackers[index].initialRiskMoney = MoneyForDistance(trackers[index].symbol, trackers[index].lots, trackers[index].initialRiskPrice);
      trackers[index].plannedRR = trackers[index].initialRiskPrice > 0 && currentTakeProfit > 0
         ? MathAbs(currentTakeProfit - trackers[index].openPrice) / trackers[index].initialRiskPrice
         : EMPTY_VALUE;
      trackers[index].riskPctEquity = trackers[index].equityAtEntry > 0 && trackers[index].initialRiskMoney > 0
         ? trackers[index].initialRiskMoney / trackers[index].equityAtEntry * 100.0
         : EMPTY_VALUE;
      double initialStopR = StopLevelR(trackers[index], currentStop);
      trackers[index].maxLockedR = initialStopR == EMPTY_VALUE ? 0 : initialStopR;
      trackers[index].maxRiskR = initialStopR == EMPTY_VALUE ? 0 : MathMax(0, -initialStopR);
      trackers[index].lastStop = currentStop;
   }
   else if(MathAbs(currentStop - trackers[index].lastStop) > point * 0.5)
   {
      double oldStopR = StopLevelR(trackers[index], trackers[index].lastStop);
      double newStopR = StopLevelR(trackers[index], currentStop);
      trackers[index].stopChangeCount++;
      if(trackers[index].firstStopChangeTime <= 0) trackers[index].firstStopChangeTime = observedAt;
      if(currentStop <= 0)
      {
         trackers[index].slWidenCount++;
         trackers[index].captureQuality = AppendQualityToken(trackers[index].captureQuality, "sl_removed");
      }
      else
      {
         if(newStopR != EMPTY_VALUE)
         {
            if(oldStopR == EMPTY_VALUE || newStopR > oldStopR) trackers[index].slTightenCount++;
            else if(newStopR < oldStopR) trackers[index].slWidenCount++;
            trackers[index].maxLockedR = MathMax(trackers[index].maxLockedR, newStopR);
            trackers[index].maxRiskR = MathMax(trackers[index].maxRiskR, MathMax(0, -newStopR));
         }
      }
      trackers[index].lastStop = currentStop;
   }
   if(trackers[index].takeProfit <= 0 && currentTakeProfit > 0)
   {
      trackers[index].takeProfit = currentTakeProfit;
      trackers[index].lastTakeProfit = currentTakeProfit;
      if(trackers[index].initialRiskPrice > 0)
         trackers[index].plannedRR = MathAbs(currentTakeProfit - trackers[index].openPrice) / trackers[index].initialRiskPrice;
   }
   else if(MathAbs(currentTakeProfit - trackers[index].lastTakeProfit) > point * 0.5)
   {
      trackers[index].takeProfitChangeCount++;
      trackers[index].lastTakeProfit = currentTakeProfit;
   }
   if(trackers[index].breakEvenTime <= 0 && currentStop > 0)
   {
      bool atBreakEven = (trackers[index].type == OP_BUY && currentStop >= trackers[index].openPrice)
         || (trackers[index].type == OP_SELL && currentStop <= trackers[index].openPrice);
      if(atBreakEven) trackers[index].breakEvenTime = observedAt;
   }
   double quote = ExitQuote(trackers[index].symbol, trackers[index].type);
   if(quote <= 0) return;
   int elapsed = (int)MathMax(0, observedAt - trackers[index].lastObservedAt);
   if(elapsed > 0)
   {
      int allowedGap = MathMax(5, TimerSeconds * 3);
      if(elapsed <= allowedGap)
      {
         trackers[index].monitoredSeconds += elapsed;
         bool favorableNow = (trackers[index].type == OP_BUY && quote >= trackers[index].openPrice)
            || (trackers[index].type == OP_SELL && quote <= trackers[index].openPrice);
         if(favorableNow) trackers[index].favorableSeconds += elapsed;
         else trackers[index].adverseSeconds += elapsed;
      }
      else
      {
         trackers[index].monitoringGapSeconds += elapsed;
         trackers[index].captureQuality = AppendQualityToken(trackers[index].captureQuality, "monitoring_gap");
      }
   }
   trackers[index].lastObservedAt = observedAt;
   trackers[index].sampleCount++;
   if(trackers[index].type == OP_BUY)
   {
      if(quote > trackers[index].bestExitPrice)
      {
         trackers[index].bestExitPrice = quote;
         trackers[index].mfeTime = observedAt;
      }
      if(quote < trackers[index].worstExitPrice)
      {
         trackers[index].worstExitPrice = quote;
         trackers[index].maeTime = observedAt;
      }
   }
   else
   {
      if(quote < trackers[index].bestExitPrice)
      {
         trackers[index].bestExitPrice = quote;
         trackers[index].mfeTime = observedAt;
      }
      if(quote > trackers[index].worstExitPrice)
      {
         trackers[index].worstExitPrice = quote;
         trackers[index].maeTime = observedAt;
      }
   }
   double currentMfeR = TrackerMfeR(trackers[index]);
   double currentMaeR = TrackerMaeR(trackers[index]);
   if(trackers[index].initialRiskPrice > 0 && currentMfeR != EMPTY_VALUE)
   {
      double currentPositionR = trackers[index].type == OP_BUY
         ? (quote - trackers[index].openPrice) / trackers[index].initialRiskPrice
         : (trackers[index].openPrice - quote) / trackers[index].initialRiskPrice;
      trackers[index].maxGivebackR = MathMax(trackers[index].maxGivebackR, MathMax(0, currentMfeR - currentPositionR));
   }
   RecordMilestone(trackers[index].first05RSeconds, currentMfeR, 0.5, observedAt, trackers[index].openTime);
   RecordMilestone(trackers[index].first10RSeconds, currentMfeR, 1.0, observedAt, trackers[index].openTime);
   RecordMilestone(trackers[index].first15RSeconds, currentMfeR, 1.5, observedAt, trackers[index].openTime);
   RecordMilestone(trackers[index].first20RSeconds, currentMfeR, 2.0, observedAt, trackers[index].openTime);
   RecordMilestone(trackers[index].first25RSeconds, currentMfeR, 2.5, observedAt, trackers[index].openTime);
   RecordMilestone(trackers[index].first30RSeconds, currentMfeR, 3.0, observedAt, trackers[index].openTime);
   if(trackers[index].firstMinus05RSeconds <= 0 && currentMaeR != EMPTY_VALUE && currentMaeR <= -0.5)
      trackers[index].firstMinus05RSeconds = (int)MathMax(1, observedAt - trackers[index].openTime);
   if(trackers[index].firstMinus10RSeconds <= 0 && currentMaeR != EMPTY_VALUE && currentMaeR <= -1.0)
      trackers[index].firstMinus10RSeconds = (int)MathMax(1, observedAt - trackers[index].openTime);
   trackers[index].maxSpreadPoints = MathMax(trackers[index].maxSpreadPoints, CurrentSpreadPoints(trackers[index].symbol));
}

string ExitReason(TradeTracker &tracker, double closePrice, double exitSpreadPoints, double finalStop, double finalTakeProfit)
{
   double point = PointSize(tracker.symbol);
   double tolerance = MathMax(5.0 * point, 3.0 * exitSpreadPoints * point);
   double slDistance = finalStop > 0 ? MathAbs(closePrice - finalStop) : 1.0e100;
   double tpDistance = finalTakeProfit > 0 ? MathAbs(closePrice - finalTakeProfit) : 1.0e100;
   if(slDistance <= tolerance && slDistance <= tpDistance) return "stop_loss";
   if(tpDistance <= tolerance) return "take_profit";
   return "manual_or_ea_close";
}

bool AppendJournalLine(string line)
{
   int handle = FileOpen(JournalFileName, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(handle == INVALID_HANDLE)
   {
      Print("TradingNote: cannot open journal. Error ", GetLastError());
      return false;
   }
   if(FileSize(handle) == 0)
   {
      string header = "record_version\tsource\taccount\tticket\tmagic\tdate\ttime\tclose_time\tsymbol\tdirection\tlots\tentry\tstop_loss\ttake_profit\texit_price\tinitial_risk_points\tinitial_risk_money\tgross_profit\tcommission\tswap\tnet_profit\tgross_r\tnet_r\tmfe_price\tmfe_r\tmae_price\tmae_r\texit_efficiency_pct\tentry_spread_points\texit_spread_points\tmax_spread_points\tspread_cost_estimate\texit_reason\texit_slippage_points\tregime\tvolatility\thtf_alignment\tsession\tbroker_utc_offset\tcomment\tcapture_quality\ttracking_started_at\ttracking_delay_seconds\tmonitored_seconds\tmonitoring_gap_seconds\tmonitoring_coverage_pct\tsample_count\tholding_seconds\tmfe_time\tmfe_seconds\tmae_time\tmae_seconds\tfirst_0_5r_seconds\tfirst_1r_seconds\tfirst_1_5r_seconds\tfirst_2r_seconds\tfirst_2_5r_seconds\tfirst_3r_seconds\tfirst_minus_0_5r_seconds\tfirst_minus_1r_seconds\tfinal_stop_loss\tfinal_take_profit\tstop_change_count\tfirst_stop_change_time\tbreakeven_time\ttake_profit_change_count\tfavorable_seconds\tadverse_seconds\tfavorable_time_pct\tplanned_rr\tmax_locked_r\tmax_risk_r\tmax_giveback_r\tsl_tighten_count\tsl_widen_count\tentry_atr_points\tentry_adx\tentry_ema_gap_points\tentry_previous_day_position_pct\tbalance_at_entry\tequity_at_entry\tfree_margin_at_entry\trisk_pct_equity\topen_trades_at_entry\tsame_symbol_trades_at_entry";
      FileWriteString(handle, header + "\r\n");
   }
   FileSeek(handle, 0, SEEK_END);
   FileWriteString(handle, line + "\r\n");
   FileFlush(handle);
   FileClose(handle);
   return true;
}

bool ExportClosedTracker(int index)
{
   int ticket = trackers[index].ticket;
   if(WasExported(ticket)) return true;
   if(!OrderSelect(ticket, SELECT_BY_TICKET) || OrderCloseTime() <= 0) return false;

   TradeTracker tracker = trackers[index];
   double closePrice = OrderClosePrice();
   double grossProfit = OrderProfit();
   double commission = OrderCommission();
   double swap = OrderSwap();
   double netProfit = grossProfit + commission + swap;
   double exitSpreadPoints = CurrentSpreadPoints(tracker.symbol);
   double finalStop = OrderStopLoss();
   double finalTakeProfit = OrderTakeProfit();
   string reason = ExitReason(tracker, closePrice, exitSpreadPoints, finalStop, finalTakeProfit);

   double favorableDistance = tracker.type == OP_BUY
      ? MathMax(0, tracker.bestExitPrice - tracker.openPrice)
      : MathMax(0, tracker.openPrice - tracker.bestExitPrice);
   double adverseDistance = tracker.type == OP_BUY
      ? MathMax(0, tracker.openPrice - tracker.worstExitPrice)
      : MathMax(0, tracker.worstExitPrice - tracker.openPrice);
   double mfeMoney = MoneyForDistance(tracker.symbol, tracker.lots, favorableDistance);
   double maeMoney = MoneyForDistance(tracker.symbol, tracker.lots, adverseDistance);
   double grossR = tracker.initialRiskMoney > 0 ? grossProfit / tracker.initialRiskMoney : EMPTY_VALUE;
   double netR = tracker.initialRiskMoney > 0 ? netProfit / tracker.initialRiskMoney : EMPTY_VALUE;
   double mfeR = tracker.initialRiskMoney > 0 ? mfeMoney / tracker.initialRiskMoney : EMPTY_VALUE;
   double maeR = tracker.initialRiskMoney > 0 ? -maeMoney / tracker.initialRiskMoney : EMPTY_VALUE;
   double efficiency = mfeR != EMPTY_VALUE && mfeR > 0 && netR != EMPTY_VALUE ? netR / mfeR * 100.0 : EMPTY_VALUE;
   double spreadCost = MoneyForDistance(tracker.symbol, tracker.lots, tracker.entrySpreadPoints * PointSize(tracker.symbol));
   double target = reason == "stop_loss" ? finalStop : reason == "take_profit" ? finalTakeProfit : 0;
   double exitSlippage = target > 0
      ? (closePrice - target) * (tracker.type == OP_BUY ? 1.0 : -1.0) / PointSize(tracker.symbol)
      : EMPTY_VALUE;
   int holdingSeconds = (int)MathMax(0, OrderCloseTime() - tracker.openTime);
   int mfeSeconds = tracker.mfeTime > 0 ? (int)MathMax(0, tracker.mfeTime - tracker.openTime) : 0;
   int maeSeconds = tracker.maeTime > 0 ? (int)MathMax(0, tracker.maeTime - tracker.openTime) : 0;
   double monitoringCoverage = holdingSeconds > 0 ? MathMin(100.0, (double)tracker.monitoredSeconds / holdingSeconds * 100.0) : EMPTY_VALUE;
   double favorableTimePct = tracker.monitoredSeconds > 0 ? (double)tracker.favorableSeconds / tracker.monitoredSeconds * 100.0 : EMPTY_VALUE;
   string exportQuality = tracker.captureQuality;
   if(tracker.initialStop <= 0 || tracker.initialRiskMoney <= 0)
   {
      exportQuality = exportQuality == "" || exportQuality == "complete"
         ? "missing_initial_sl"
         : exportQuality + "+missing_initial_sl";
   }

   string values[];
   ArrayResize(values, 85);
   values[0] = "4";
   values[1] = "TradingNote MT4 EA";
   values[2] = IntegerToString(AccountNumber());
   values[3] = IntegerToString(ticket);
   values[4] = IntegerToString(OrderMagicNumber());
   values[5] = DateText(tracker.openTime);
   values[6] = TimeText(tracker.openTime);
   values[7] = DateText(OrderCloseTime()) + " " + TimeText(OrderCloseTime());
   values[8] = tracker.symbol;
   values[9] = tracker.type == OP_BUY ? "Long" : "Short";
   values[10] = NumberText(OrderLots(), 2);
   values[11] = NumberText(tracker.openPrice, (int)MarketInfo(tracker.symbol, MODE_DIGITS));
   values[12] = tracker.initialStop > 0 ? NumberText(tracker.initialStop, (int)MarketInfo(tracker.symbol, MODE_DIGITS)) : "";
   values[13] = tracker.takeProfit > 0 ? NumberText(tracker.takeProfit, (int)MarketInfo(tracker.symbol, MODE_DIGITS)) : "";
   values[14] = NumberText(closePrice, (int)MarketInfo(tracker.symbol, MODE_DIGITS));
   bool isCashIndexR = tracker.symbol == "NAS100.R" || tracker.symbol == "US100.R" || tracker.symbol == "DJ30.R" || tracker.symbol == "US30.R";
   values[15] = tracker.initialRiskPrice > 0 ? NumberText(isCashIndexR ? tracker.initialRiskPrice : tracker.initialRiskPrice / PointSize(tracker.symbol), 1) : "";
   values[16] = tracker.initialRiskMoney > 0 ? NumberText(tracker.initialRiskMoney, 2) : "";
   values[17] = NumberText(grossProfit, 2);
   values[18] = NumberText(commission, 2);
   values[19] = NumberText(swap, 2);
   values[20] = NumberText(netProfit, 2);
   values[21] = NumberText(grossR, 4);
   values[22] = NumberText(netR, 4);
   values[23] = NumberText(tracker.bestExitPrice, (int)MarketInfo(tracker.symbol, MODE_DIGITS));
   values[24] = NumberText(mfeR, 4);
   values[25] = NumberText(tracker.worstExitPrice, (int)MarketInfo(tracker.symbol, MODE_DIGITS));
   values[26] = NumberText(maeR, 4);
   values[27] = NumberText(efficiency, 2);
   values[28] = NumberText(tracker.entrySpreadPoints, 1);
   values[29] = NumberText(exitSpreadPoints, 1);
   values[30] = NumberText(tracker.maxSpreadPoints, 1);
   values[31] = NumberText(spreadCost, 2);
   values[32] = reason;
   values[33] = NumberText(exitSlippage, 1);
   values[34] = tracker.regime;
   values[35] = tracker.volatility;
   values[36] = tracker.htfAlignment;
   values[37] = tracker.session;
   values[38] = NumberText(tracker.brokerUtcOffset, 1);
   values[39] = CleanText(tracker.orderComment);
   values[40] = exportQuality;
   values[41] = DateTimeText(tracker.trackingStartedAt);
   values[42] = IntegerToString(tracker.trackingDelaySeconds);
   values[43] = IntegerToString(tracker.monitoredSeconds);
   values[44] = IntegerToString(tracker.monitoringGapSeconds);
   values[45] = NumberText(monitoringCoverage, 2);
   values[46] = IntegerToString(tracker.sampleCount);
   values[47] = IntegerToString(holdingSeconds);
   values[48] = DateTimeText(tracker.mfeTime);
   values[49] = IntegerToString(mfeSeconds);
   values[50] = DateTimeText(tracker.maeTime);
   values[51] = IntegerToString(maeSeconds);
   values[52] = tracker.first05RSeconds > 0 ? IntegerToString(tracker.first05RSeconds) : "";
   values[53] = tracker.first10RSeconds > 0 ? IntegerToString(tracker.first10RSeconds) : "";
   values[54] = tracker.first15RSeconds > 0 ? IntegerToString(tracker.first15RSeconds) : "";
   values[55] = tracker.first20RSeconds > 0 ? IntegerToString(tracker.first20RSeconds) : "";
   values[56] = tracker.first25RSeconds > 0 ? IntegerToString(tracker.first25RSeconds) : "";
   values[57] = tracker.first30RSeconds > 0 ? IntegerToString(tracker.first30RSeconds) : "";
   values[58] = tracker.firstMinus05RSeconds > 0 ? IntegerToString(tracker.firstMinus05RSeconds) : "";
   values[59] = tracker.firstMinus10RSeconds > 0 ? IntegerToString(tracker.firstMinus10RSeconds) : "";
   values[60] = finalStop > 0 ? NumberText(finalStop, (int)MarketInfo(tracker.symbol, MODE_DIGITS)) : "";
   values[61] = finalTakeProfit > 0 ? NumberText(finalTakeProfit, (int)MarketInfo(tracker.symbol, MODE_DIGITS)) : "";
   values[62] = IntegerToString(tracker.stopChangeCount);
   values[63] = DateTimeText(tracker.firstStopChangeTime);
   values[64] = DateTimeText(tracker.breakEvenTime);
   values[65] = IntegerToString(tracker.takeProfitChangeCount);
   values[66] = IntegerToString(tracker.favorableSeconds);
   values[67] = IntegerToString(tracker.adverseSeconds);
   values[68] = NumberText(favorableTimePct, 2);
   values[69] = NumberText(tracker.plannedRR, 4);
   values[70] = NumberText(tracker.maxLockedR, 4);
   values[71] = NumberText(tracker.maxRiskR, 4);
   values[72] = NumberText(tracker.maxGivebackR, 4);
   values[73] = IntegerToString(tracker.slTightenCount);
   values[74] = IntegerToString(tracker.slWidenCount);
   values[75] = NumberText(tracker.entryAtrPoints, 2);
   values[76] = NumberText(tracker.entryAdx, 2);
   values[77] = NumberText(tracker.entryEmaGapPoints, 2);
   values[78] = NumberText(tracker.entryPreviousDayPositionPct, 2);
   values[79] = NumberText(tracker.balanceAtEntry, 2);
   values[80] = NumberText(tracker.equityAtEntry, 2);
   values[81] = NumberText(tracker.freeMarginAtEntry, 2);
   values[82] = NumberText(tracker.riskPctEquity, 4);
   values[83] = IntegerToString(tracker.openTradesAtEntry);
   values[84] = IntegerToString(tracker.sameSymbolTradesAtEntry);

   string line = values[0];
   for(int i = 1; i < ArraySize(values); i++) line += "\t" + values[i];
   if(!AppendJournalLine(line)) return false;
   AddExportedTicket(ticket);
   Print("TradingNote: exported closed ticket ", ticket, " to ", JournalFileName);
   return true;
}

void RemoveTracker(int index)
{
   int count = ArraySize(trackers);
   for(int i = index; i < count - 1; i++) trackers[i] = trackers[i + 1];
   ArrayResize(trackers, count - 1);
}

void SaveTrackers()
{
   int handle = FileOpen(StateFileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_SHARE_READ, '\t');
   if(handle == INVALID_HANDLE)
   {
      Print("TradingNote: cannot save open-state file. Error ", GetLastError());
      return;
   }
   FileWrite(handle, "ticket", "symbol", "type", "lots", "open_time", "open_price", "initial_stop", "take_profit", "risk_price", "risk_money", "best_exit", "worst_exit", "tracking_started", "last_observed", "mfe_time", "mae_time", "tracking_delay", "monitoring_gap", "monitored_seconds", "favorable_seconds", "adverse_seconds", "sample_count", "first_05r", "first_10r", "first_15r", "first_20r", "first_25r", "first_30r", "first_minus_05r", "first_minus_10r", "last_stop", "last_take_profit", "stop_change_count", "take_profit_change_count", "first_stop_change_time", "breakeven_time", "entry_spread", "max_spread", "regime", "volatility", "htf", "session", "utc_offset", "comment", "quality", "planned_rr", "max_locked_r", "max_risk_r", "max_giveback_r", "sl_tighten_count", "sl_widen_count", "entry_atr_points", "entry_adx", "entry_ema_gap_points", "entry_previous_day_position_pct", "balance_at_entry", "equity_at_entry", "free_margin_at_entry", "risk_pct_equity", "open_trades_at_entry", "same_symbol_trades_at_entry");
   for(int i = 0; i < ArraySize(trackers); i++)
   {
      TradeTracker tracker = trackers[i];
      FileWrite(handle, tracker.ticket, tracker.symbol, tracker.type, tracker.lots, (long)tracker.openTime, tracker.openPrice, tracker.initialStop, tracker.takeProfit, tracker.initialRiskPrice, tracker.initialRiskMoney, tracker.bestExitPrice, tracker.worstExitPrice, (long)tracker.trackingStartedAt, (long)tracker.lastObservedAt, (long)tracker.mfeTime, (long)tracker.maeTime, tracker.trackingDelaySeconds, tracker.monitoringGapSeconds, tracker.monitoredSeconds, tracker.favorableSeconds, tracker.adverseSeconds, tracker.sampleCount, tracker.first05RSeconds, tracker.first10RSeconds, tracker.first15RSeconds, tracker.first20RSeconds, tracker.first25RSeconds, tracker.first30RSeconds, tracker.firstMinus05RSeconds, tracker.firstMinus10RSeconds, tracker.lastStop, tracker.lastTakeProfit, tracker.stopChangeCount, tracker.takeProfitChangeCount, (long)tracker.firstStopChangeTime, (long)tracker.breakEvenTime, tracker.entrySpreadPoints, tracker.maxSpreadPoints, tracker.regime, tracker.volatility, tracker.htfAlignment, tracker.session, tracker.brokerUtcOffset, CleanText(tracker.orderComment), tracker.captureQuality, tracker.plannedRR, tracker.maxLockedR, tracker.maxRiskR, tracker.maxGivebackR, tracker.slTightenCount, tracker.slWidenCount, tracker.entryAtrPoints, tracker.entryAdx, tracker.entryEmaGapPoints, tracker.entryPreviousDayPositionPct, tracker.balanceAtEntry, tracker.equityAtEntry, tracker.freeMarginAtEntry, tracker.riskPctEquity, tracker.openTradesAtEntry, tracker.sameSymbolTradesAtEntry);
   }
   FileClose(handle);
}

void LoadTrackers()
{
   ArrayResize(trackers, 0);
   string loadStateFileName = StateFileName;
   if(!FileIsExist(loadStateFileName) && FileIsExist(LegacyStateFileName))
      loadStateFileName = LegacyStateFileName;
   int handle = FileOpen(loadStateFileName, FILE_READ | FILE_CSV | FILE_ANSI | FILE_SHARE_READ, '\t');
   if(handle == INVALID_HANDLE) return;
   if(!FileIsEnding(handle))
   {
      for(int headerColumn = 0; headerColumn < 61; headerColumn++) FileReadString(handle);
   }
   while(!FileIsEnding(handle))
   {
      TradeTracker tracker;
      string ticketText = FileReadString(handle);
      if(ticketText == "") break;
      tracker.ticket = (int)StringToInteger(ticketText);
      tracker.symbol = FileReadString(handle);
      tracker.type = (int)StringToInteger(FileReadString(handle));
      tracker.lots = StringToDouble(FileReadString(handle));
      tracker.openTime = (datetime)StringToInteger(FileReadString(handle));
      tracker.openPrice = StringToDouble(FileReadString(handle));
      tracker.initialStop = StringToDouble(FileReadString(handle));
      tracker.takeProfit = StringToDouble(FileReadString(handle));
      tracker.initialRiskPrice = StringToDouble(FileReadString(handle));
      tracker.initialRiskMoney = StringToDouble(FileReadString(handle));
      tracker.bestExitPrice = StringToDouble(FileReadString(handle));
      tracker.worstExitPrice = StringToDouble(FileReadString(handle));
      tracker.trackingStartedAt = (datetime)StringToInteger(FileReadString(handle));
      tracker.lastObservedAt = (datetime)StringToInteger(FileReadString(handle));
      tracker.mfeTime = (datetime)StringToInteger(FileReadString(handle));
      tracker.maeTime = (datetime)StringToInteger(FileReadString(handle));
      tracker.trackingDelaySeconds = (int)StringToInteger(FileReadString(handle));
      tracker.monitoringGapSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.monitoredSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.favorableSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.adverseSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.sampleCount = (int)StringToInteger(FileReadString(handle));
      tracker.first05RSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.first10RSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.first15RSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.first20RSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.first25RSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.first30RSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.firstMinus05RSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.firstMinus10RSeconds = (int)StringToInteger(FileReadString(handle));
      tracker.lastStop = StringToDouble(FileReadString(handle));
      tracker.lastTakeProfit = StringToDouble(FileReadString(handle));
      tracker.stopChangeCount = (int)StringToInteger(FileReadString(handle));
      tracker.takeProfitChangeCount = (int)StringToInteger(FileReadString(handle));
      tracker.firstStopChangeTime = (datetime)StringToInteger(FileReadString(handle));
      tracker.breakEvenTime = (datetime)StringToInteger(FileReadString(handle));
      tracker.entrySpreadPoints = StringToDouble(FileReadString(handle));
      tracker.maxSpreadPoints = StringToDouble(FileReadString(handle));
      tracker.regime = FileReadString(handle);
      tracker.volatility = FileReadString(handle);
      tracker.htfAlignment = FileReadString(handle);
      tracker.session = FileReadString(handle);
      tracker.brokerUtcOffset = StringToDouble(FileReadString(handle));
      tracker.orderComment = FileReadString(handle);
      tracker.captureQuality = FileReadString(handle);
      tracker.plannedRR = StringToDouble(FileReadString(handle));
      tracker.maxLockedR = StringToDouble(FileReadString(handle));
      tracker.maxRiskR = StringToDouble(FileReadString(handle));
      tracker.maxGivebackR = StringToDouble(FileReadString(handle));
      tracker.slTightenCount = (int)StringToInteger(FileReadString(handle));
      tracker.slWidenCount = (int)StringToInteger(FileReadString(handle));
      tracker.entryAtrPoints = StringToDouble(FileReadString(handle));
      tracker.entryAdx = StringToDouble(FileReadString(handle));
      tracker.entryEmaGapPoints = StringToDouble(FileReadString(handle));
      tracker.entryPreviousDayPositionPct = StringToDouble(FileReadString(handle));
      tracker.balanceAtEntry = StringToDouble(FileReadString(handle));
      tracker.equityAtEntry = StringToDouble(FileReadString(handle));
      tracker.freeMarginAtEntry = StringToDouble(FileReadString(handle));
      tracker.riskPctEquity = StringToDouble(FileReadString(handle));
      tracker.openTradesAtEntry = (int)StringToInteger(FileReadString(handle));
      tracker.sameSymbolTradesAtEntry = (int)StringToInteger(FileReadString(handle));
      int restartGap = tracker.lastObservedAt > 0 ? (int)MathMax(0, TimeCurrent() - tracker.lastObservedAt) : 0;
      if(restartGap > MathMax(5, TimerSeconds * 3))
      {
         tracker.monitoringGapSeconds += restartGap;
         tracker.captureQuality = AppendQualityToken(tracker.captureQuality, "resumed_after_restart");
      }
      tracker.lastObservedAt = TimeCurrent();
      if(tracker.ticket <= 0 || WasExported(tracker.ticket)) continue;
      int count = ArraySize(trackers);
      ArrayResize(trackers, count + 1);
      trackers[count] = tracker;
   }
   FileClose(handle);
}

void ScanTrades()
{
   uint now = GetTickCount();
   if(now - lastScanAt < 300) return;
   lastScanAt = now;

   for(int position = OrdersTotal() - 1; position >= 0; position--)
   {
      if(!OrderSelect(position, SELECT_BY_POS, MODE_TRADES) || !PassesFilter()) continue;
      int index = FindTracker(OrderTicket());
      if(index < 0)
      {
         AddSelectedOrder();
         index = FindTracker(OrderTicket());
      }
      if(index >= 0) UpdateTracker(index);
   }

   for(int i = ArraySize(trackers) - 1; i >= 0; i--)
   {
      if(!OrderSelect(trackers[i].ticket, SELECT_BY_TICKET)) continue;
      if(OrderCloseTime() > 0 && ExportClosedTracker(i)) RemoveTracker(i);
   }
   if(now - lastStateSaveAt >= 5000)
   {
      SaveTrackers();
      lastStateSaveAt = now;
   }
}

int OnInit()
{
   LoadExportedTickets();
   LoadTrackers();
   EventSetTimer(MathMax(1, TimerSeconds));
   ScanTrades();
   Print("TradingNote MT4 Journal EA started. Attach it to one chart and keep AutoTrading enabled.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   SaveTrackers();
}

void OnTick()
{
   ScanTrades();
}

void OnTimer()
{
   ScanTrades();
}
