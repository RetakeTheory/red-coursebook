export const pointsPerQuestion=3;
export const testCounts={single:14,multi:6};
export const testLength=testCounts.single+testCounts.multi;
export function selectOption(question,picked,letter){
  if(!question.options.some(o=>o.key===letter))return picked;
  if(question.kind==='single')return letter;
  const keys=new Set(picked);
  if(keys.has(letter))keys.delete(letter);else keys.add(letter);
  return [...keys].sort().join('');
}
function sample(items,count){
  const a=[...items];
  if(a.length<count)throw Error('题库数量不足');
  for(let i=0;i<count;i++){
    const j=i+Math.floor(Math.random()*(a.length-i));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a.slice(0,count);
}
export function orderSeed(shuffle){
  if(!shuffle)return 0;
  return crypto.getRandomValues(new Uint32Array(1))[0]||1;
}
// A question keeps its own permutation for the lifetime of the saved session.
export function orderedOptions(question,seed){
  const original=question.options;
  if(!seed||original.length<2)return original;
  let state=seed>>>0;
  for(const c of question.id)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
  const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const a=[...original];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  if(a.every((opt,i)=>opt===original[i]))[a[0],a[1]]=[a[1],a[0]];
  return a;
}
export function shownLetters(options,canonical){
  return options.flatMap((o,i)=>canonical.includes(o.key)?[String.fromCharCode(65+i)]:[]).join('、');
}
export function newTest(bank,now=Date.now(),seed=0,format='random'){
  const pool=type=>bank.filter(q=>q.kind===type).map(q=>q.id);
  const ids=format==='full'?bank.map(q=>q.id):[...sample(pool('single'),testCounts.single),...sample(pool('multi'),testCounts.multi)];
  return {format,ids,picks:{},at:0,started:now,finished:0,view:'answer',seed};
}
export function testResult(exam,byId){
  const right=exam.ids.filter(id=>exam.picks[id]===byId.get(id).answer).length;
  return {right,wrong:exam.ids.length-right,score:pointsPerQuestion*right,max:pointsPerQuestion*exam.ids.length};
}
export function clockText(ms){
  const s=Math.max(0,Math.floor(ms/1000)),pad=n=>String(n).padStart(2,'0');
  return s>=3600?pad(Math.floor(s/3600))+':'+pad(Math.floor(s/60)%60)+':'+pad(s%60):pad(Math.floor(s/60))+':'+pad(s%60);
}
