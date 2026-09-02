const KEYS={trades:'tradingnote.localTrades',deleted:'tradingnote.deletedTrades',batches:'tradingnote.liveBatches',active:'tradingnote.activeLiveBatch',strategies:'tradingnote.strategyVersions.v1',backtests:'trs.trades',backtestBatches:'trs.batches',activeBacktest:'trs.activeBatch',tolerance:'tradingnote.analysisTolerance'};
const ATTR=[['missedTradeR','漏單'],['earlyExitR','提早出場'],['extraTradeR','額外亂做'],['lateEntryR','進場位置不同'],['slippageR','滑價／交易成本'],['marketDriftR','市場狀態差異']];
const ACTIONS={missedTradeR:'固定交易時段並建立漏單提醒；沒有下單也要留下機會紀錄。',earlyExitR:'出場前先檢查原始失效條件，避免只因浮盈回吐就手動平倉。',extraTradeR:'把不符合策略的單獨立標記，連續出現時啟用當日停手機制。',lateEntryR:'把進場觸發條件寫成可觀察事件，降低猶豫後追價。',slippageR:'記錄點差與滑價，只在成本仍符合最低 RR 時執行。',marketDriftR:'把波動、新聞與市場狀態加入策略適用條件。'};
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const readArray=key=>{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch{return[]}};
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const finite=value=>value!==''&&value!=null&&Number.isFinite(Number(value));
const signed=(value,suffix='R')=>finite(value)?`${Number(value)>0?'+':''}${Number(value).toFixed(2)}${suffix}`:'—';
const marketOf=trade=>String(trade.pair||trade.market||'').trim().toUpperCase();
const strategyOf=trade=>String(trade.strategyVersionId||'unassigned');
const dateOf=trade=>{const raw=String(trade.date||'').trim();const match=raw.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);return match?`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`:''};
const baseKey=trade=>`${trade.source||'TradingNote'}::${trade.row||trade.id||''}::${trade.date||''}`;
const identity=trade=>trade.externalId||[dateOf(trade),trade.time||'',marketOf(trade),trade.profit??'',trade.entry??''].join('::');
const gapOf=trade=>ATTR.reduce((sum,[field])=>sum+Math.max(0,Number(trade[field])||0),0);
function normalizeLiveTrade(trade){
  const pair=marketOf(trade),lots=Number(trade.lots),profit=Number(trade.profit),isEa=Boolean(trade.externalId||trade.source==='TradingNote MT4 EA');
  const fallbackPips=/^(NAS100|US100)(?:\.|$)/.test(pair)?25:/^(US30|DJ30)(?:\.|$)/.test(pair)?30:null;
  const smallLossBe=Number.isFinite(profit)&&profit>=-50&&profit<=0;
  return{...trade,outcome:smallLossBe?'be':trade.outcome,r:smallLossBe?0:isEa&&fallbackPips&&lots>0&&Number.isFinite(profit)?profit/(lots*fallbackPips):trade.r,slPips:isEa&&fallbackPips&&lots>0?fallbackPips:trade.slPips};
}
let liveTrades=[],liveBatches=[],backtestTrades=[],backtestBatches=[],strategies=[],activeLive='live-default',activeBacktest='',tolerance=.2,monteCarloResults=null;

function refreshData(){
  const local=readArray(KEYS.trades).map((trade,index)=>normalizeLiveTrade({...trade,id:trade.id??100000+index,origin:'local',batchId:trade.batchId||'live-default'}));
  const deleted=new Set(readArray(KEYS.deleted));
  const imported=(window.TRADES||[]).filter(trade=>!deleted.has(baseKey(trade))).map((trade,index)=>normalizeLiveTrade({...trade,id:trade.id??index+1,origin:'imported',batchId:trade.batchId||'live-default'}));
  const map=new Map();[...imported,...local].forEach(trade=>map.set(identity(trade),trade));liveTrades=[...map.values()];
  liveBatches=readArray(KEYS.batches);if(!liveBatches.length)liveBatches=[{id:'live-default',name:'主要紀錄'}];
  backtestTrades=readArray(KEYS.backtests);backtestBatches=readArray(KEYS.backtestBatches);strategies=readArray(KEYS.strategies);
  activeLive=localStorage.getItem(KEYS.active)||activeLive||liveBatches[0].id;
  activeBacktest=localStorage.getItem(KEYS.activeBacktest)||activeBacktest||backtestBatches[0]?.id||'';
  const savedToleranceRaw=localStorage.getItem(KEYS.tolerance),savedTolerance=Number(savedToleranceRaw);
  if(savedToleranceRaw!==null&&Number.isFinite(savedTolerance))tolerance=Math.max(.05,Math.min(2,savedTolerance));
}

function batchLive(){return activeLive==='live-all'?liveTrades:liveTrades.filter(trade=>(trade.batchId||'live-default')===activeLive)}
function batchBacktest(){return backtestTrades.filter(trade=>String(trade.batchId||backtestBatches[0]?.id||'')===String(activeBacktest))}
function filterItems(items){const market=$('#marketSelect').value||'all',strategy=$('#strategySelect').value||'all';return items.filter(trade=>(market==='all'||marketOf(trade)===market)&&(strategy==='all'||strategyOf(trade)===strategy))}
function selectedData(){
  const live=filterItems(batchLive()),backtest=filterItems(batchBacktest());
  const review=live.map(trade=>{const base=finite(trade.r)?Number(trade.r):0,recoverable=gapOf(trade);return{...trade,r:base+recoverable,liveR:finite(trade.r)?Number(trade.r):null,recoverable}}).filter(trade=>trade.liveR!=null||trade.recoverable>0);
  return{live,review,backtest};
}

function stats(items){
  const values=items.filter(trade=>finite(trade.r)).map(trade=>Number(trade.r)),total=values.reduce((sum,value)=>sum+value,0);let peak=0,equity=0,maxDrawdown=0;
  values.forEach(value=>{equity+=value;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity)});
  return{count:values.length,total,avg:values.length?total/values.length:0,winRate:values.length?values.filter(value=>value>0).length/values.length*100:0,maxDrawdown,values};
}
function trend(items){const values=items.filter(trade=>finite(trade.r)).map(trade=>Number(trade.r));if(values.length<8)return{ready:false,delta:0};const cut=Math.max(4,Math.floor(values.length*.65)),before=values.slice(0,cut),recent=values.slice(cut),avg=list=>list.reduce((sum,value)=>sum+value,0)/list.length;return{ready:true,delta:avg(recent)-avg(before),recent:avg(recent),before:avg(before)}}
function reviewRate(live){return live.length?live.filter(trade=>trade.reviewClass).length/live.length*100:0}
function pairedDates(live,backtest){const dates=new Set(live.map(dateOf).filter(Boolean));return new Set(backtest.map(dateOf).filter(date=>dates.has(date))).size}
function consistencyScore(executionGap,strategyGap,directGap,currentTolerance=tolerance){
  const closeness=gap=>Math.max(0,1-Math.abs(gap)/(Math.max(.01,currentTolerance)*2));
  return Math.round((closeness(executionGap)*.4+closeness(strategyGap)*.35+closeness(directGap)*.25)*100);
}

function diagnose(data){
  const live=stats(data.live),review=stats(data.review),backtest=stats(data.backtest),reviewed=reviewRate(data.live),paired=pairedDates(data.live,data.backtest);
  const executionGap=review.avg-live.avg,strategyGap=backtest.avg-review.avg,directGap=live.avg-backtest.avg,executionAligned=Math.abs(executionGap)<=tolerance,strategyAligned=Math.abs(strategyGap)<=tolerance,directAligned=Math.abs(directGap)<=tolerance;
  const enough=live.count>=20&&backtest.count>=20&&reviewed>=60;
  const trends={live:trend(data.live),review:trend(data.review),backtest:trend(data.backtest)};
  const allDeclining=Object.values(trends).every(item=>item.ready&&item.delta< -tolerance);
  let scenario;
  if(!live.count||!review.count||!backtest.count)scenario={number:'0',key:'insufficient',label:'DATA CHECK',title:'資料尚未形成完整三層比較',description:'至少需要回測 R、實盤 R，以及復盤所需資料。系統目前不會推論策略失效。',tone:'warn'};
  else if(!executionAligned)scenario={number:'1',key:'execution',label:'① EXECUTION GAP',title:'優先處理執行落差，不先修改策略',description:`復盤應有期望值比實盤高 ${Math.abs(executionGap).toFixed(2)}R／筆。先拆解漏單、額外交易、進出場與情緒干預。`,tone:'bad'};
  else if(strategyAligned)scenario={number:'3',key:'replicated',label:'③ EDGE REPLICATED',title:'三層績效目前基本一致',description:'策略理論值、當下規則判讀與真正執行都落在容許範圍內，實盤正在複製回測 Edge。',tone:'good'};
  else if(strategyGap>tolerance&&enough)scenario={number:'4',key:'regime',label:'④ STRATEGY / REGIME WATCH',title:'執行接近復盤，但長期低於回測',description:'執行不是主要問題。檢查策略適用環境、波動結構與 Edge 是否衰退；不要只因單月差異就改規則。',tone:'warn'};
  else scenario={number:'2',key:'quality',label:'② BACKTEST QUALITY GAP',title:'實盤執行接近復盤，但與回測判讀不同',description:'優先檢查 Hindsight Bias、支撐壓力主觀性、規則版本與回測是否使用未來資訊。',tone:'warn'};
  const consistency=live.count&&review.count&&backtest.count?consistencyScore(executionGap,strategyGap,directGap):null;
  const confidence=Math.round((Math.min(1,live.count/20)*.4+Math.min(1,backtest.count/20)*.4+Math.min(1,reviewed/60)*.2)*100);
  return{live,review,backtest,reviewed,paired,executionGap,strategyGap,directGap,executionAligned,strategyAligned,directAligned,consistency,confidence,enough,trends,allDeclining,scenario};
}

function populateControls(){
  const live=$('#liveBatchSelect'),bt=$('#backtestBatchSelect'),oldLive=live.value||activeLive,oldBt=bt.value||activeBacktest;
  live.innerHTML=[...liveBatches,{id:'live-all',name:'完整紀錄'}].map(item=>`<option value="${esc(item.id)}">${esc(item.name||item.id)}</option>`).join('');live.value=[...live.options].some(option=>option.value===oldLive)?oldLive:live.options[0]?.value||'';activeLive=live.value;
  bt.innerHTML=backtestBatches.length?backtestBatches.map(item=>`<option value="${esc(item.id)}">${esc(item.name||item.id)}</option>`).join(''):'<option value="">尚無回測斷點</option>';bt.value=[...bt.options].some(option=>option.value===oldBt)?oldBt:bt.options[0]?.value||'';activeBacktest=bt.value;
  const oldMarket=$('#marketSelect').value||'all',oldStrategy=$('#strategySelect').value||'all',markets=[...new Set([...batchLive(),...batchBacktest()].map(marketOf).filter(Boolean))].sort();
  $('#marketSelect').innerHTML='<option value="all">全部商品</option>'+markets.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');$('#marketSelect').value=markets.includes(oldMarket)?oldMarket:'all';
  const ids=[...new Set([...batchLive(),...batchBacktest()].map(strategyOf))],label=id=>{if(id==='unassigned')return'未綁定策略';const item=strategies.find(strategy=>String(strategy.id)===String(id));return item?`${item.name} ${item.version}`:'已刪除的策略版本'};
  $('#strategySelect').innerHTML='<option value="all">全部版本</option>'+ids.map(id=>`<option value="${esc(id)}">${esc(label(id))}</option>`).join('');$('#strategySelect').value=ids.includes(oldStrategy)?oldStrategy:'all';
  $('#toleranceInput').value=String(tolerance);$('#toleranceValue').textContent=`${tolerance.toFixed(2)}R`;
}

function metric(label,value,note,tone=''){return`<article class="${tone}"><span>${label}</span><b>${value}</b><small>${note}</small></article>`}
function renderHero(result){
  const item=result.scenario,node=$('#diagnosisHero');node.dataset.number=item.number;node.innerHTML=`<span class="status">${item.label}</span><h2>${item.title}</h2><p>${item.description}</p><footer><span>判斷容許值 ±${tolerance.toFixed(2)}R／筆</span><span>${result.enough?'樣本達基本門檻':'樣本仍需累積'}</span><span>復盤完成率 ${result.reviewed.toFixed(1)}%</span></footer>`;
}
function renderChain(result){
  [['backtest',result.backtest],['live',result.live],['review',result.review]].forEach(([name,value])=>{$(`#${name}Total`).textContent=value.count?signed(value.total):'—';$(`#${name}Meta`).textContent=value.count?`${value.count} 筆有 R · Avg ${signed(value.avg)}`:'目前沒有可計算 R 的資料'});
  const retention=result.backtest.avg?result.live.avg/result.backtest.avg*100:null;
  const consistencyTone=result.consistency==null?'':result.consistency>=80?'good':result.consistency>=60?'warn':'bad';
  $('#gapMetrics').innerHTML=[metric('三層一致性評分',result.consistency==null?'—':`${result.consistency} 分`,`樣本可信度 ${result.confidence}% · 容許值 ±${tolerance.toFixed(2)}R`,consistencyTone),metric('Execution Gap',result.review.count&&result.live.count?signed(result.live.avg-result.review.avg,'R／筆'):'—','實盤 − 復盤',result.executionAligned?'good':'bad'),metric('Strategy Definition Gap',result.backtest.count&&result.review.count?signed(result.review.avg-result.backtest.avg,'R／筆'):'—','復盤 − 回測',result.strategyAligned?'good':'warn'),metric('Edge 複製率',retention!=null?`${retention.toFixed(1)}%`:'—','實盤 Avg R ÷ 回測 Avg R',retention!=null&&retention>=80?'good':'warn'),metric('同日期覆蓋',`${result.paired} 天`,'兩邊同日有紀錄',result.paired>=10?'good':'')].join('');
}
function curvePoints(values,min,max){let total=0;const totals=values.map(value=>(total+=value));if(!totals.length)return'';return totals.map((value,index)=>`${values.length===1?500:index/(values.length-1)*980+10},${245-(value-min)/(max-min||1)*225}`).join(' ')}
function renderCurve(result){
  const series=[{className:'bt',color:'#7392ff',values:result.backtest.values},{className:'rv',color:'#b094ff',values:result.review.values},{className:'lv',color:'#27d3b4',values:result.live.values}],all=[0];series.forEach(item=>{let total=0;item.values.forEach(value=>{total+=value;all.push(total)})});if(series.some(item=>!item.values.length)){$('#tripleCurve').innerHTML='<div class="empty">三層都具有 R 資料後，才會顯示完整曲線。</div>';return}const min=Math.min(...all),max=Math.max(...all);$('#tripleCurve').innerHTML=`<svg viewBox="0 0 1000 260" preserveAspectRatio="none" aria-label="回測、實盤與復盤累積 R 曲線">${series.map(item=>{const points=curvePoints(item.values,min,max),last=points.split(' ').at(-1).split(','),liveStyle=item.className==='lv'?'style="stroke-width:3;stroke-dasharray:8 5"':'';return`<polyline class="${item.className}" ${liveStyle} points="${points}"/><circle class="${item.className}" cx="${last[0]}" cy="${last[1]}" r="4" fill="${item.color}"/>`}).join('')}</svg>`;
}
function check(label,note,ok,warning=false){const tone=ok?'good':warning?'warn':'bad';return`<article class="${tone}"><i>${ok?'✓':warning?'!':'×'}</i><div><b>${label}</b><small>${note}</small></div><strong>${ok?'一致':warning?'觀察':'有落差'}</strong></article>`}
function renderRelationships(result){
  $('#relationshipChecks').innerHTML=[check('實盤 vs 回測',`相差 ${Math.abs(result.directGap).toFixed(2)}R／筆；直接檢查實盤是否複製回測 Edge。`,result.directAligned),check('復盤 vs 實盤',`相差 ${Math.abs(result.executionGap).toFixed(2)}R／筆；用來看人的執行。`,result.executionAligned),check('回測 vs 復盤',`相差 ${Math.abs(result.strategyGap).toFixed(2)}R／筆；用來看策略定義與回測品質。`,result.strategyAligned),check('三者後段趨勢',result.allDeclining?'三層樣本後段都同步下降，需觀察市場環境。':'尚未出現三層同步惡化的完整證據。',!result.allDeclining,!result.enough)].join('');
  const data=selectedData();$('#coverageChecks').innerHTML=[`<div><b>${result.live.count} 筆實盤 R</b><span>${result.live.count>=20?'已達基本診斷門檻':'建議至少累積 20 筆'}</span></div>`,`<div><b>${result.backtest.count} 筆回測 R</b><span>${result.backtest.count>=20?'已達基本診斷門檻':'建議至少累積 20 筆'}</span></div>`,`<div><b>${result.reviewed.toFixed(1)}% 已復盤</b><span>${result.reviewed>=60?'足以觀察執行分布':'完成率過低會低估 Execution Gap'}</span></div>`,`<div><b>${result.paired} 個同日期</b><span>${result.paired?'可分離市場日差異':'目前只能比較整體分布'}</span></div>`].join('');
}

function attribution(data){return ATTR.map(([field,label])=>({field,label,value:data.live.reduce((sum,trade)=>sum+Math.max(0,Number(trade[field])||0),0)}))}
function renderExecution(data,result){
  const values=attribution(data),total=values.reduce((sum,item)=>sum+item.value,0),max=Math.max(...values.map(item=>item.value),.01);$('#attributionBoard').innerHTML=`<div class="attribution-total"><span>已歸因 Execution Gap</span><b>${total?`-${total.toFixed(2)}R`:'—'}</b></div>`+values.map(item=>`<div class="attribution-row"><span>${item.label}</span><i><b style="width:${item.value/max*100}%"></b></i><strong>${item.value?`-${item.value.toFixed(2)}R`:'—'}</strong></div>`).join('');
  const ranked=values.filter(item=>item.value>0).sort((a,b)=>b.value-a.value);$('#executionActions').innerHTML=ranked.length?ranked.slice(0,4).map((item,index)=>`<article><span>${String(index+1).padStart(2,'0')}</span><div><b>${item.label}</b><small>${ACTIONS[item.field]}</small></div><strong>-${item.value.toFixed(2)}R</strong></article>`).join(''):'<div class="empty-inline">尚未填寫 R 落差歸因。請先到實盤復盤系統完成紀錄。</div>';
  const grouped=new Map();data.live.forEach(trade=>{const date=dateOf(trade);if(!date)return;const row=grouped.get(date)||{count:0,live:0,review:0,gap:0};row.count++;const liveR=finite(trade.r)?Number(trade.r):0,gap=gapOf(trade);row.live+=liveR;row.review+=liveR+gap;row.gap+=gap;grouped.set(date,row)});const rows=[...grouped.entries()].sort((a,b)=>b[0].localeCompare(a[0]));$('#executionRows').innerHTML=rows.length?rows.map(([date,row])=>`<tr><td><b>${date}</b></td><td>${row.count}</td><td class="${row.live>=0?'pos':'neg'}">${signed(row.live)}</td><td class="${row.review>=0?'pos':'neg'}">${signed(row.review)}</td><td class="${row.gap?'neg':'muted'}">${row.gap?`-${row.gap.toFixed(2)}R`:'—'}</td><td><span class="status-chip ${row.gap>tolerance?'bad':row.gap?'warn':'good'}">${row.gap>tolerance?'需檢查':row.gap?'輕微落差':'執行一致'}</span></td></tr>`).join(''):'<tr><td colspan="6" class="muted">目前沒有實盤日期資料。</td></tr>';
}
function groupStats(items,keyFn){const map=new Map();items.forEach(item=>{const key=keyFn(item);if(!key)return;const list=map.get(key)||[];list.push(item);map.set(key,list)});return map}
function strategyLabel(id){if(id==='unassigned')return'未綁定策略';const item=strategies.find(strategy=>String(strategy.id)===String(id));return item?`${item.name} ${item.version}`:'已刪除的策略版本'}
function renderStrategy(data,result){
  const retention=result.backtest.avg?result.live.avg/result.backtest.avg*100:null,trendText=result.allDeclining?'三層後段同步下降':'未見三層同步下降';$('#edgeVerdict').innerHTML=`<div><span class="status">${result.scenario.label}</span><h3>${result.scenario.title}</h3><p>${result.enough?'目前樣本可做初步判讀，但仍應以多個月份確認。':'樣本尚未達基本門檻，以下結果只作觀察，不直接判定 Edge 失效。'}</p></div><div><span>Edge 複製率</span><b>${retention==null?'—':`${retention.toFixed(1)}%`}</b></div><div><span>樣本可信度</span><b>${result.enough?'基本足夠':'累積中'}</b></div><div><span>後段共振</span><b>${trendText}</b></div>`;
  const liveMarkets=groupStats(data.live,marketOf),reviewMarkets=groupStats(data.review,marketOf),btMarkets=groupStats(data.backtest,marketOf),markets=[...new Set([...liveMarkets.keys(),...reviewMarkets.keys(),...btMarkets.keys()])].sort();$('#marketRows').innerHTML=markets.length?markets.map(name=>{const live=stats(liveMarkets.get(name)||[]),review=stats(reviewMarkets.get(name)||[]),bt=stats(btMarkets.get(name)||[]),executionOk=!live.count||!review.count||Math.abs(review.avg-live.avg)<=tolerance,strategyOk=!bt.count||!review.count||Math.abs(bt.avg-review.avg)<=tolerance;const label=!executionOk?'執行落差':!strategyOk?'策略／回測差':'一致';return`<tr><td><b>${esc(name)}</b></td><td>${bt.count?signed(bt.avg):'—'}</td><td>${live.count?signed(live.avg):'—'}</td><td>${review.count?signed(review.avg):'—'}</td><td><span class="status-chip ${label==='一致'?'good':label==='執行落差'?'bad':'warn'}">${label}</span></td></tr>`}).join(''):'<tr><td colspan="5" class="muted">目前沒有商品資料。</td></tr>';
  const liveVersions=groupStats(data.live,strategyOf),reviewVersions=groupStats(data.review,strategyOf),btVersions=groupStats(data.backtest,strategyOf),ids=[...new Set([...liveVersions.keys(),...reviewVersions.keys(),...btVersions.keys()])];$('#strategyRows').innerHTML=ids.length?ids.map(id=>{const live=stats(liveVersions.get(id)||[]),review=stats(reviewVersions.get(id)||[]),bt=stats(btVersions.get(id)||[]);return`<article><div><b>${esc(strategyLabel(id))}</b><small>回測 ${bt.count} · 實盤 ${live.count} · 復盤 ${review.count} 筆</small></div><span>${bt.count?signed(bt.avg):'—'}<small>BT</small></span><span>${live.count?signed(live.avg):'—'}<small>LIVE</small></span><span>${review.count?signed(review.avg):'—'}<small>RV</small></span></article>`}).join(''):'<div class="empty-inline">目前沒有策略版本資料。</div>';
}

function dateTotals(items){const map=new Map();items.forEach(trade=>{const date=dateOf(trade);if(!date)return;const row=map.get(date)||{count:0,r:0};row.count++;if(finite(trade.r))row.r+=Number(trade.r);map.set(date,row)});return map}
function renderSameDates(data){
  const live=dateTotals(data.live),review=dateTotals(data.review),backtest=dateTotals(data.backtest),dates=[...live.keys()].filter(date=>backtest.has(date)).sort().reverse();
  $('#sameDateRows').innerHTML=dates.length?dates.map(date=>{const bt=backtest.get(date),rv=review.get(date)||{r:live.get(date).r},lv=live.get(date),gap=lv.r-bt.r;return`<tr><td><b>${date}</b></td><td>${bt.count}</td><td class="${bt.r>=0?'pos':'neg'}">${signed(bt.r)}</td><td class="${lv.r>=0?'pos':'neg'}">${signed(lv.r)}</td><td class="${rv.r>=0?'pos':'neg'}">${signed(rv.r)}</td><td class="${gap>=0?'pos':'neg'}">${signed(gap)}</td></tr>`}).join(''):'<tr><td colspan="6" class="muted">目前沒有同日期的回測與實盤資料；整體分布仍可在上方比較。</td></tr>';
}

function percentile(values,ratio){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b),position=(sorted.length-1)*ratio,lower=Math.floor(position),upper=Math.ceil(position);return lower===upper?sorted[lower]:sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower)}
function maxBalanceDrawdown(balances){let peak=balances[0]||0,max=0;balances.forEach(value=>{peak=Math.max(peak,value);if(peak>0)max=Math.max(max,(peak-value)/peak*100)});return max}
function simulateMonteCarlo(values,{balance,risk,trades,runs}){
  if(values.length<5)return{sampleSize:values.length,trades,runs,risk};
  const checkpoints=Array.from({length:trades+1},()=>[]),finalReturns=[],finalRs=[],drawdowns=[],rDrawdowns=[],lossStreaks=[];let worstRun=null;
  for(let run=0;run<runs;run++){
    let equity=balance,equityR=0,peakR=0,maxRDrawdown=0,currentLosses=0,maxLosses=0;const balances=[equity];checkpoints[0].push(0);
    for(let index=1;index<=trades;index++){
      const sampled=values[Math.floor(Math.random()*values.length)];equity=Math.max(0,equity+equity*(risk/100)*sampled);equityR+=sampled;peakR=Math.max(peakR,equityR);maxRDrawdown=Math.max(maxRDrawdown,peakR-equityR);currentLosses=sampled<0?currentLosses+1:0;maxLosses=Math.max(maxLosses,currentLosses);balances.push(equity);checkpoints[index].push((equity-balance)/balance*100);
    }
    const finalReturn=(equity-balance)/balance*100,drawdown=maxBalanceDrawdown(balances);finalReturns.push(finalReturn);finalRs.push(equityR);drawdowns.push(drawdown);rDrawdowns.push(maxRDrawdown);lossStreaks.push(maxLosses);if(!worstRun||equityR<worstRun.finalR)worstRun={finalR:equityR,finalReturn,drawdown,maxRDrawdown,maxLosses};
  }
  return{sampleSize:values.length,trades,runs,risk,p10:checkpoints.map(list=>percentile(list,.1)),p50:checkpoints.map(list=>percentile(list,.5)),p90:checkpoints.map(list=>percentile(list,.9)),p10Final:percentile(finalReturns,.1),p50Final:percentile(finalReturns,.5),p90Final:percentile(finalReturns,.9),p10FinalR:percentile(finalRs,.1),p50FinalR:percentile(finalRs,.5),p90FinalR:percentile(finalRs,.9),lossRate:finalReturns.filter(value=>value<0).length/runs*100,medianDrawdown:percentile(drawdowns,.5),p95Drawdown:percentile(drawdowns,.95),p95RDrawdown:percentile(rDrawdowns,.95),p99RDrawdown:percentile(rDrawdowns,.99),p95LossStreak:percentile(lossStreaks,.95),p99LossStreak:percentile(lossStreaks,.99),worstRun};
}
function drawMonteCarlo(canvas,result){
  if(!canvas)return;const width=Math.max(320,canvas.clientWidth||640),height=250,dpr=window.devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);ctx.strokeStyle='rgba(135,161,170,.13)';ctx.lineWidth=1;for(let row=1;row<4;row++){ctx.beginPath();ctx.moveTo(0,row*height/4);ctx.lineTo(width,row*height/4);ctx.stroke()}if(!result?.p50)return;const all=[...result.p10,...result.p50,...result.p90,0],min=Math.min(...all),max=Math.max(...all),colors=[['p90','#27d3b4',[5,5]],['p50','#b094ff',[]],['p10','#ff647c',[5,5]]];colors.forEach(([key,color,dash])=>{const values=result[key];ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=key==='p50'?2.8:1.8;ctx.setLineDash(dash);values.forEach((value,index)=>{const x=index/(values.length-1||1)*(width-12)+6,y=height-10-(value-min)/(max-min||1)*(height-20);if(index)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.stroke()});ctx.setLineDash([]);
}
function mcMetrics(result){return[['P10 最終報酬',`${result.p10Final>=0?'+':''}${result.p10Final.toFixed(1)}%`,result.p10Final>=0?'pos':'neg'],['P50 最終報酬',`${result.p50Final>=0?'+':''}${result.p50Final.toFixed(1)}%`,result.p50Final>=0?'pos':'neg'],['P90 最終報酬',`${result.p90Final>=0?'+':''}${result.p90Final.toFixed(1)}%`,result.p90Final>=0?'pos':'neg'],['虧損機率',`${result.lossRate.toFixed(1)}%`,result.lossRate>30?'neg':''],['中位最大回撤',`${result.medianDrawdown.toFixed(1)}%`,'neg'],['95% 最大回撤',`${result.p95Drawdown.toFixed(1)}%`,'neg']].map(([label,value,tone])=>`<div><span>${label}</span><strong class="${tone}">${value}</strong></div>`).join('')}
function mcStress(result){return`<div><span>95% 連敗壓力</span><b>${Math.ceil(result.p95LossStreak)} 連敗</b></div><div><span>99% 連敗壓力</span><b>${Math.ceil(result.p99LossStreak)} 連敗</b></div><div><span>95% R 回撤</span><b>-${result.p95RDrawdown.toFixed(2)}R</b></div><div><span>99% R 回撤</span><b>-${result.p99RDrawdown.toFixed(2)}R</b></div><div class="wide"><span>本次最差路徑</span><b>${signed(result.worstRun.finalR)} · ${result.worstRun.finalReturn.toFixed(1)}% · 最長 ${result.worstRun.maxLosses} 連敗</b></div>`}
function renderMonteCarloPanel(name,label,result){
  const metrics=$(`#mc${name}Metrics`),formula=$(`#mc${name}Formula`),stress=$(`#mc${name}Stress`),chart=$(`#mc${name}Chart`);if(!result?.worstRun){metrics.innerHTML=`<div><span>Monte Carlo</span><strong>資料不足</strong></div><div><span>非 0R 樣本</span><strong>${result?.sampleSize||0}</strong></div>`;formula.textContent='至少需要 5 筆非 0R';stress.innerHTML='';drawMonteCarlo(chart,null);return}metrics.innerHTML=mcMetrics(result);formula.textContent=`${result.runs} runs · ${result.trades} trades · ${result.sampleSize} samples`;stress.innerHTML=mcStress(result);drawMonteCarlo(chart,result);
}
function renderMonteCarloComparison(results){
  const ready=Object.values(results).every(result=>result?.worstRun);if(!ready){$('#mcComparison').innerHTML='<div class="empty-inline">三層各自至少需要 5 筆非 0R，才能產生完整比較。</div>';return}const rows=[['P50 期末 R','p50FinalR',value=>signed(value)],['P10 期末 R','p10FinalR',value=>signed(value)],['99% R 回撤','p99RDrawdown',value=>`-${value.toFixed(2)}R`],['99% 連敗壓力','p99LossStreak',value=>`${Math.ceil(value)} 連敗`],['虧損機率','lossRate',value=>`${value.toFixed(1)}%`]];$('#mcComparison').innerHTML=`<div class="mc-compare-head"><span>指標</span><b>回測</b><b>實盤</b><b>復盤</b></div>${rows.map(([label,key,format])=>`<div><span>${label}</span><b>${format(results.Backtest[key])}</b><b>${format(results.Live[key])}</b><b>${format(results.Review[key])}</b></div>`).join('')}`;
}
function runMonteCarlo(){
  const data=selectedData(),settings={balance:Math.max(1,Number($('#mcBalance').value)||100000),risk:Math.max(.01,Math.min(20,Number($('#mcRisk').value)||1)),trades:Math.max(10,Math.min(1000,Math.round(Number($('#mcTrades').value)||100))),runs:Math.max(100,Math.min(5000,Math.round(Number($('#mcRuns').value)||1000)))},values={Live:stats(data.live).values.filter(value=>value!==0),Review:stats(data.review).values.filter(value=>value!==0),Backtest:stats(data.backtest).values.filter(value=>value!==0)};monteCarloResults=Object.fromEntries(Object.entries(values).map(([key,list])=>[key,simulateMonteCarlo(list,settings)]));$('#mcSampleNote').innerHTML=`目前條件：實盤 <b>${values.Live.length}</b> 筆、復盤 <b>${values.Review.length}</b> 筆、回測 <b>${values.Backtest.length}</b> 筆非 0R 樣本。綠線 P90、紫線 P50、紅線 P10。`;['Live','Review','Backtest'].forEach(name=>renderMonteCarloPanel(name,name,monteCarloResults[name]));renderMonteCarloComparison(monteCarloResults);
}

function render(){const data=selectedData(),result=diagnose(data);monteCarloResults=null;renderHero(result);renderChain(result);renderCurve(result);renderRelationships(result);renderSameDates(data);renderExecution(data,result);renderStrategy(data,result)}
function reload(){refreshData();populateControls();render()}
function toast(message){const node=$('#toast');node.textContent=message;node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,2200)}

$('#liveBatchSelect').onchange=event=>{activeLive=event.target.value;localStorage.setItem(KEYS.active,activeLive);populateControls();render()};
$('#backtestBatchSelect').onchange=event=>{activeBacktest=event.target.value;if(activeBacktest)localStorage.setItem(KEYS.activeBacktest,activeBacktest);populateControls();render()};
['marketSelect','strategySelect'].forEach(id=>$('#'+id).onchange=render);
$('#toleranceInput').oninput=event=>{tolerance=Number(event.target.value);localStorage.setItem(KEYS.tolerance,String(tolerance));$('#toleranceValue').textContent=`${tolerance.toFixed(2)}R`;render()};
$('#refreshButton').onclick=()=>{reload();toast('已重新讀取實盤、復盤與回測資料。')};
$('#monteCarloForm').onsubmit=event=>{event.preventDefault();runMonteCarlo()};
$$('nav button').forEach(button=>button.onclick=()=>{$$('nav button').forEach(item=>item.classList.toggle('active',item===button));$$('.page').forEach(page=>page.classList.toggle('active',page.id===button.dataset.view));$('#pageTitle').textContent={diagnosis:'三層績效診斷',execution:'Execution Gap 分析',strategy:'策略與 Edge 診斷',montecarlo:'三層 Monte Carlo'}[button.dataset.view];if(button.dataset.view==='montecarlo')requestAnimationFrame(()=>{if(!monteCarloResults)runMonteCarlo();else ['Live','Review','Backtest'].forEach(name=>drawMonteCarlo($(`#mc${name}Chart`),monteCarloResults[name]))})});
reload();
