import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../shared/partial-exit.js',import.meta.url),'utf8');
const storage=new Map();
const sandbox={structuredClone,CustomEvent:class{},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},window:{addEventListener(){},dispatchEvent(){}},document:{readyState:'loading',addEventListener(){},querySelector(){return null}}};
sandbox.window.window=sandbox.window;
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const api=sandbox.window.TradingNotePartialExit;
assert.equal(api.realizedR(3),2.5);
assert.equal(api.realizedR(2),.4);
assert.equal(api.realizedR(1),.2);
assert.equal(api.realizedR(-1),-1);
assert.equal(api.realizedR(0),0);
console.log('Partial exit tests passed');
