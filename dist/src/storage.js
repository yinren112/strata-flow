import { restoreState, serializeState } from './engine.js';
const STORAGE_KEY='strata.flow.v1';
export const defaults=()=>({version:1,records:{},session:null,settings:{sound:true,volume:.32,quality:'high',reducedMotion:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches},onboarded:false});
export function sanitizeProfile(raw) {
  const clean=defaults();
  if(!raw||typeof raw!=='object'||raw.version!==1)return clean;
  if(raw.records&&typeof raw.records==='object')for(const [id,r] of Object.entries(raw.records).slice(-400)) {
    if(!/^(c\d{2}|daily-\d{4}-\d{2}-\d{2})$/.test(id)||!r||typeof r!=='object')continue;
    if(!Number.isInteger(r.stars)||r.stars<1||r.stars>3)continue;
    clean.records[id]={stars:r.stars,length:Math.max(0,Math.min(9999,Number(r.length)||0)),elapsed:Math.max(0,Math.min(1e8,Number(r.elapsed)||0)),completedAt:String(r.completedAt||'').slice(0,35)};
  }
  if(raw.settings&&typeof raw.settings==='object') {
    clean.settings.sound=raw.settings.sound!==false;
    clean.settings.volume=Number.isFinite(raw.settings.volume)?Math.max(0,Math.min(1,raw.settings.volume)):.32;
    clean.settings.quality=raw.settings.quality==='low'?'low':'high';
    clean.settings.reducedMotion=!!raw.settings.reducedMotion;
  }
  clean.onboarded=raw.onboarded===true;
  if(raw.session)try{clean.session=serializeState(restoreState(raw.session));}catch{/* Invalid routes are never trusted. */}
  return clean;
}
export class Store {
  constructor(storage) {
    this.storage=storage;this.available=true;this.error='';this.profile=defaults();
    try {
      if(!storage)throw new Error('Storage unavailable');
      const text=storage.getItem(STORAGE_KEY);
      if(text&&text.length<=400000)this.profile=sanitizeProfile(JSON.parse(text));
      else if(text)this.error='存档过大，已使用安全默认值。';
    }catch{this.available=false;this.error='浏览器存储不可用，进度只会保留到页面关闭。';}
  }
  save() {
    try{if(!this.storage)throw new Error('Storage unavailable');this.storage.setItem(STORAGE_KEY,JSON.stringify(this.profile));this.available=true;return true;}
    catch{this.available=false;this.error='保存失败，请导出进度备份。';return false;}
  }
  saveSession(state){this.profile.session=serializeState(state);return this.save();}
  record(state,stars,totalLength) {
    if(!/^(c\d{2}|daily-\d{4}-\d{2}-\d{2})$/.test(state.level.id))return;
    const old=this.profile.records[state.level.id];
    this.profile.records[state.level.id]={stars:Math.max(old?.stars||0,stars),length:old?Math.min(old.length,totalLength):totalLength,elapsed:old?Math.min(old.elapsed,state.elapsed):state.elapsed,completedAt:new Date().toISOString()};
    this.saveSession(state);
  }
  export(){return JSON.stringify(this.profile,null,2);}
  import(text) {
    if(typeof text!=='string'||text.length>400000)throw new Error('存档文件不能超过 400 KB。');
    const raw=JSON.parse(text);if(raw?.version!==1)throw new Error('不支持的存档版本。');
    this.profile=sanitizeProfile(raw);this.save();return this.profile;
  }
  reset(){this.profile=defaults();this.save();}
}
