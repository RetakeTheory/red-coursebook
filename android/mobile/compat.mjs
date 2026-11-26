// Older Android System WebViews provide append() but not replaceChildren().
if(!Element.prototype.replaceChildren){
  Element.prototype.replaceChildren=function(...nodes){
    this.textContent='';
    this.append(...nodes);
  };
}
window.coursebookSystemDark=new URLSearchParams(location.search).get('theme')==='dark';
