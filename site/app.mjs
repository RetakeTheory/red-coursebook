import {icon,questionText} from './icons.mjs';
import {selectOption,newTest,testResult,clockText,orderSeed,orderedOptions,shownLetters,pointsPerQuestion,testCounts,testLength} from './model.mjs';
import {native,restore,save,flush} from './store.mjs';

const $=id=>document.getElementById(id);
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
const modes={practice:'练习模式',test:'测试模式',wrong:'错题本',credits:'鸣谢'};
const kinds={single:'单选题',multi:'多选题'};
const themes={system:['monitor','跟随系统'],light:['sun','浅色'],dark:['moon','深色']};
const scheme=matchMedia('(prefers-color-scheme: dark)');
const bankFiles={xi:'bank.json',mao:'mao.json'},banks=new Map();
const freshPrefs=()=>({mode:'practice',kind:'all',chapter:'all',theme:'system',place:{},
  shuffle:false,practiceSetup:true,wrongSetup:true,testSetup:false,testFormat:'random',practiceSeed:0,practiceStarted:false,practiceEpoch:0});
let bankId='xi',saved={},questions=[],byId=new Map(),chapters=new Map(),records={},prefs=freshPrefs(),exam=null;
let review={ids:[],at:0,attempts:{},elapsed:0},practiceMs=0,tickStart=null,booted=false,busy=false;
const page=()=>$('desk');
const announce=msg=>{$('announce').textContent=msg;};
// The original bank keeps its 1.0.x storage keys so an upgrade resumes existing work.
const bankKey=key=>bankId==='xi'?key:bankId+'_'+key;
const readCourse=key=>saved[bankKey(key)];
function saveCourse(key,value){const name=bankKey(key);saved[name]=value;return save(name,value);}
const setPrefs=()=>saveCourse('prefs',prefs);
const saveLibrary=()=>save('library',{bank:bankId,theme:prefs.theme});
const saveRecord=id=>saveCourse('q_'+id,records[id]);
const saveReview=()=>saveCourse('review',review);
const examKey=()=>prefs.testFormat==='full'?'exam_full':'exam';
const saveExam=()=>saveCourse(examKey(),exam);
function record(id){
  const r=records[id];
  // One preference write resets every practice answer, including older unversioned saves.
  if(!r||(r.practiceEpoch??0)!==prefs.practiceEpoch){
    records[id]={picked:'',graded:false,wrong:!!r?.wrong,practiceEpoch:prefs.practiceEpoch};
  }
  return records[id];
}
const mistakes=()=>questions.filter(q=>records[q.id]?.wrong).map(q=>q.id);
const wrongNumber=()=>mistakes().length;
const clipped=(n,len)=>Math.max(0,Math.min(Number.isInteger(n)?n:0,len-1));
const settingUp=()=>prefs.mode==='practice'?prefs.practiceSetup:prefs.mode==='wrong'?prefs.wrongSetup:!exam||prefs.testSetup;
const currentSeed=()=>prefs.mode==='practice'?prefs.practiceSeed:prefs.mode==='wrong'?review.seed:exam.seed;
const practicePool=()=>prefs.chapter==='all'?questions:questions.filter(q=>q.chapter===prefs.chapter);
const placeKey=()=>prefs.chapter==='all'?prefs.kind:prefs.chapter+'_'+prefs.kind;
const chapterName=c=>c.title?c.label+'　'+c.title:c.label;
function kindCounts(){
  const counts={all:0,single:0,multi:0};
  for(const q of practicePool()){counts.all++;counts[q.kind]++;}
  return counts;
}

function panelIds(){
  if(prefs.mode==='test')return exam?.ids||[];
  if(prefs.mode==='wrong')return review.ids;
  return practicePool().filter(q=>prefs.kind==='all'||q.kind===prefs.kind).map(q=>q.id);
}
function currentIndex(ids=panelIds()){
  const i=prefs.mode==='test'?exam?.at:prefs.mode==='wrong'?review.at:ids.indexOf(prefs.place[placeKey()]);
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
  else if(prefs.mode==='practice'){
    practiceMs+=delta;saveCourse('practice_time',{epoch:prefs.practiceEpoch,ms:practiceMs});
  }
}
function startClock(){if(tickStart===null&&timerActive())tickStart=performance.now();}
function elapsed(){
  if(prefs.mode==='test')return exam&&!(settingUp()&&exam.finished)?Math.max(0,(exam.finished||Date.now())-exam.started):0;
  if(settingUp()&&prefs.mode!=='practice')return 0;
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
  else{prefs.place[placeKey()]=ids[i];setPrefs();}
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
function confirmPracticeReset(){
  const name=bankId==='mao'?'毛概':'习概';
  const dialog=el('dialog','reset-dialog'),heading=el('h2','','重置'+name+'的练习进度？');
  heading.id='reset-heading';dialog.setAttribute('aria-labelledby',heading.id);
  const message=el('p','','本题库所有练习的作答、位置和用时会清零。错题本和测试记录会保留。');
  message.id='reset-detail';dialog.setAttribute('aria-describedby',message.id);
  const actions=el('div','action-group'),cancel=el('button','pill ghost','取消'),confirm=el('button','pill danger','确认重置');
  cancel.type=confirm.type='button';cancel.autofocus=true;
  cancel.addEventListener('click',()=>dialog.close());
  confirm.addEventListener('click',()=>dialog.close('reset'));
  dialog.addEventListener('close',()=>{
    dialog.remove();
    if(dialog.returnValue!=='reset')return;
    prefs.practiceEpoch++;prefs.place={};prefs.practiceStarted=false;prefs.practiceSeed=0;practiceMs=0;
    setPrefs();render();page().querySelector('[data-action=start-practice]')?.focus({preventScroll:true});
    announce(name+'练习进度已重置');
  },{once:true});
  actions.append(cancel,confirm);dialog.append(heading,message,actions);document.body.append(dialog);dialog.showModal();
}
function practiceForm(wrong){
  const box=el('article','card welcome'),sym=el('div','mode-symbol');sym.append(icon(wrong?'bookmark':'book'));
  box.append(sym,el('h2','',wrong?'错题重练':'开始练习'),el('p','',wrong?'当前有 '+wrongNumber()+' 道错题。答对一题，错题本就少一题。':'单选点选后立即判题，多选选齐后确认答案。'));
  if(!wrong){
    if(chapters.size){
      const label=el('label','chapter-field'),control=el('span','chapter-control'),select=el('select');
      select.id='practice-chapter';
      for(const [value,name] of [['all','全部章节'],...[...chapters.values()].map(c=>[c.id,chapterName(c)])]){
        const opt=el('option','',name);opt.value=value;select.append(opt);
      }
      select.value=prefs.chapter;
      control.append(icon('book'),select,icon('down'));
      label.append(el('span','','练习章节'),control);box.append(label);
    }
    const counts=kindCounts();
    const group=el('div','setup-kinds');group.setAttribute('role','group');group.setAttribute('aria-label','练习题型');
    for(const [key,n] of Object.entries(counts)){
      const name=kinds[key]||'全部题目';
      const b=el('button','type-choice');b.type='button';b.dataset.kind=key;b.setAttribute('aria-pressed',String(prefs.kind===key));b.append(el('strong','',name),el('span','',n+' 题'));group.append(b);
    }
    box.append(group);
  }
  const actions=el('div','action-group');
  actions.append(button(wrong?'开始重练':prefs.practiceStarted?'继续练习':'开始答题','next',wrong?'start-wrong':'start-practice','primary'));
  if(!wrong){
    const reset=button('重置练习进度','replay','reset-practice');
    reset.setAttribute('aria-haspopup','dialog');actions.append(reset);
  }
  box.append(shuffleOption(),actions);return box;
}
function testForm(){
  const box=el('article','card welcome'),sym=el('div','mode-symbol');sym.append(icon('paper'));
  const mao=bankId==='mao',full=prefs.testFormat==='full';
  box.append(sym,el('h2','',mao?'全册测试':'随机组卷'));
  if(mao){
    const choices=el('div','course-switch test-formats');choices.setAttribute('role','group');choices.setAttribute('aria-label','选择毛概试卷');
    for(const [value,label] of [['random','全册随机 '+testLength+' 题'],['full','全做 '+questions.length+' 题']]){
      const b=el('button','',label);b.type='button';b.dataset.format=value;b.setAttribute('aria-pressed',String(value===prefs.testFormat));choices.append(b);
    }
    box.append(choices);
  }
  box.append(el('p','',full?'按导论至第八章的顺序作答。可以分次完成，交卷后查看成绩。':'从全册随机抽题。作答期间可以改选，交卷后查看成绩。'));
  const single=full?questions.filter(q=>q.kind==='single').length:testCounts.single;
  const multi=full?questions.length-single:testCounts.multi;
  const list=el('div','test-rules');
  for(const [glyph,label,value] of [['list','单选题',single+' 道'],['multiple','多选题',multi+' 道'],['award','试卷满分',(single+multi)*pointsPerQuestion+' 分']]){
    const item=el('div','test-rule');item.append(icon(glyph),el('small','',label),el('strong','',value));list.append(item);
  }
  const ongoing=exam&&!exam.finished;
  const actions=el('div','action-group');actions.append(button(ongoing?'继续测试':'开始测试','next','start-test','primary'));
  if(exam?.finished)actions.append(button('上次成绩','award','summary'));
  box.append(list,el('p','meta-note','每题 '+pointsPerQuestion+' 分。多选题须全部选对。'));
  if(!ongoing)box.append(shuffleOption());
  box.append(actions);return box;
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
  const box=el('article','card credits');
  const list=el('dl','credits-list');
  const preview=el('dialog','portrait-preview');
  const fullImage=el('img');
  const close=el('button','portrait-close');
  close.type='button';
  close.autofocus=true;
  close.setAttribute('aria-label','关闭头像');
  close.append(icon('close'));
  close.addEventListener('click',()=>preview.close());
  preview.addEventListener('click',event=>{if(event.target===preview)preview.close();});
  preview.append(fullImage,close);

  const people=[
    {role:'开发制作',name:'reshi',glyph:'device',photo:'reshi.jpg',contact:'QQ: 2377378565',
      thumbnails:'reshi-44.png 1x, reshi-88.png 2x, reshi-132.png 3x, reshi-176.png 4x'},
    {role:'习概题库提供者',name:'Miraitowa',glyph:'book',photo:'miraitowa.jpg'},
    {role:'毛概题库提供者',name:'ailing',glyph:'book',photo:'ailing.jpg'}
  ];
  for(const {role,name,glyph,photo,contact,thumbnails} of people){
    const item=el('div'),label=el('dt'),person=el('dd');
    label.append(icon(glyph),role);
    const portrait=el('button','portrait-open');
    portrait.type='button';
    portrait.setAttribute('aria-label','查看 '+name+' 的高清头像');
    portrait.setAttribute('aria-haspopup','dialog');
    const avatar=el('img','avatar');
    if(thumbnails)avatar.srcset=thumbnails;
    avatar.src=photo;
    avatar.width=44;
    avatar.height=44;
    avatar.alt='';
    portrait.append(avatar);
    portrait.addEventListener('click',()=>{
      const title=name+' 的头像';
      preview.setAttribute('aria-label',title);
      fullImage.alt=title;
      fullImage.src=photo;
      preview.showModal();
    });
    const identity=el('div','credit-identity');
    identity.append(el('span','credit-name',name));
    if(contact)identity.append(el('span','credit-contact',contact));
    person.append(portrait,identity);
    item.append(label,person);
    list.append(item);
  }
  const title=['红课题本',window.NL_APPVERSION].filter(Boolean).join(' ');
  box.append(list,el('p','meta-note',title+'　/　MIT License'),button('返回刷题','left','return-reading'),preview);
  return box;
}
function questionCard(q,ids,at){
  const e=entry(q.id),isTest=prefs.mode==='test',correct=e.picked===q.answer;
  const box=el('article','card question'),meta=el('div','question-meta'),index=el('div','index');
  const sequence=isTest||chapters.size>0;
  const number=sequence?at+1:q.number;
  const total=sequence?ids.length:questions.filter(item=>item.kind===q.kind).length;
  index.append('第',el('strong','',String(number).padStart(2,'0')),icon('slash'),String(total)+' 题');
  meta.append(el('span','badge '+q.kind,kinds[q.kind]));
  const chapter=chapters.get(q.chapter);
  if(chapter){
    const tag=el('span','chapter-tag',chapterName(chapter));
    tag.title=chapterName(chapter)+' / 原题 '+kinds[q.sourceKind||q.kind]+' '+q.number;
    meta.append(tag);
  }
  meta.append(index);
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
  const setup=settingUp(),ongoing=isTest&&exam&&!exam.finished,fresh=setup&&prefs.mode!=='practice'&&!ongoing;
  const done=fresh?0:ids.filter(id=>isTest?!!exam?.picks[id]:entry(id).graded).length;
  const total=fresh?(isTest?(prefs.testFormat==='full'?questions.length:testLength):wrongNumber()):ids.length;
  const pair=(glyph,text,out)=>{const row=el('div','stat-pair'),label=el('span');label.append(icon(glyph),text);row.append(label,out);return row;};
  const progress=el('output','',''+done+' / '+total),clock=el('output');clock.id='clock';clock.textContent=clockText(elapsed());
  const meter=el('div','bar'),fill=el('span');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label','答题进度');meter.setAttribute('aria-valuenow',String(done));meter.setAttribute('aria-valuemax',String(total||1));meter.setAttribute('aria-valuemin','0');fill.style.width=(total?100*done/total:0)+'%';meter.append(fill);
  $('progress').replaceChildren(pair('progress','答题进度',progress),meter,pair('clock','答题时间',clock));
  const holder=$('map');holder.replaceChildren();
  if(setup||!ids.length){holder.append(el('p','meta-note',ongoing?'继续测试后，可在这里点题号跳转。':total?'开始作答后，可在这里点题号跳转。':'当前没有待练的错题。'));return;}
  const legend=el('div','legend');
  const entries=isTest&&!testDone?[['current','当前'],['marked','已答'],['empty','未答']]:[['current','当前'],['correct','答对'],['mistake','答错'],['empty','未答']];
  for(const [glyph,text] of entries){const l=el('span');l.append(icon(glyph,glyph==='correct'?'good-mark':glyph==='mistake'?'bad-mark':''),text);legend.append(l);}
  holder.append(legend);
  const perChapter=chapters.size>0&&(!isTest||exam.format==='full');
  const groups=perChapter?[...chapters.values()].map(c=>[c.id,chapterName(c)]):Object.entries(kinds);
  const indexed=ids.map((id,i)=>[byId.get(id),i]);
  for(const [key,name] of groups){
    const group=indexed.filter(([q])=>(perChapter?q.chapter:q.kind)===key);if(!group.length)continue;
    holder.append(el('h3','',name));const grid=el('div','grid');
    for(const [q,i] of group){
      const num=isTest||perChapter?i+1:q.number,s=status(q.id),b=el('button','',String(num).padStart(2,'0'));
      b.type='button';b.dataset.goto=String(i);b.dataset.status=s;
      if(i===at&&(!isTest||exam.view!=='summary'))b.setAttribute('aria-current','true');
      b.setAttribute('aria-label',(perChapter?chapters.get(q.chapter).label+' ':'')+kinds[q.kind]+'第 '+num+' 题，'+({right:'答对',wrong:'答错',answered:'已答',draft:'待确认',empty:'未答'}[s]));
      grid.append(b);
    }
    holder.append(grid);
  }
}
function render(){
  const bank=banks.get(bankId);
  $('course-name').textContent=bank.course;$('term').textContent=bank.term;
  $('course-context').hidden=prefs.mode==='credits';
  for(const b of document.querySelectorAll('[data-bank]'))b.setAttribute('aria-pressed',String(b.dataset.bank===bankId));
  const counts=kindCounts();
  for(const b of $('filters').querySelectorAll('[data-kind]'))b.lastElementChild.textContent=String(counts[b.dataset.kind]);
  $('mode-title').textContent=modes[prefs.mode];$('wrong-count').textContent=String(wrongNumber());
  for(const b of document.querySelectorAll('[data-mode]')){if(prefs.mode===b.dataset.mode)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  const onCredits=prefs.mode==='credits';$('side').hidden=onCredits;page().parentElement.classList.toggle('solo',onCredits);
  if(onCredits){$('filters').hidden=true;$('setup-button').hidden=true;page().replaceChildren(credits());return;}
  $('filters').hidden=prefs.mode!=='practice'||settingUp();for(const b of document.querySelectorAll('[data-kind]'))b.setAttribute('aria-pressed',String(b.dataset.kind===prefs.kind));
  const inTest=prefs.mode==='test';
  $('setup-button').hidden=settingUp()||(inTest&&bankId!=='mao');
  $('setup-label').textContent=inTest?'测试设置':'练习设置';
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
    if(b.dataset.theme){theme(b.dataset.theme);if(booted){setPrefs();saveLibrary();}return;}
    if(b.dataset.window){void windowAction(b.dataset.window);return;}
    if(!booted)return;
    if(b.dataset.bank){switchBank(b.dataset.bank);return;}
    if(b.dataset.mode){changeMode(b.dataset.mode);return;}
    if(b.dataset.format){
      prefs.testFormat=b.dataset.format;prefs.testSetup=true;loadExam();setPrefs();render();
      page().querySelector('[data-format="'+prefs.testFormat+'"]')?.focus({preventScroll:true});return;
    }
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
      case 'setup':stopClock();if(prefs.mode==='practice')prefs.practiceSetup=true;else if(prefs.mode==='test')prefs.testSetup=true;else prefs.wrongSetup=true;setPrefs();render();break;
      case 'reset-practice':confirmPracticeReset();break;
      case 'set-shuffle':prefs.shuffle=!prefs.shuffle;setPrefs();render();page().querySelector('[role=switch]')?.focus({preventScroll:true});break;
      case 'start-practice':
        if(!prefs.practiceStarted||!!prefs.practiceSeed!==prefs.shuffle)prefs.practiceSeed=orderSeed(prefs.shuffle);
        prefs.practiceSetup=false;prefs.practiceStarted=true;setPrefs();render();startClock();break;
      case 'start-wrong':beginReview();prefs.wrongSetup=false;setPrefs();render();startClock();break;
      case 'setup-test':prefs.testSetup=true;setPrefs();render();break;
      case 'start-test':
        if(!exam||exam.finished){exam=newTest(questions,Date.now(),orderSeed(prefs.shuffle),prefs.testFormat);saveExam();}
        prefs.testSetup=false;setPrefs();render();break;
      case 'finish':finish();break;
      case 'inspect':go(0);break;
      case 'summary':prefs.testSetup=false;exam.view='summary';saveExam();setPrefs();render();break;
      case 'refresh-wrong':stopClock();prefs.wrongSetup=true;setPrefs();render();break;
    }
  });
  document.addEventListener('change',event=>{
    if(event.target.id!=='practice-chapter'||!booted)return;
    const id=event.target.value;
    if(id!=='all'&&!chapters.has(id))return;
    prefs.chapter=id;setPrefs();render();$('practice-chapter')?.focus({preventScroll:true});
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
function loadExam(){
  const test=readCourse(examKey()),length=prefs.testFormat==='full'?questions.length:testLength;
  exam=Array.isArray(test?.ids)&&(test.format??'random')===prefs.testFormat&&test.ids.length===length&&
    new Set(test.ids).size===length&&test.ids.every(id=>byId.has(id))&&test.picks?test:null;
}
function openBank(id){
  bankId=id;const bank=banks.get(id);
  questions=bank.questions;byId=new Map(questions.map(q=>[q.id,q]));chapters=new Map((bank.chapters||[]).map(c=>[c.id,c]));
  prefs=freshPrefs();records={};exam=null;review={ids:[],at:0,attempts:{},elapsed:0};
  const p=readCourse('prefs')||{};
  if(Object.hasOwn(modes,p.mode))prefs.mode=p.mode;
  if(['all','single','multi'].includes(p.kind))prefs.kind=p.kind;
  if(chapters.has(p.chapter))prefs.chapter=p.chapter;
  if(id==='mao'&&p.testFormat==='full')prefs.testFormat='full';
  if(Number.isSafeInteger(p.practiceEpoch)&&p.practiceEpoch>=0)prefs.practiceEpoch=p.practiceEpoch;
  prefs.place=p.place||{};prefs.theme=p.theme||'system';
  if(['practice','wrong','test'].includes(p.returnMode))prefs.returnMode=p.returnMode;
  for(const key of ['shuffle','practiceSetup','wrongSetup','testSetup','practiceStarted'])if(typeof p[key]==='boolean')prefs[key]=p[key];
  prefs.practiceSeed=p.practiceSeed>>>0;
  for(const q of questions){const r=readCourse('q_'+q.id);if(r&&typeof r.picked==='string')records[q.id]=r;}
  loadExam();
  const last=readCourse('review');
  if(Array.isArray(last?.ids)&&last.attempts&&last.ids.every(key=>byId.has(key)))review=last;
  else if(prefs.mode==='wrong')beginReview();
  const time=readCourse('practice_time');
  if(time?.epoch===prefs.practiceEpoch&&Number.isFinite(time.ms))practiceMs=time.ms;
  else practiceMs=prefs.practiceEpoch===0&&Number.isFinite(time)?time:0;
}
function switchBank(id){
  if(id===bankId||!banks.has(id))return;
  stopClock();const mode=prefs.mode,appearance=prefs.theme;
  openBank(id);
  prefs.mode=mode;if(mode==='wrong')prefs.wrongSetup=true;
  theme(appearance);setPrefs();saveLibrary();render();startClock();$('main').scrollTop=0;
}
async function init(){
  setHandlers();
  const [entries,data]=await Promise.all([Promise.all(Object.entries(bankFiles).map(async([id,file])=>{
    const res=await fetch(file);if(!res.ok)throw Error('题库加载失败');
    return [id,await res.json()];
  })),restore()]);
  for(const [id,bank] of entries)banks.set(id,bank);
  saved=data;openBank(banks.has(data.library?.bank)?data.library.bank:'xi');
  theme(data.library?.theme||prefs.theme);booted=true;render();startClock();
  setInterval(clockUpdate,1000);
  setInterval(()=>{if(tickStart!==null){stopClock();startClock();}},10000);
}
init().catch(error=>{console.error(error);page().replaceChildren(el('h2','','题本未能打开'),el('p','','请重新打开程序以载入题库和本机记录。'));});
