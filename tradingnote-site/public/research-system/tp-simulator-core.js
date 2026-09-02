(function(root){
  function finite(value){return Number.isFinite(Number(value))}
  function normalizePlan(legs){
    return (Array.isArray(legs)?legs:[]).map(leg=>({target:Number(leg.target),weight:Number(leg.weight)/100})).filter(leg=>finite(leg.target)&&leg.target>0&&finite(leg.weight)&&leg.weight>0).sort((a,b)=>a.target-b.target);
  }
  function metrics(values){
    let total=0,peak=0,maxDrawdown=0,grossProfit=0,grossLoss=0;
    values.forEach(value=>{total+=value;peak=Math.max(peak,total);maxDrawdown=Math.max(maxDrawdown,peak-total);if(value>0)grossProfit+=value;else grossLoss+=Math.abs(value)});
    return{count:values.length,total,expectancy:values.length?total/values.length:0,winRate:values.length?values.filter(value=>value>0).length/values.length*100:0,maxDrawdown,profitFactor:grossLoss?grossProfit/grossLoss:grossProfit?Infinity:0,values};
  }
  function simulatePlan(maximumRs,legs,lossR=1,protectAfterFirst=true){
    const plan=normalizePlan(legs),loss=Math.max(0,Number(lossR)||0),values=(maximumRs||[]).filter(finite).map(raw=>{
      const maximum=Math.max(0,Number(raw));let result=0,hitAny=false;
      plan.forEach(leg=>{if(maximum>=leg.target){result+=leg.target*leg.weight;hitAny=true}else result-=(protectAfterFirst&&hitAny?0:loss)*leg.weight});
      return result;
    });
    return{...metrics(values),plan,weight:plan.reduce((sum,leg)=>sum+leg.weight,0)};
  }
  function targetStats(maximumRs,target,lossR=1){
    const sample=(maximumRs||[]).filter(finite).map(value=>Math.max(0,Number(value))),hits=sample.filter(value=>value>=target).length,hitRate=sample.length?hits/sample.length*100:0,result=simulatePlan(sample,[{target,weight:100}],lossR,false);
    return{target,hits,hitRate,...result};
  }
  function scanTargets(maximumRs,lossR=1,step=.25){
    const sample=(maximumRs||[]).filter(finite).map(value=>Math.max(0,Number(value))),upper=Math.min(10,Math.max(1,Math.ceil(Math.max(0,...sample)*4)/4)),rows=[];
    for(let target=Math.max(.25,step);target<=upper+1e-9;target+=step)rows.push(targetStats(sample,Number(target.toFixed(2)),lossR));
    return rows.sort((a,b)=>b.expectancy-a.expectancy||b.total-a.total);
  }
  root.TradingNoteTpSimulator={normalizePlan,simulatePlan,targetStats,scanTargets};
})(globalThis);
