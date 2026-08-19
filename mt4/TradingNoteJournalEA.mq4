#property strict
#property version   "1.00"
#property description "Records MT4 closed trades for TradingNote local import."

input string JournalFileName = "TradingNote_MT4_Journal.tsv";
input string StateFileName = "TradingNote_MT4_OpenState.tsv";
input string ExportedTicketsFileName = "TradingNote_MT4_ExportedTickets.txt";
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

void LoadExportedTickets()
{
   ArrayResize(exportedTickets, 0);
   int handle = FileOpen(ExportedTicketsFileName, FILE_READ | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
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
   tracker.entrySpreadPoints = CurrentSpreadPoints(tracker.symbol);
   tracker.maxSpreadPoints = tracker.entrySpreadPoints;
   tracker.regime = DetectRegime(tracker.symbol, tracker.openTime);
   tracker.volatility = DetectVolatility(tracker.symbol, tracker.openTime);
   tracker.htfAlignment = DetectHtfAlignment(tracker.symbol, tracker.type, tracker.openTime);
   tracker.session = DetectSession(tracker.openTime);
   tracker.brokerUtcOffset = BrokerUtcOffsetHours();
   tracker.orderComment = CleanText(OrderComment());
   int detectionDelay = (int)MathMax(0, TimeCurrent() - tracker.openTime);
   tracker.captureQuality = detectionDelay <= MathMax(5, TimerSeconds * 2) ? "complete" : "attached_mid_trade";

   int count = ArraySize(trackers);
   ArrayResize(trackers, count + 1);
   trackers[count] = tracker;
   Print("TradingNote: tracking ticket ", tracker.ticket, " ", tracker.symbol);
}

void UpdateTracker(int index)
{
   if(trackers[index].initialStop <= 0 && OrderStopLoss() > 0)
   {
      trackers[index].initialStop = OrderStopLoss();
      trackers[index].initialRiskPrice = MathAbs(trackers[index].openPrice - trackers[index].initialStop);
      trackers[index].initialRiskMoney = MoneyForDistance(trackers[index].symbol, trackers[index].lots, trackers[index].initialRiskPrice);
   }
   if(trackers[index].takeProfit <= 0 && OrderTakeProfit() > 0) trackers[index].takeProfit = OrderTakeProfit();
   double quote = ExitQuote(trackers[index].symbol, trackers[index].type);
   if(quote <= 0) return;
   if(trackers[index].type == OP_BUY)
   {
      trackers[index].bestExitPrice = MathMax(trackers[index].bestExitPrice, quote);
      trackers[index].worstExitPrice = MathMin(trackers[index].worstExitPrice, quote);
   }
   else
   {
      trackers[index].bestExitPrice = MathMin(trackers[index].bestExitPrice, quote);
      trackers[index].worstExitPrice = MathMax(trackers[index].worstExitPrice, quote);
   }
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
      string header = "record_version\tsource\taccount\tticket\tmagic\tdate\ttime\tclose_time\tsymbol\tdirection\tlots\tentry\tstop_loss\ttake_profit\texit_price\tinitial_risk_points\tinitial_risk_money\tgross_profit\tcommission\tswap\tnet_profit\tgross_r\tnet_r\tmfe_price\tmfe_r\tmae_price\tmae_r\texit_efficiency_pct\tentry_spread_points\texit_spread_points\tmax_spread_points\tspread_cost_estimate\texit_reason\texit_slippage_points\tregime\tvolatility\thtf_alignment\tsession\tbroker_utc_offset\tcomment\tcapture_quality";
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
   string exportQuality = tracker.captureQuality;
   if(tracker.initialStop <= 0 || tracker.initialRiskMoney <= 0)
   {
      exportQuality = exportQuality == "" || exportQuality == "complete"
         ? "missing_initial_sl"
         : exportQuality + "+missing_initial_sl";
   }

   string values[];
   ArrayResize(values, 41);
   values[0] = "1";
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
   values[15] = tracker.initialRiskPrice > 0 ? NumberText(tracker.initialRiskPrice / PointSize(tracker.symbol), 1) : "";
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
   FileWrite(handle, "ticket", "symbol", "type", "lots", "open_time", "open_price", "initial_stop", "take_profit", "risk_price", "risk_money", "best_exit", "worst_exit", "entry_spread", "max_spread", "regime", "volatility", "htf", "session", "utc_offset", "comment", "quality");
   for(int i = 0; i < ArraySize(trackers); i++)
   {
      TradeTracker tracker = trackers[i];
      FileWrite(handle, tracker.ticket, tracker.symbol, tracker.type, tracker.lots, (long)tracker.openTime, tracker.openPrice, tracker.initialStop, tracker.takeProfit, tracker.initialRiskPrice, tracker.initialRiskMoney, tracker.bestExitPrice, tracker.worstExitPrice, tracker.entrySpreadPoints, tracker.maxSpreadPoints, tracker.regime, tracker.volatility, tracker.htfAlignment, tracker.session, tracker.brokerUtcOffset, CleanText(tracker.orderComment), tracker.captureQuality);
   }
   FileClose(handle);
}

void LoadTrackers()
{
   ArrayResize(trackers, 0);
   int handle = FileOpen(StateFileName, FILE_READ | FILE_CSV | FILE_ANSI | FILE_SHARE_READ, '\t');
   if(handle == INVALID_HANDLE) return;
   if(!FileIsEnding(handle))
   {
      for(int headerColumn = 0; headerColumn < 21; headerColumn++) FileReadString(handle);
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
      tracker.entrySpreadPoints = StringToDouble(FileReadString(handle));
      tracker.maxSpreadPoints = StringToDouble(FileReadString(handle));
      tracker.regime = FileReadString(handle);
      tracker.volatility = FileReadString(handle);
      tracker.htfAlignment = FileReadString(handle);
      tracker.session = FileReadString(handle);
      tracker.brokerUtcOffset = StringToDouble(FileReadString(handle));
      tracker.orderComment = FileReadString(handle);
      tracker.captureQuality = "resumed_after_restart";
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
