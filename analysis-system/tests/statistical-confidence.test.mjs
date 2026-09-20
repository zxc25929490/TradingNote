import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../statistical-confidence.js',import.meta.url),'utf8');
const context={globalThis:{}};vm.runInNewContext(source,context);
const stats=context.globalThis.TradingNoteStatistics;
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);

const sample=stats.sample([-1,1,2],.2);
close(sample.mean,2/3);close(sample.sd,Math.sqrt(7/3));
assert.equal(sample.n,3);assert.ok(sample.requiredN>3);assert.ok(sample.ci[0]<sample.mean&&sample.ci[1]>sample.mean);
close(stats.tCritical95(1),12.706204736,1e-6);close(stats.tCritical95(9),2.262157163,1e-6);

const insufficient=stats.sample([1],.2);assert.equal(insufficient.sd,null);assert.equal(insufficient.ci,null);
const constant=stats.sample([1,1,1],.2);assert.equal(constant.sd,0);assert.equal(constant.requiredN,2);assert.equal(constant.moe,0);
const same=stats.welch([1,1,1],[1,1,1]);assert.equal(same.p,1);assert.deepEqual(Array.from(same.ci),[0,0]);
const decay=stats.welch([0,0,0,0],[1,1,1,1]);assert.equal(decay.p,0);assert.equal(stats.classify(stats.sample([0,0,0,0]),stats.sample([1,1,1,1]),decay,.2).label,'實盤明顯低於回測');

console.log('Statistical confidence tests passed');
