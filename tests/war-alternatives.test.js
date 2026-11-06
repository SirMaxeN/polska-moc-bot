import test from 'node:test';
import assert from 'node:assert/strict';
import {distributeAlternatives} from '../src/domain/WarAlternatives.js';
test('two alternatives are globally spread rather than giving everyone the strongest two',()=>{
 const assignments=Array.from({length:12},(_,i)=>({name:`A${i}`,main:`E${i}`,alternatives:[]}));
 const candidates=assignments.map(()=>Array.from({length:12},(_,j)=>({name:`E${j}`,quality:1-j/100})));
 const plan=distributeAlternatives(assignments,candidates),uses=new Map();
 plan.forEach((p,i)=>{assert.equal(p.main,assignments[i].main);assert.equal(p.alternatives.length,2);assert.equal(new Set(p.alternatives).size,2);assert.ok(!p.alternatives.includes(p.main));p.alternatives.forEach(x=>uses.set(x,(uses.get(x)??0)+1));});
 assert.equal(uses.size,12);assert.ok(Math.max(...uses.values())-Math.min(...uses.values())<=1);
});
test('scarce eligibility is respected and does not create impossible alternatives for diversity',()=>{
 const a=[{name:'A',main:'X'},{name:'B',main:'X'},{name:'C',main:'Z'}];
 const c=[[{name:'X',quality:1},{name:'Y',quality:.7}],[{name:'X',quality:1},{name:'Y',quality:.8}],[]];
 const p=distributeAlternatives(a,c);assert.deepEqual(p.map(x=>x.alternatives),[['Y'],['Y'],[]]);
});
