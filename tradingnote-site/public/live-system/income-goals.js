/* Income planning uses realized P/L only and an explicit fixed capital basis. */
(function (root) {
  const KEY = 'tradingnote.incomeGoals.v1';
  const month = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const validNumber = value => value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value));
  function tradeDate(t) {
    for (const value of [t.closeTime, t.date]) {
      const match = String(value || '').replaceAll('.', '-').match(/^(\d{4}-\d{2}-\d{2})/);
      if (!match) continue;
      const parsed = new Date(match[1] + 'T00:00:00');
      if (Number.isFinite(parsed.getTime()) && month(parsed)+'-'+String(parsed.getDate()).padStart(2,'0') === match[1]) return match[1];
      return null;
    }
    return null;
  }
  function calculate(items, s, now = new Date()) {
    const current = month(now), today = `${current}-${String(now.getDate()).padStart(2, '0')}`;
    const rows = items.filter(t => t.recordType !== 'missed_opportunity' && t.reviewClass !== 'missed_trade' && !/deposit|withdraw|balance|credit/i.test([t.type,t.recordType,t.direction].join(' ')) && validNumber(t.profit))
      .map(t => ({ date: tradeDate(t), profit: Number(t.profit) })).filter(t => t.date && t.date <= today).sort((a,b) => a.date.localeCompare(b.date));
    const first = rows[0]?.date;
    // The first observed month may be partial, so exclude it unless coverage starts on day 1.
    let start = first ? new Date(Number(first.slice(0,4)), Number(first.slice(5,7)) - 1 + (first.endsWith('-01') ? 0 : 1), 1) : new Date(now.getFullYear(), now.getMonth(), 1);
    if (s.period !== 'all') start = new Date(Math.max(start.getTime(), new Date(now.getFullYear(), now.getMonth() - Number(s.period), 1).getTime()));
    const months = [];
    for (let d = new Date(start); month(d) < current && months.length < 1200; d.setMonth(d.getMonth() + 1)) {
      const key = month(d), profit = rows.filter(t => t.date.startsWith(key)).reduce((a,t) => a+t.profit,0);
      months.push({ key, profit, rate: s.basis > 0 ? profit/s.basis : null });
    }
    const historical = months.length && s.basis > 0 ? months.reduce((a,m) => a+m.rate,0)/months.length : null;
    const currentRows = rows.filter(t => t.date.startsWith(current));
    const currentProfit = currentRows.reduce((a,t) => a+t.profit,0);
    const provisional = historical === null && currentRows.length > 0 && s.basis > 0;
    const automatic = historical ?? (provisional ? currentProfit/s.basis : null);
    const rate = s.mode === 'manual' ? s.manual/100 : automatic;
    const factor = (s.kind === 'prop' ? s.share/100 : 1)*s.fx;
    const payout = profit => profit*factor;
    const required = rate > 0 && factor > 0 ? s.target/(rate*factor) : null;
    const needed = s.capital > 0 && factor > 0 ? s.target/(s.capital*factor) : null;
    let equity = s.basis, peak = equity, drawdown = 0;
    rows.filter(t => t.date >= month(start)+'-01' && t.date < current+'-01').forEach(t => { equity += t.profit; peak = Math.max(peak,equity); if (peak > 0) drawdown = Math.max(drawdown,(peak-equity)/peak); });
    return { current, rows, months, historical, provisional, rate, required, needed, currentProfit, currentPayout: payout(currentProfit), projected: rate === null ? null : payout(s.capital*rate), drawdown: months.length && s.basis > 0 ? drawdown : null, achieved: months.filter(m => payout(m.profit) >= s.target).length, losses: months.filter(m => m.profit < 0).length, payout };
  }
  root.IncomeGoals = { calculate };
  if (!root.document) return;
  const money = n => n === null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(n);
  const pct = n => n === null || !Number.isFinite(n) ? '—' : `${(n*100).toFixed(2)}%`;
  const escape = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let context;
  function read() { try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
  function render(items, batch, initial, label) {
    context = {items,batch,initial,label};
    const host = document.getElementById('incomeGoalContent');
    if (!host) return;
    const saved = read();
    const accounts = [...new Set(items.map(t => String(t.account || '未標記帳戶')))];
    const stored = saved[batch] || {};
    const s = { target:30000, capital:initial, basis:initial, currency:'USD', fx:32, kind:'own', share:80, period:'6', mode:'auto', manual:1, account:accounts[0] || '未標記帳戶', ...stored };
    if (!accounts.includes(s.account)) s.account = accounts[0] || '未標記帳戶';
    const data = items.filter(t => String(t.account || '未標記帳戶') === s.account);
    const r = calculate(data,s);
    const received = r.currentPayout;
    const sourceLabel = s.mode === 'manual' ? '手動情境試算' : r.provisional ? '本月至今績效（未滿月）' : '歷史平均月報酬';
    const field = (name,title,min=0,max='',step='any') => `<label>${title}<input name="${name}" type="number" min="${min}" ${max !== '' ? `max="${max}"` : ''} step="${step}" required value="${escape(s[name])}"></label>`;
    const select = (name,title,opts) => `<label>${title}<select name="${name}">${opts.map(([v,l])=>`<option value="${escape(v)}" ${String(s[name])===String(v)?'selected':''}>${escape(l)}</option>`).join('')}</select></label>`;
    const progress = (value,total,title) => `<progress aria-label="${title}" max="100" value="${Math.max(0,Math.min(100,(value || 0)/total*100))}"></progress>`;
    host.innerHTML = `<div class="income-intro"><div><p class="eyebrow">INCOME GOALS</p><h2>讓每一筆績效，連到你的收入目標</h2><p>${escape(label)} · ${escape(s.account)} · 自動讀取此帳戶的實盤紀錄，不受上方交易篩選影響。</p></div><span class="income-badge">${sourceLabel}</span></div>
      <form id="incomeGoalForm" class="income-panel"><h3>我的收入計畫</h3><p class="income-note">首次使用請確認目標、本金與匯率；本金預填自挑戰設定，匯率 32 為試算值，並非即時報價。</p><div class="income-fields">
      ${select('account','資料帳戶',accounts.length?accounts.map(a=>[a,a]):[['未標記帳戶','未標記帳戶']])}
      ${field('target','每月獲利目標 · NTD',1)}${select('kind','資金類型',[['own','自有本金'],['prop','Prop Firm']])}
      ${select('currency','帳戶幣別',[['USD','USD'],['NTD','NTD'],['EUR','EUR'],['JPY','JPY'],['GBP','GBP'],['AUD','AUD'],['HKD','HKD']])}
      ${field('capital','目前可交易本金',1)}${field('basis','歷史績效計算本金基準',1)}${field('fx','1 帳戶幣別 = NTD（手動匯率）',0.000001)}
      ${field('share','Prop 分潤給自己 · %',0,100)}
      ${select('period','歷史完整月份',[['3','近 3 個月'],['6','近 6 個月'],['12','近 12 個月'],['all','全部期間']])}
      ${select('mode','績效來源',[['auto','自動：實盤績效'],['manual','手動：情境試算']])}${field('manual','手動假設月報酬 · %',-100,1000)}
      </div><div class="income-actions"><button class="primary-button" type="submit">儲存並更新進度</button><button class="ghost-button" type="button" id="incomeUseActual">回到實際績效</button><span id="incomeSaveStatus" role="status">設定保存在此瀏覽器，納入完整備份。</span></div></form>
      <div class="income-cards" aria-live="polite">
      <article class="income-panel income-hero"><p>本月獲利進度 · ${r.current}</p><strong>NT$ ${money(received)}</strong><p>目標 NT$ ${money(s.target)} · 完成 ${pct(Math.max(0,received)/s.target)}</p>${progress(received,s.target,'本月獲利進度')}<small>距離目標還差 NT$ ${money(Math.max(0,s.target-received))} · 依本月淨損益自動更新</small></article>
      <article class="income-panel"><p>本金到位進度</p><strong>${money(r.required)} <small>${escape(s.currency)}</small></strong><p>目前 ${money(s.capital)} · ${r.required ? `到位 ${pct(s.capital/r.required)}`:'暫無法推算所需本金'}</p>${progress(s.capital,r.required || Infinity,'本金到位進度')}<small>${r.required ? `尚差 ${money(Math.max(0,r.required-s.capital))} ${escape(s.currency)}`:(r.rate === null ? '尚無可用實盤績效，請匯入交易或使用手動試算' : r.rate <= 0 ? '目前績效未獲利，無法反推正向本金需求' : '請確認分潤比例與匯率大於零')}</small></article>
      <article class="income-panel"><p>目前本金達標需要的月報酬</p><strong>${pct(r.needed)}</strong><p>${sourceLabel} ${pct(r.rate)} · 歷史平均 ${pct(r.historical)}</p><small>${r.needed!==null && r.rate!==null ? `相差 ${((r.needed-r.rate)*100).toFixed(2)} 個百分點`:'尚無可比較績效，或分潤比例為零'}</small></article></div>
      <div class="income-summary income-panel"><div><span>${r.provisional && s.mode !== 'manual' ? '依本月至今績效試算（未滿月）' : '依目前本金估算每月獲利'}</span><b>NT$ ${money(r.projected)}</b></div><div><span>本月淨獲利換算（未結束）</span><b>NT$ ${money(r.currentPayout)}</b></div><div><span>本月已實現交易淨利</span><b>${money(r.currentProfit)} ${escape(s.currency)}</b></div><div><span>歷史估算達標／虧損月份</span><b>${r.achieved} / ${r.months.length} · 虧損 ${r.losses} 月</b></div><div><span>固定本金口徑最大回撤</span><b>${pct(r.drawdown)}</b></div></div>
      <div class="income-panel"><h3>績效依據</h3><p class="income-note">${r.months.length ? `${r.months[0].key} 至 ${r.months.at(-1).key}，共 ${r.months.length} 個已結束月份。`:'尚無可採用的完整月份。'} 首筆交易所在月若不是從 1 日開始，預設排除；期間內無交易月份以 0 計，請確認紀錄完整。當月不納入歷史平均；尚無完整月份時，自動採用本月至今淨損益 ÷ 本金基準，不放大推估整月。</p><p class="income-note">月報酬＝當月已實現淨損益 ÷ 歷史本金基準（固定本金口徑，非資金加權報酬）。請填入與所選紀錄相符的本金；歷史有本金變更時，請切換至對應斷點。入金、出金不算交易獲利；不由餘額差推算報酬。</p><p class="income-note">獲利換算＝交易淨損益 × 分潤 × 匯率。自有本金分潤為 100%，虧損會抵扣獲利；不需登記提領或入帳。此處為交易獲利進度，未扣提領費用與個人稅款，並非實際入帳金額。</p>
      <div class="income-table"><table><thead><tr><th>月份</th><th>交易淨利 (${escape(s.currency)})</th><th>固定本金月報酬</th><th>淨獲利換算 (NTD)</th></tr></thead><tbody>${r.months.slice().reverse().map(m=>`<tr><td>${m.key}</td><td>${money(m.profit)}</td><td>${pct(m.rate)}</td><td>${money(r.payout(m.profit))}</td></tr>`).join('') || '<tr><td colspan="4">尚無完整月份；有本月交易時，已自動帶入本月至今績效試算。</td></tr>'}</tbody></table></div></div>`;
    const form = document.getElementById('incomeGoalForm');
    host.insertBefore(host.querySelector('.income-cards'), form);
    host.insertBefore(host.querySelector('.income-summary'), form);
    form.elements.manual.disabled = s.mode === 'auto';
    form.elements.share.disabled = s.kind === 'own';
    form.elements.fx.readOnly = s.currency === 'NTD';
    form.addEventListener('change', e => {
      if (e.target.name==='account') { save(); return; }
      if (e.target.name==='mode') form.elements.manual.disabled=form.elements.mode.value==='auto';
      if (e.target.name==='kind') form.elements.share.disabled=form.elements.kind.value==='own';
      if (e.target.name==='currency') { form.elements.fx.readOnly=form.elements.currency.value==='NTD'; if(form.elements.fx.readOnly)form.elements.fx.value='1'; }
    });
    function save(forceAuto=false) {
      if (!form.reportValidity()) return;
      const next={...s};
      for(const [name,value] of new FormData(form)) next[name]=['account','currency','kind','period','mode'].includes(name)?value:Number(value);
      if(forceAuto) next.mode='auto';
      if(next.currency==='NTD')next.fx=1;
      try { localStorage.setItem(KEY,JSON.stringify({...read(),[batch]:next})); render(context.items,context.batch,context.initial,context.label); document.getElementById('incomeSaveStatus').textContent='已儲存，進度已更新'; }
      catch { document.getElementById('incomeSaveStatus').textContent='儲存失敗：瀏覽器空間不足或禁止儲存。'; }
    }
    form.addEventListener('submit',e=>{e.preventDefault();save();});
    document.getElementById('incomeUseActual').addEventListener('click',()=>save(true));
  }
  root.renderIncomeGoals=render;
})(typeof window === 'undefined' ? globalThis : window);
