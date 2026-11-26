import './compat.mjs';
import '../../site/app.mjs';

const sheet=document.getElementById('answer-sheet');
const openSheet=document.getElementById('open-sheet');
const side=document.getElementById('side');
openSheet.addEventListener('click',()=>{
  sheet.showModal();
  const current=document.querySelector('#map [aria-current="true"]');
  if(current)current.scrollIntoView({block:'nearest'});
});
document.getElementById('close-sheet').addEventListener('click',()=>sheet.close());
sheet.addEventListener('click',event=>{
  if(event.target===sheet)sheet.close();
});
document.addEventListener('click',event=>{
  if(sheet.open&&event.target.closest('[data-goto]')){
    sheet.close();
    document.querySelector('.question-title')?.focus({preventScroll:true});
  }
});
new MutationObserver(()=>{openSheet.hidden=side.hidden;}).observe(side,{attributes:true,attributeFilter:['hidden']});
const wrongCount=document.getElementById('wrong-count');
const showWrongCount=()=>{
  const count=wrongCount.textContent;
  wrongCount.hidden=count==='0';
  wrongCount.parentElement.setAttribute('aria-label','错题本，'+count+' 道错题');
};
new MutationObserver(showWrongCount).observe(wrongCount,{childList:true,characterData:true,subtree:true});
showWrongCount();
const updateBars=()=>window.CoursebookAppearance?.setDark(document.documentElement.dataset.appearance==='dark');
new MutationObserver(updateBars).observe(document.documentElement,{attributes:true,attributeFilter:['data-appearance']});
updateBars();

window.redbookBack=()=>{
  const dialog=document.querySelector('dialog[open]');
  if(dialog){dialog.close();return true;}
  if(!document.getElementById('theme-menu').hidden){document.getElementById('theme').click();return true;}
  const returning=document.querySelector('[data-action="return-reading"]');
  if(returning){returning.click();return true;}
  const setup=document.getElementById('setup-button');
  if(!setup.hidden){setup.click();return true;}
  if(document.querySelector('[data-mode="practice"]').getAttribute('aria-current')!=='page'){
    document.querySelector('[data-mode="practice"]').click();return true;
  }
  return false;
};
