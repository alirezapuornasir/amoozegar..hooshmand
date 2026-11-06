const KEY = 'amoozegar-hooshmand-v1';
const defaults = {
  history: [], wrongIds: [], bookmarks: [], plans: [], notes: '', customCards: [],
  flashKnown: [], theme: 'light', dailyGoal: 30, activeDays: [], reviewedIds: []
};
export function loadState(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaults);
    const parsed = JSON.parse(raw);
    return {...structuredClone(defaults), ...parsed};
  } catch { return structuredClone(defaults); }
}
export function saveState(state){
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export function downloadBackup(state){
  const blob = new Blob([JSON.stringify({app:'آموزگار هوشمند',version:1,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`amoozegar-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
}
export function importBackup(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onerror=()=>reject(new Error('خواندن فایل ناموفق بود.'));
    reader.onload=()=>{try{const data=JSON.parse(reader.result); const next=data.state||data; if(!next||typeof next!=='object') throw new Error('ساختار فایل پشتیبان معتبر نیست.'); resolve({...structuredClone(defaults),...next});}catch(e){reject(e);}};
    reader.readAsText(file);
  });
}
