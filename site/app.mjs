import {icon,questionText} from './icons.mjs';
import {selectOption,newTest,testResult,clockText,orderSeed,orderedOptions,shownLetters,pointsPerQuestion,testCounts,testLength} from './model.mjs';
import {native,restore,save,flush} from './store.mjs';

const $=id=>document.getElementById(id);
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
const modes={practice:'练习模式',test:'测试模式',wrong:'错题本',credits:'鸣谢'};
const kinds={single:'单选题',multi:'多选题'};
const themes={system:['monitor','跟随系统'],light:['sun','浅色'],dark:['moon','深色']};
const scheme=matchMedia('(prefers-color-scheme: dark)');
let questions=[],byId=new Map(),records={},prefs={mode:'practice',kind:'all',theme:'system',place:{},
  shuffle:false,practiceSetup:true,wrongSetup:true,testSetup:false,practiceSeed:0,practiceStarted:false},exam=null;
let review={ids:[],at:0,attempts:{},elapsed:0},practiceMs=0,tickStart=null,booted=false,busy=false;
const page=()=>$('desk');
const announce=msg=>{$('announce').textContent=msg;};
const setPrefs=()=>save('prefs',prefs);
const saveRecord=id=>save('q_'+id,records[id]);
const saveReview=()=>save('review',review);
const saveExam=()=>save('exam',exam);
const record=id=>records[id]||(records[id]={picked:'',graded:false,wrong:false});
const mistakes=()=>questions.filter(q=>records[q.id]?.wrong).map(q=>q.id);
const wrongNumber=()=>mistakes().length;
const clipped=(n,len)=>Math.max(0,Math.min(Number.isInteger(n)?n:0,len-1));
const settingUp=()=>prefs.mode==='practice'?prefs.practiceSetup:prefs.mode==='wrong'?prefs.wrongSetup:!exam||prefs.testSetup;
const currentSeed=()=>prefs.mode==='practice'?prefs.practiceSeed:prefs.mode==='wrong'?review.seed:exam.seed;

function panelIds(){
  if(prefs.mode==='test')return exam?.ids||[];
  if(prefs.mode==='wrong')return review.ids;
  return questions.filter(q=>prefs.kind==='all'||q.kind===prefs.kind).map(q=>q.id);
}
function currentIndex(ids=panelIds()){
  const i=prefs.mode==='test'?exam?.at:prefs.mode==='wrong'?review.at:ids.indexOf(prefs.place[prefs.kind]);
  return clipped(i,ids.length);
}
function entry(id){
  if(prefs.mode==='test')return {picked:exam?.picks[id]||'',graded:!!exam?.finished};
  if(prefs.mode==='wrong')return review.attempts[id]||{picked:'',graded:false};
  return record(id);
}
function status(id){
  const e=entry(id);
  if(e.graded)return e.picked===byId.get(id).answer?'right':'wrong';
  if(!e.picked)return 'empty';
  return prefs.mode==='test'?'answered':'draft';
}
function timerActive(){
  return booted&&!document.hidden&&!settingUp()&&(prefs.mode==='practice'||(prefs.mode==='wrong'&&review.ids.length));
}
function stopClock(){
  if(tickStart===null)return;
  const delta=Math.max(0,performance.now()-tickStart);tickStart=null;
  if(prefs.mode==='wrong'){review.elapsed+=delta;saveReview();}
  else if(prefs.mode==='practice'){practiceMs+=delta;save('practice_time',practiceMs);}
}
function startClock(){if(tickStart===null&&timerActive())tickStart=performance.now();}
function elapsed(){
  if(settingUp()&&prefs.mode!=='practice')return 0;
  if(prefs.mode==='test')return exam?Math.max(0,(exam.finished||Date.now())-exam.started):0;
  return (prefs.mode==='wrong'?review.elapsed:practiceMs)+(tickStart===null?0:Math.max(0,performance.now()-tickStart));
}
function clockUpdate(){const out=$('clock');if(out)out.textContent=clockText(elapsed());}
function theme(value){
  prefs.theme=Object.hasOwn(themes,value)?value:'system';
  document.documentElement.dataset.appearance=prefs.theme==='system'?(scheme.matches?'dark':'light'):prefs.theme;
  const [glyph,name]=themes[prefs.theme];
  $('theme').firstElementChild.replaceWith(icon(glyph));$('theme-caption').textContent=name;
  for(const b of $('theme-menu').children)b.setAttribute('aria-checked',String(b.dataset.theme===prefs.theme));
}
function button(label,glyph,action,style='ghost',disabled=false){
  const b=el('button','pill '+style);b.type='button';b.dataset.action=action;
  if(glyph)b.append(icon(glyph));b.append(label);b.disabled=disabled;return b;
}
function go(i){
  if(settingUp())return;
  const ids=panelIds();if(!ids.length)return;
  i=clipped(i,ids.length);
  if(prefs.mode==='test'){exam.at=i;if(exam.finished)exam.view='review';saveExam();}
  else if(prefs.mode==='wrong'){review.at=i;saveReview();}
  else{prefs.place[prefs.kind]=ids[i];setPrefs();}
  render();page().scrollIntoView({block:'nearest'});const heading=page().querySelector('.question-title');heading?.focus({preventScroll:true});
}
function beginReview(){
  review={ids:mistakes(),at:0,attempts:{},elapsed:0,seed:orderSeed(prefs.shuffle)};saveReview();
}
function changeMode(mode){
  if(!Object.hasOwn(modes,mode)||prefs.mode===mode)return;
  stopClock();
  if(mode==='credits')prefs.returnMode=prefs.mode;
  if(mode==='wrong')prefs.wrongSetup=true;
  prefs.mode=mode;setPrefs();render();startClock();$('main').scrollTop=0;
}
function pick(letter){
  const ids=panelIds(),q=byId.get(ids[currentIndex(ids)]);if(!q)return;
  const e=entry(q.id);if(e.graded)return;
  const next=selectOption(q,e.picked,letter);
  if(prefs.mode==='test'){exam.picks[q.id]=next;saveExam();}
  else{
    if(prefs.mode==='wrong'){review.attempts[q.id]={picked:next,graded:false};saveReview();}
    else{record(q.id).picked=next;saveRecord(q.id);}
    if(q.kind==='single'){grade(q);return;}
  }
  render();
  page().querySelector('[data-letter="'+letter+'"]')?.focus({preventScroll:true});
}
function grade(q){
  if(!q||prefs.mode==='test')return;
  const e=entry(q.id),r=record(q.id);
  if(!e.picked||e.graded)return;
  e.graded=true;r.wrong=e.picked!==q.answer;
  if(prefs.mode==='wrong'){r.picked=e.picked;r.graded=true;saveReview();}
  saveRecord(q.id);render();
  announce((r.wrong?'回答错误，正确答案 ':'回答正确，答案 ')+shownLetters(orderedOptions(q,currentSeed()),q.answer));
}
function retry(){
  const id=panelIds()[currentIndex()];if(!id||prefs.mode==='test')return;
  if(prefs.mode==='wrong'){review.attempts[id]={picked:'',graded:false};saveReview();}
  else{const r=record(id);r.graded=false;r.picked='';saveRecord(id);}
  render();
}
function finish(){
  if(!exam||exam.finished||!exam.ids.every(id=>exam.picks[id]))return;
  exam.finished=Math.max(Date.now(),exam.started);exam.view='summary';
  for(const id of exam.ids){
    if(exam.picks[id]!==byId.get(id).answer){record(id).wrong=true;saveRecord(id);}
  }
  saveExam();render();$('main').scrollTop=0;announce('已交卷，得分 '+testResult(exam,byId).score+' 分');
}
function shuffleOption(){
  const line=el('button','shuffle-option');line.type='button';line.dataset.action='set-shuffle';line.setAttribute('role','switch');line.setAttribute('aria-checked',String(prefs.shuffle));
  const label=el('span','toggle-choice');label.append(icon('swap'),el('strong','','打乱选项顺序'));
  const sw=el('span','switch-track');sw.setAttribute('aria-hidden','true');sw.append(el('span'));line.append(label,sw);return line;
}
function practiceForm(wrong){
  const box=el('article','card welcome'),sym=el('div','mode-symbol');sym.append(icon(wrong?'bookmark':'book'));
  box.append(sym,el('h2','',wrong?'错题重练':'开始练习'),el('p','',wrong?'当前有 '+wrongNumber()+' 道错题。答对一题，错题本就少一题。':'单选点选后立即判题，多选选齐后确认答案。'));
  if(!wrong){
    const group=el('div','setup-kinds');group.setAttribute('role','group');group.setAttribute('aria-label','练习题型');
    for(const [key,name,n] of [['all','全部题目',100],['single','单选题',70],['multi','多选题',30]]){
      const b=el('button','type-choice');b.type='button';b.dataset.kind=key;b.setAttribute('aria-pressed',String(prefs.kind===key));b.append(el('strong','',name),el('span','',n+' 题'));group.append(b);
    }
    box.append(group);
  }
  box.append(shuffleOption(),button(wrong?'开始重练':prefs.practiceStarted?'继续练习':'开始答题','next',wrong?'start-wrong':'start-practice','primary'));return box;
}
function testForm(){
  const box=el('article','card welcome'),sym=el('div','mode-symbol');sym.append(icon('paper'));
  box.append(sym,el('h2','','随机组卷'),el('p','','从本期题库抽取 20 道题。作答期间可以改选，交卷后查看得分和逐题答案。'));
  const list=el('div','test-rules');
  for(const [glyph,label,value] of [['list','单选题',testCounts.single+' 道'],['multiple','多选题',testCounts.multi+' 道'],['award','试卷满分',testLength*pointsPerQuestion+' 分']]){
    const item=el('div','test-rule');item.append(icon(glyph),el('small','',label),el('strong','',value));list.append(item);
  }
  const actions=el('div','action-group');actions.append(button('开始测试','next','start-test','primary'));
  if(exam?.finished)actions.append(button('上次成绩','award','summary'));
  box.append(list,el('p','meta-note','每题 '+pointsPerQuestion+' 分。多选题须全部选对。'),shuffleOption(),actions);return box;
}
function summary(){
  const box=el('article','card summary'),r=testResult(exam,byId),score=el('div','score-large');
  score.append(el('strong','',String(r.score)),'/ '+r.max+' 分');
  box.append(el('div','badge','已交卷'),el('h2','','测试成绩'),score);
  const stats=el('div','totals');
  for(const [label,n] of [['答对',r.right+' 题'],['答错',r.wrong+' 题'],['答题用时',clockText(exam.finished-exam.started)]]){
    const block=el('div','result-stat');block.append(el('span','',label),el('strong','',n));stats.append(block);
  }
  const act=el('div','action-group');act.append(button('逐题查看','book','inspect','primary'),button('再测一套','swap','setup-test'));
  box.append(stats,act);if(r.wrong)box.append(el('p','meta-note','本次答错的题已收进错题本。'));return box;
}
function blankWrong(){
  const box=el('article','card welcome'),sym=el('div','mode-symbol');sym.append(icon('bookmark'));
  box.append(sym,el('h2','','错题本是空的'),el('p','','练习或测试中答错的题会收在这里，重练答对后就能移出。'),button('去练习','book','to-practice','primary'));return box;
}
function credits(){
  const box=el('article','card credits'),list=el('dl','credits-list');
  for(const [role,name,glyph] of [['开发制作','reshi','device'],['题库提供者','Miraitowa','book']]){
    const item=el('div'),dt=el('dt'),dd=el('dd');dt.append(icon(glyph),role);
    if(name==='Miraitowa'){const avatar=el('img','avatar');avatar.src='miraitowa.jpg';avatar.width=44;avatar.height=44;avatar.alt='';dd.append(avatar);}
    dd.append(name);item.append(dt,dd);list.append(item);
  }
  box.append(list,el('p','meta-note','红课题本 1.0.0　/　MIT License'),button('返回刷题','left','return-reading'));return box;
}
function questionCard(q,ids,at){
  const e=entry(q.id),isTest=prefs.mode==='test',correct=e.picked===q.answer;
  const box=el('article','card question'),meta=el('div','question-meta'),index=el('div','index');
  const number=isTest?at+1:q.number;
  const total=isTest?ids.length:(q.kind==='single'?70:30);
  index.append('第',el('strong','',String(number).padStart(2,'0')),icon('slash'),String(total)+' 题');
  meta.append(el('span','badge '+q.kind,kinds[q.kind]),index);
  const title=el('h2','question-title');title.tabIndex=-1;title.append(questionText(q.stem));
  box.append(meta,title);
  const opts=el('div','options');opts.setAttribute('role','group');opts.setAttribute('aria-label',kinds[q.kind]);
  const ordered=orderedOptions(q,currentSeed());
  for(const [i,o] of ordered.entries()){
    const letter=String.fromCharCode(65+i);
    const selected=e.picked.includes(o.key),answer=e.graded&&q.answer.includes(o.key),bad=e.graded&&selected&&!answer;
    const b=el('button','option '+q.kind+(selected?' selected':'')+(answer?' correct':'')+(bad?' incorrect':''));
    b.type='button';b.dataset.letter=o.key;b.setAttribute('aria-pressed',String(selected));b.disabled=!!e.graded;
    const copy=el('span','copy');copy.append(questionText(o.text));
    b.append(el('span','letter',letter),copy);
    if(answer||bad){b.append(icon(answer?'correct':'mistake','result-icon'));b.setAttribute('aria-label',letter+' '+o.text+'，'+(answer?'正确选项':'误选'));}
    opts.append(b);
  }
  box.append(opts);
  if(e.graded){
    const fb=el('div','feedback'+(correct?'':' wrong')),head=el('div','feedback-head');
    head.append(icon(correct?'correct':'mistake'),correct?'回答正确':'回答错误');
    if(isTest)head.append(el('span','item-points',(correct?pointsPerQuestion:0)+' / '+pointsPerQuestion+' 分'));
    const spread=key=>shownLetters(ordered,key);
    const detail=correct?'正确答案 '+spread(q.answer):'你的选择 '+spread(e.picked)+'　正确答案 '+spread(q.answer);
    fb.append(head,el('p','',detail));box.append(fb);
  }else if(!isTest&&q.kind==='multi')box.append(el('p','meta-note','选齐后点「确认答案」。'));
  const actions=el('div','panel-actions'),next=el('div','action-group');
  actions.append(button('上一题','left','prev','ghost',at===0));
  if(isTest&&exam.finished)next.append(button('成绩','award','summary'));
  if(!isTest&&e.graded)next.append(button('重做','replay','retry'));
  if(!isTest&&q.kind==='multi'&&!e.graded)next.append(button('确认答案','right','grade','primary',!e.picked));
  if(at<ids.length-1)next.append(button('下一题','next','next',!isTest&&q.kind==='multi'&&!e.graded?'ghost':'primary'));
  if(isTest&&!exam.finished){
    const filled=exam.ids.every(id=>exam.picks[id]);
    if(at===ids.length-1||filled)next.append(button('交卷','send','finish','primary',!filled));
    if(at===ids.length-1&&!filled)box.append(el('p','meta-note','答题卡中还有空题，点题号可返回补答。'));
  }
  if(!isTest&&at===ids.length-1&&prefs.mode==='wrong'&&e.graded)next.append(button('更新错题本','bookmark','refresh-wrong','primary'));
  actions.append(next);box.append(actions);return box;
}
function renderRight(ids,at){
  const isTest=prefs.mode==='test',testDone=isTest&&!!exam?.finished;
  const setup=settingUp(),fresh=setup&&prefs.mode!=='practice';
  const done=fresh?0:ids.filter(id=>isTest?!!exam?.picks[id]:entry(id).graded).length;
  const total=fresh?(isTest?testLength:wrongNumber()):ids.length;
  const pair=(glyph,text,out)=>{const row=el('div','stat-pair'),label=el('span');label.append(icon(glyph),text);row.append(label,out);return row;};
  const progress=el('output','',''+done+' / '+total),clock=el('output');clock.id='clock';clock.textContent=clockText(elapsed());
  const meter=el('div','bar'),fill=el('span');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label','答题进度');meter.setAttribute('aria-valuenow',String(done));meter.setAttribute('aria-valuemax',String(total||1));meter.setAttribute('aria-valuemin','0');fill.style.width=(total?100*done/total:0)+'%';meter.append(fill);
  $('progress').replaceChildren(pair('progress','答题进度',progress),meter,pair('clock','答题时间',clock));
  const holder=$('map');holder.replaceChildren();
  if(setup||!ids.length){holder.append(el('p','meta-note',total?'开始作答后，可在这里点题号跳转。':'当前没有待练的错题。'));return;}
  const legend=el('div','legend');
  const entries=isTest&&!testDone?[['current','当前'],['marked','已答'],['empty','未答']]:[['current','当前'],['correct','答对'],['mistake','答错'],['empty','未答']];
  for(const [glyph,text] of entries){const l=el('span');l.append(icon(glyph,glyph==='correct'?'good-mark':glyph==='mistake'?'bad-mark':''),text);legend.append(l);}
  holder.append(legend);
  for(const kind of ['single','multi']){
    const group=ids.map((id,i)=>[byId.get(id),i]).filter(([q])=>q.kind===kind);if(!group.length)continue;
    holder.append(el('h3','',kinds[kind]));const grid=el('div','grid');
    for(const [q,i] of group){
      const num=isTest?i+1:q.number,s=status(q.id),b=el('button','',String(num).padStart(2,'0'));
      b.type='button';b.dataset.goto=String(i);b.dataset.status=s;
      if(i===at&&(!isTest||exam.view!=='summary'))b.setAttribute('aria-current','true');
      b.setAttribute('aria-label',kinds[kind]+'第 '+num+' 题，'+({right:'答对',wrong:'答错',answered:'已答',draft:'待确认',empty:'未答'}[s]));
      grid.append(b);
    }
    holder.append(grid);
  }
}
function render(){
  $('mode-title').textContent=modes[prefs.mode];$('wrong-count').textContent=String(wrongNumber());
  for(const b of document.querySelectorAll('[data-mode]')){if(prefs.mode===b.dataset.mode)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  const onCredits=prefs.mode==='credits';$('side').hidden=onCredits;page().parentElement.classList.toggle('solo',onCredits);
  if(onCredits){$('filters').hidden=true;$('setup-button').hidden=true;page().replaceChildren(credits());return;}
  $('filters').hidden=prefs.mode!=='practice'||settingUp();for(const b of document.querySelectorAll('[data-kind]'))b.setAttribute('aria-pressed',String(b.dataset.kind===prefs.kind));
  $('setup-button').hidden=settingUp()||prefs.mode==='test';
  const ids=panelIds(),at=currentIndex(ids);
  const card=settingUp()?(prefs.mode==='test'?testForm():prefs.mode==='wrong'&&!wrongNumber()?blankWrong():practiceForm(prefs.mode==='wrong')):
    prefs.mode==='test'&&exam.finished&&exam.view==='summary'?summary():
    !ids.length?blankWrong():questionCard(byId.get(ids[at]),ids,at);
  page().replaceChildren(card);renderRight(ids,at);
}
async function closeApp(){
  if(busy)return;busy=true;stopClock();
  if(!await flush()){busy=false;startClock();announce('保存失败，请再试一次。');return;}
  await Neutralino.app.exit();
}
async function windowAction(name){
  if(!native)return;
  if(name==='close'){await closeApp();return;}
  if(name==='minimize')await Neutralino.window.minimize();
  if(name==='maximize'){if(await Neutralino.window.isMaximized())await Neutralino.window.unmaximize();else await Neutralino.window.maximize();}
}
function setHandlers(){
  for(const n of document.querySelectorAll('[data-i]'))n.replaceWith(icon(n.dataset.i,n.classList.contains('tiny-icon')?'tiny-icon':''));
  for(const [value,[glyph,name]] of Object.entries(themes)){const b=el('button');b.dataset.theme=value;b.setAttribute('role','menuitemradio');b.append(icon(glyph),name);$('theme-menu').append(b);}
  $('theme').addEventListener('click',()=>{$('theme-menu').hidden=!$('theme-menu').hidden;$('theme').setAttribute('aria-expanded',String(!$('theme-menu').hidden));});
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');
    if(!$('theme-menu').hidden&&b!==$('theme')){$('theme-menu').hidden=true;$('theme').setAttribute('aria-expanded','false');}
    if(!b||b.disabled)return;
    if(b.dataset.theme){theme(b.dataset.theme);setPrefs();return;}
    if(b.dataset.window){void windowAction(b.dataset.window);return;}
    if(!booted)return;
    if(b.dataset.mode){changeMode(b.dataset.mode);return;}
    if(b.dataset.kind){prefs.kind=b.dataset.kind;setPrefs();render();return;}
    if(b.dataset.goto!==undefined){go(Number(b.dataset.goto));return;}
    if(b.dataset.letter){pick(b.dataset.letter);return;}
    const ids=panelIds(),at=currentIndex(ids);
    switch(b.dataset.action){
      case 'return-reading':changeMode(prefs.returnMode&&prefs.returnMode!=='credits'?prefs.returnMode:'practice');break;
      case 'prev':go(at-1);break;
      case 'next':go(at+1);break;
      case 'grade':grade(byId.get(ids[at]));break;
      case 'retry':retry();break;
      case 'to-practice':changeMode('practice');break;
      case 'setup':stopClock();if(prefs.mode==='practice')prefs.practiceSetup=true;else prefs.wrongSetup=true;setPrefs();render();break;
      case 'set-shuffle':prefs.shuffle=!prefs.shuffle;setPrefs();render();page().querySelector('[role=switch]')?.focus({preventScroll:true});break;
      case 'start-practice':
        if(!prefs.practiceStarted||!!prefs.practiceSeed!==prefs.shuffle)prefs.practiceSeed=orderSeed(prefs.shuffle);
        prefs.practiceSetup=false;prefs.practiceStarted=true;setPrefs();render();startClock();break;
      case 'start-wrong':beginReview();prefs.wrongSetup=false;setPrefs();render();startClock();break;
      case 'setup-test':prefs.testSetup=true;setPrefs();render();break;
      case 'start-test':if(!exam||exam.finished){exam=newTest(questions,Date.now(),orderSeed(prefs.shuffle));prefs.testSetup=false;saveExam();setPrefs();render();}break;
      case 'finish':finish();break;
      case 'inspect':go(0);break;
      case 'summary':prefs.testSetup=false;exam.view='summary';saveExam();setPrefs();render();break;
      case 'refresh-wrong':stopClock();prefs.wrongSetup=true;setPrefs();render();break;
    }
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('theme-menu').hidden){$('theme-menu').hidden=true;$('theme').setAttribute('aria-expanded','false');$('theme').focus();}});
  scheme.addEventListener('change',()=>theme(prefs.theme));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopClock();else startClock();});
  window.addEventListener('pagehide',stopClock);
  if(native){
    $('window-buttons').hidden=false;
    $('drag').addEventListener('mousedown',e=>{if(e.button===0&&e.detail===1)void Neutralino.window.beginDrag(e.screenX,e.screenY);});
    $('drag').addEventListener('dblclick',()=>void windowAction('maximize'));
    Neutralino.events.on('windowClose',closeApp);
  }
}
async function init(){
  setHandlers();
  const [res,data]=await Promise.all([fetch('bank.json'),restore()]);
  if(!res.ok)throw Error('题库加载失败');
  questions=(await res.json()).questions;byId=new Map(questions.map(q=>[q.id,q]));
  if(data.prefs){
    if(Object.hasOwn(modes,data.prefs.mode))prefs.mode=data.prefs.mode;
    if(['all','single','multi'].includes(data.prefs.kind))prefs.kind=data.prefs.kind;
    prefs.place=data.prefs.place||{};prefs.theme=data.prefs.theme;if(['practice','wrong','test'].includes(data.prefs.returnMode))prefs.returnMode=data.prefs.returnMode;
    for(const key of ['shuffle','practiceSetup','wrongSetup','testSetup','practiceStarted'])if(typeof data.prefs[key]==='boolean')prefs[key]=data.prefs[key];
    prefs.practiceSeed=data.prefs.practiceSeed>>>0;
  }
  for(const q of questions){const r=data['q_'+q.id];if(r&&typeof r.picked==='string')records[q.id]=r;}
  if(Array.isArray(data.exam?.ids)&&data.exam.ids.length===20&&data.exam.ids.every(id=>byId.has(id))&&data.exam.picks)exam=data.exam;
  if(Array.isArray(data.review?.ids)&&data.review.attempts&&data.review.ids.every(id=>byId.has(id)))review=data.review;
  else if(prefs.mode==='wrong')beginReview();
  practiceMs=Number.isFinite(data.practice_time)?data.practice_time:0;
  theme(prefs.theme);booted=true;render();startClock();
  setInterval(clockUpdate,1000);
  setInterval(()=>{if(tickStart!==null){stopClock();startClock();}},10000);
}
init().catch(error=>{console.error(error);page().replaceChildren(el('h2','','题本未能打开'),el('p','','请重新打开程序以载入题库和本机记录。'));});
