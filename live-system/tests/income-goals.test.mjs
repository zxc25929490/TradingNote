import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../income-goals.js';
const { calculate } = globalThis.IncomeGoals;
const settings = { basis:10000, capital:20000, target:30000, fx:30, kind:'prop', share:80, withdraw:50, fee:100, period:'3', mode:'auto', manual:2 };
const now = new Date(2026,8,18);
test('full months include zero months, exclude current and initial partial month',()=>{
  const r=calculate([{date:'2026-05-15',profit:9000},{date:'2026-06-01',profit:600},{date:'2026-08-10',profit:300},{date:'2026-09-10',profit:100}],settings,now);
  assert.deepEqual(r.months.map(m=>m.key),['2026-06','2026-07','2026-08']);
  assert.equal(r.historical,.03);
  assert.equal(r.required,30000/.72);
  assert.equal(r.needed,30000/480000);
  assert.equal(r.currentPayout,2400);
  assert.equal(r.projected,14400);
});
test('close date determines realized month; ignore cash flows, missing P/L, future and missed trades',()=>{
  const r=calculate([{date:'2026-06-01',closeTime:'2026.07.02 12:00:00',profit:100},{date:'2026-07-01',profit:999,recordType:'deposit'},{date:'2026-07-01',profit:999,recordType:'missed_opportunity'},{date:'2026-07-01',profit:null},{date:'2026-09-19',profit:999}],settings,now);
  assert.equal(r.rows.length,1);
  assert.equal(r.rows[0].date,'2026-07-02');
});
test('insufficient history and nonpositive return do not invent required capital',()=>{
  assert.equal(calculate([],settings,now).required,null);
  assert.equal(calculate([{date:'2026-09-01',profit:100}],settings,now).historical,null);
  const r=calculate([{date:'2026-06-01',profit:-100}],settings,now);
  assert.equal(r.required,null);
  assert.equal(r.losses,1);
  assert.equal(r.drawdown,.01);
});
test('manual mode works without history; own capital ignores prop share; legacy withdrawal settings are ignored',()=>{
  const r=calculate([],{...settings,mode:'manual',kind:'own'},now);
  assert.equal(r.required,30000/.6);
  assert.equal(r.projected,12000);
  assert.equal(r.historical,null);
  const zero=calculate([],{...settings,mode:'manual',withdraw:0},now);
  assert.equal(zero.required,62500);
  assert.equal(zero.needed,.0625);
  assert.equal(zero.projected,9600);
});
test('current month is calendar based, not latest imported month; first partial month excluded',()=>{
  const r=calculate([{date:'2026-06-15',profit:1000},{date:'2026-07-01',profit:100}],{...settings,period:'all'},now);
  assert.deepEqual(r.months.map(m=>m.key),['2026-07','2026-08']);
  assert.equal(r.currentProfit,0);
  assert.equal(r.current,'2026-09');
});

test('current profits automatically drive progress and provisional capital without withdrawals',()=>{
  const r=calculate([{date:'2026-09-10',profit:100},{date:'2026-09-12',profit:-75}],{...settings,kind:'own',capital:10000,target:100000,fx:32,withdraw:0,fee:99999,receipts:{'2026-09':99999}},now);
  assert.equal(r.currentPayout,800);
  assert.equal(r.historical,null);
  assert.equal(r.provisional,true);
  assert.equal(r.rate,.0025);
  assert.equal(r.required,1250000);
  assert.equal(r.projected,800);
});
test('losses remain negative and cannot produce a required positive capital',()=>{
 const r=calculate([{date:'2026-09-10',profit:-100}],settings,now);
 assert.equal(r.currentPayout,-2400);
 assert.equal(r.required,null);
 assert.equal(r.rate,-.01);
});
