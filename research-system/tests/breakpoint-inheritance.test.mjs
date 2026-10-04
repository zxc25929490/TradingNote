import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

for (const path of ['../app.js','../../tradingnote-site/public/research-system/app.js']) {
  const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');
  const start=source.indexOf('function copyResearchTrades(');
  const end=source.indexOf('function deleteActiveBreakpoint(',start);
  const code=source.slice(start,end);
  test(`${path}: inherited trades are isolated raw snapshots with unique IDs`,()=>{
    const ctx=vm.createContext({crypto:{randomUUID}});
    vm.runInContext(code,ctx);
    const original=[{id:'old',batchId:'a',r:4,notes:'original',strategyVersionId:'v1',mistakes:['early'],meta:{image:'reference'}},{id:'other',batchId:'b',r:1}];
    const first=ctx.copyResearchTrades(original,'a','c');
    const second=ctx.copyResearchTrades(original,'a','d');
    assert.equal(first.length,1);
    assert.equal(first[0].r,4);
    assert.equal(first[0].strategyVersionId,'v1');
    assert.equal(first[0].sourceTradeId,'old');
    assert.equal(first[0].batchId,'c');
    assert.notEqual(first[0].id,second[0].id);
    first[0].mistakes.push('new');first[0].meta.image='changed';first[0].r=0;
    assert.equal(original[0].mistakes.length,1);
    assert.equal(original[0].meta.image,'reference');
    assert.equal(original[0].r,4);
  });
  test(`${path}: cancel does not mutate; successful inheritance switches to new batch`,()=>{
    const ctx=vm.createContext({crypto:{randomUUID},batches:[{id:'a',name:'source'}],activeBatch:'a',allTrades:[{id:'old',batchId:'a',r:4}],prompt:()=>null,alert:()=>{},closeResearchMenus:()=>{},syncBatch:()=>{},render:()=>{},animateBatchControl:()=>{}});
    vm.runInContext(code,ctx);ctx.inheritResearchBreakpoint();
    assert.equal(ctx.batches.length,1);assert.equal(ctx.allTrades.length,1);
    ctx.prompt=()=> 'new';ctx.inheritResearchBreakpoint();
    assert.equal(ctx.batches.length,2);assert.equal(ctx.allTrades.length,2);
    assert.equal(ctx.batches[1].inheritedFrom,'a');
    assert.equal(ctx.activeBatch,ctx.batches[1].id);
    assert.equal(ctx.allTrades[1].batchId,ctx.activeBatch);
  });
}
