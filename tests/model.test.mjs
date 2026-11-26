import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newTest,orderSeed,orderedOptions,shownLetters,selectOption,testResult} from '../site/model.mjs';
const bank=JSON.parse(await readFile(new URL('../site/bank.json',import.meta.url),'utf8')).questions;
const byId=new Map(bank.map(q=>[q.id,q]));
const mao=JSON.parse(await readFile(new URL('../site/mao.json',import.meta.url),'utf8'));
test('Mao chapters preserve printed numbering, options and the printed multiple-answer exception',()=>{
  assert.equal(mao.questions.length,340);
  assert.equal(new Set(mao.questions.map(q=>q.id)).size,340);
  assert.deepEqual(mao.chapters.map(c=>c.label),['导论','第一章','第二章','第三章','第四章','第五章','第六章','第七章','第八章']);
  const sizes=[[17,11],[16,17],[21,13],[25,17],[20,18],[22,14],[36,26],[19,17],[21,10]];
  for(const [i,c] of mao.chapters.entries()){
    const group=mao.questions.filter(q=>q.chapter===c.id);
    assert.deepEqual(['single','multi'].map(k=>group.filter(q=>q.kind===k).length),sizes[i]);
    for(const kind of ['single','multi']){
      const printed=group.filter(q=>(q.sourceKind||q.kind)===kind);
      assert.deepEqual(printed.map(q=>q.number),printed.map((_,n)=>n+1));
    }
  }
  for(const q of mao.questions){
    assert.ok(!byId.has(q.id));assert.match(q.stem,/（　　）/);
    assert.doesNotMatch(q.stem,/[（(]\s*[A-EＡ-Ｅ](?:[、,，\s]*[A-EＡ-Ｅ])*\s*[）)]/);
    const keys=q.options.map(o=>o.key).join('');
    assert.match(keys,/^ABCDE?$/);assert.ok(q.options.every(o=>o.text.trim()));
    assert.ok(q.answer.length>0&&[...q.answer].every(k=>keys.includes(k)));assert.equal(q.answer.length===1,q.kind==='single');
  }
  const special=mao.questions.find(q=>q.id==='C01S17');
  assert.deepEqual([special.sourceKind,special.kind,special.answer],['single','multi','ACE']);
});
test('A Mao test draws and scores only its own questions',()=>{
  const lookup=new Map(mao.questions.map(q=>[q.id,q]));
  for(let run=0;run<40;run++){
    const exam=newTest(mao.questions,1000,run+1);
    assert.equal(new Set(exam.ids).size,20);
    assert.equal(exam.ids.filter(id=>lookup.get(id).kind==='single').length,14);
    for(const id of exam.ids){
      const q=lookup.get(id),opts=orderedOptions(q,exam.seed),letters=shownLetters(opts,q.answer).split('、');
      exam.picks[id]=letters.map(l=>opts[l.charCodeAt(0)-65].key).sort().join('');
    }
    assert.deepEqual(testResult(exam,lookup),{right:20,wrong:0,score:60,max:60});
  }
});
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
