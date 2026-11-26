// Native storage is independent of the random localhost port assigned to each desktop launch.
const prefix='redbook1_';
export const native=window.NL_APPID==='net.reshi.redcoursebook'&&typeof window.Neutralino==='object';
const failed=new Map();
let pending=Promise.resolve();
export function save(key,value){
  const text=JSON.stringify(value);
  const write=async()=>{
    try{
      if(native)await Neutralino.storage.setData(prefix+key,text);
      else localStorage.setItem(prefix+key,text);
      failed.delete(key);
    }catch{failed.set(key,value);}
    const label=document.getElementById('storage-status');
    label.textContent=failed.size?'有进度尚未保存':'进度保存在本机';
    label.parentElement.dataset.error=String(!!failed.size);
  };
  pending=pending.then(write,write);
  return pending;
}
export async function flush(){
  await pending;
  for(const [key,value] of [...failed])save(key,value);
  await pending;
  return !failed.size;
}
export async function restore(){
  let keys;
  if(native){
    Neutralino.init();
    try{keys=await Neutralino.storage.getKeys();}
    catch(error){if(error?.code==='NE_ST_NOSTDIR')keys=[];else throw error;}
  }else keys=Object.keys(localStorage);
  const data={};
  await Promise.all(keys.filter(k=>k.startsWith(prefix)).map(async k=>{
    const text=native?await Neutralino.storage.getData(k):localStorage.getItem(k);
    try{data[k.slice(prefix.length)]=JSON.parse(text);}catch{/* An isolated damaged record does not hide the rest of a book. */}
  }));
  return data;
}
