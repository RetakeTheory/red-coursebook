import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newTest,orderSeed,orderedOptions,shownLetters,selectOption,testResult} from '../site/model.mjs';
const bank=JSON.parse(await readFile(new URL('../site/bank.json',import.meta.url),'utf8')).questions;
const byId=new Map(bank.map(q=>[q.id,q]));
test('All original positions, options and keys are present',()=>{
  assert.equal(byId.size,100);
  for(const [kind,count,keys] of [['single',70,'ABCD'],['multi',30,'ABCDE']]){
    const questions=bank.filter(q=>q.kind===kind);
    assert.deepEqual(questions.map(q=>q.number),Array.from({length:count},(_,i)=>i+1));
    for(const q of questions){assert.equal(q.options.map(o=>o.key).join(''),keys);assert.ok(q.stem.includes('（　　）'));assert.ok(!/[（(]\s*[A-E][A-E\s]*[）)]/.test(q.stem));
      assert.ok(q.answer.length&&(kind==='single')===(q.answer.length===1));assert.ok([...q.answer].every(k=>keys.includes(k)));}
  }
});
test('A presentation order never changes what an answer means',()=>{
  for(const q of bank){
    const seed=orderSeed(true),opts=orderedOptions(q,seed);
    assert.deepEqual(orderedOptions(q,0),q.options);
    assert.notDeepEqual(opts,q.options);assert.deepEqual(orderedOptions(q,seed),opts);
    const displayed=shownLetters(opts,q.answer).split('、');
    assert.equal(displayed.map(l=>opts[l.charCodeAt(0)-65].key).sort().join(''),q.answer);
  }
});
test('Each exam has fourteen different single-choice questions and six different multiple-choice questions',()=>{
  for(let i=0;i<60;i++){
    const e=newTest(bank,1000,17);
    assert.equal(new Set(e.ids).size,20);assert.equal(e.ids.filter(id=>byId.get(id).kind==='single').length,14);
    for(const id of e.ids)e.picks[id]=byId.get(id).answer;
    assert.deepEqual(testResult(e,byId),{score:60,max:60,wrong:0,right:20});
    const multi=byId.get(e.ids[14]);e.picks[multi.id]=multi.answer.slice(1);
    assert.deepEqual(testResult(e,byId),{score:57,max:60,wrong:1,right:19});
  }
  assert.equal(selectOption(bank[0],'A','B'),'B');assert.equal(selectOption(bank[70],'AC','A'),'C');
});
