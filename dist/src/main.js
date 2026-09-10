import {createState,copy,key,same,selectCircuit,step,connected,connectedCount,allConnected,length,pumpCount,clearCircuit,undo,redo,hint,startFlow,stopFlow,tick,flowDuration,score,reachableMoves,restoreState,validateLevel,serializeState} from './engine.js';
import {CAMPAIGN,DEMO,COLORS,FLUIDS,CHAPTERS,generateLevel,dailyLevel,getDateKey} from './levels.js';
import {Store} from './storage.js';
import {Sound} from './audio.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICONS={sound:'<path d="M11 4 6 8H3v8h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',mute:'<path d="M11 4 6 8H3v8h3l5 4zM16 9l5 6m0-6-5 6"/>',settings:'<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/><circle cx="12" cy="12" r="3"/>',camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||''}</svg>`;
let presentation=false,presentationFocus=null;
function togglePresentation(value){
  if(value)presentationFocus=document.activeElement;
  presentation=value;document.body.classList.toggle('presentation-mode',value);scene?.setPresentation(value);
  for(const el of document.querySelectorAll('.topbar,.sidebar,.home-intro,.inspector,.app-footer'))el.inert=value;
  const tour=document.querySelector('.presentation-tour');
  if(value){document.querySelector('.presentation-exit').focus();}
  else{if(scene)scene.tour=false;tour.setAttribute('aria-pressed','false');tour.textContent='自动环视';presentationFocus?.focus();}
  document.getElementById('apparatus-caption').textContent=`${String((screen==='home'?DEMO:state.level).circuits.length).padStart(2,'0')} CIRCUITS · INFINITE POSSIBILITIES`;
}
let storage;try{storage=globalThis.localStorage;}catch{/* private mode may disallow local storage entirely */}
const store=new Store(storage),sound=new Sound(store.profile.settings);
let state=createState(CAMPAIGN[0]),scene=null,screen='home',paused=false,showPractice=false,modalKind='',toastTimer=0,saveTimer=0,lastTime=performance.now(),uiClock=0,lastSaveFailed=false;
const demoState=createState(DEMO);demoState.paths=copy(DEMO.solution);demoState.phase='won';
function toast(message,error=false) {
  clearTimeout(toastTimer);$('toast').textContent=message;$('toast').className='visible'+(error?' error':'');toastTimer=setTimeout(()=>$('toast').className='',error?3600:2600);
}
function saveNow() {
  if(screen!=='game')return;clearTimeout(saveTimer);
  const ok=store.saveSession(state);updateSaveLabel();
  if(!ok&&!lastSaveFailed){toast(store.error,true);lastSaveFailed=true;}if(ok)lastSaveFailed=false;
}
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,220);}
function updateSaveLabel(){ $('save-status').textContent=store.available?'离线就绪 · 本地自动保存':'存储不可用 · 请导出进度'; }
function formatTime(value){const t=Math.floor(value);return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}
const campaignIndex=()=>CAMPAIGN.findIndex(l=>l.id===state.level.id);
const completedTotal=()=>CAMPAIGN.filter(l=>store.profile.records[l.id]).length;
const starsTotal=()=>CAMPAIGN.reduce((s,l)=>s+(store.profile.records[l.id]?.stars||0),0);
function unlockedIndex(){let i=0;while(i<CAMPAIGN.length&&store.profile.records[CAMPAIGN[i].id])i++;return Math.min(CAMPAIGN.length-1,i);}
function applySettings() {
  document.documentElement.classList.toggle('reduced-motion',store.profile.settings.reducedMotion);
  sound.update(store.profile.settings);scene?.applySettings(store.profile.settings);
  $('sound-button').innerHTML=icon(store.profile.settings.sound?'sound':'mute');$('sound-button').setAttribute('aria-label',store.profile.settings.sound?'关闭声音':'开启声音');$('sound-button').setAttribute('aria-pressed',String(store.profile.settings.sound));
}
function updateHomeButton() {
  const session=screen==='game'?serializeState(state):store.profile.session;
  const label=session&&!session.won?'继续流动':completedTotal()>0&&completedTotal()<24?'继续探索':'开始流动';
  $('continue-button').innerHTML=label+' <span>↗</span>';
}
function openModal(title,html,kind='generic',kicker='STRATA / 流层') {
  modalKind=kind;$('modal-title').textContent=title;$('modal-kicker').textContent=kicker;$('modal-content').innerHTML=html;
  if(!$('modal').open)$('modal').showModal();
  $('modal').scrollTop=0;
}
function closeModal(){if($('modal').open)$('modal').close();modalKind='';if(paused)paused=false;lastTime=performance.now();}
$('modal').addEventListener('cancel',()=>{paused=false;modalKind='';lastTime=performance.now();});
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
function showHome() {
  if(screen==='game')saveNow();screen='home';paused=false;closeModal();$('app').className='mode-home';
  $('scene-status').textContent='LIVE DIORAMA';$('scene-size').textContent='5 × 4 × 5';$('flow-banner').hidden=true;$('footer-hint').textContent='一种空间思考的练习。';
  $('slice-button').classList.remove('active');$('slice-button').setAttribute('aria-pressed','false');
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='iso'));
  scene?.load(demoState,true);updateHomeButton();
}
function startLevel(level,resume=null) {
  closeModal();paused=false;screen='game';state=resume||createState(level);$('app').className='mode-game';
  $('flow-banner').hidden=true;scene?.load(state);$('slice-button').classList.remove('active');$('slice-button').setAttribute('aria-pressed','false');
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='iso'));
  updateUI();saveNow();window.scrollTo({top:0,behavior:'instant'});lastTime=performance.now();
  if(!store.profile.onboarded){store.profile.onboarded=true;store.save();toast('先连接 A 的两个端口。发光点是可以接入的位置。');}
}
function continueGame() {
  if(screen==='game')return;
  const saved=store.profile.session;
  if(saved&&!saved.won)try{startLevel(saved.level,restoreState(saved));return;}catch{}
  startLevel(CAMPAIGN[unlockedIndex()]);
}
function updateUI(rebuildScene=false) {
  if(screen!=='game')return;
  const l=state.level,index=campaignIndex(),c=state.selected,count=connectedCount(state),head=state.paths[c].at(-1),color=COLORS[c];
  document.documentElement.style.setProperty('--active',color);
  document.querySelector('.inspector').dataset.size=String(l.size);
  $('level-number').innerHTML=index>=0?`${String(index+1).padStart(2,'0')}<span>/ 24</span>`:`∞<span>/ LAB</span>`;
  $('chapter-label').textContent=index>=0?`${String(l.chapter+1).padStart(2,'0')} / 04`:'FREE';
  $('level-name').textContent=l.name;$('level-subtitle').textContent=l.subtitle;$('level-tip').textContent=l.tip;
  $('par-value').textContent=l.par;$('length-value').textContent=length(state);$('circuit-total').textContent=count+' / '+l.circuits.length;
  $('circuits').innerHTML=l.circuits.map((c,i)=>`<button class="circuit ${state.selected===i?'selected':''}" data-circuit="${i}" style="--fluid:${COLORS[i]}" aria-pressed="${state.selected===i}" aria-label="选择回路 ${c.id}，${connected(state,i)?'已接通':'尚未接通'}"><span class="circuit-letter">${c.id}</span><span class="circuit-copy"><strong>${FLUIDS[i]}</strong><small>L${c.start[1]+1} → L${c.end[1]+1} <span> · ${state.paths[i].length-1} 格</span></small></span><span class="circuit-status">${connected(state,i)?'✓':state.selected===i?'←':'·'}</span></button>`).join('');
  $('mobile-circuits').innerHTML=l.circuits.map((c,i)=>`<button class="mobile-circuit ${state.selected===i?'selected':''}" data-circuit="${i}" style="--fluid:${COLORS[i]}" aria-pressed="${state.selected===i}" aria-label="选择回路 ${c.id}">${c.id} ${connected(state,i)?'✓':`${state.paths[i].length-1}格`}</button>`).join('');
  $('scene-status').textContent=state.phase==='running'?'SYSTEM / FILLING':state.phase==='won'?'SYSTEM / IN FLOW':`EXPERIMENT ${index>=0?String(index+1).padStart(2,'0'):'∞'} / ${l.name}`;
  $('scene-size').textContent=`${l.size} × ${l.height} × ${l.size}`;
  $('scene-layer').innerHTML=`<span>EDITING LAYER</span><strong>L${state.layer+1}</strong><small>/ L${l.height}</small>`;
  $('floor-meta').textContent=`L${state.layer+1} / ${l.height}`;
  $('layer-tabs').innerHTML=Array.from({length:l.height},(_,y)=>`<button data-layer="${y}" class="${state.layer===y?'active ':''}${head[1]===y?'has-head':''}" aria-pressed="${state.layer===y}" aria-label="观察第 ${y+1} 层">L${y+1}</button>`).join('');
  $('head-coord').textContent=`X${head[0]+1} · L${head[1]+1} · Z${head[2]+1}`;
  $('pump-box').className='pump-box'+(l.gravity?'':' pressurized');
  $('pump-box').innerHTML=l.gravity?`<div>↑ 可用泵额度<small>每上升一格自动安装一台</small></div><strong>${l.pumps-pumpCount(state)}<small>/ ${l.pumps} 台</small></strong>`:`<div>↕ 自由压力模式<small>可向任意方向布管，不消耗泵</small></div><strong>∞</strong>`;
  const isEdit=state.phase==='editing';
  $('down-button').disabled=!isEdit||head[1]<=0||connected(state,c);
  $('up-button').disabled=!isEdit||head[1]>=l.height-1||connected(state,c);
  $('undo-button').disabled=!isEdit||!state.history.length;$('redo-button').disabled=!isEdit||!state.future.length;$('hint-button').disabled=!isEdit;
  $('routing-tip').textContent=state.ghost?`提示点：X${state.ghost[0]+1} · L${state.ghost[1]+1} · Z${state.ghost[2]+1}。黄色格点是下一步。`:l.gravity?`上升每格用 1 台泵 · 剩余 ${l.pumps-pumpCount(state)} 台；切层不会自动布管。`:'点击相邻格点，或者拖动连续布管。切层只改变观察楼层。';
  $('run-label').textContent=state.phase==='running'?'停止试运行':state.phase==='won'?'查看实验报告':'试运行';
  $('run-count').textContent=count+' / '+l.circuits.length;$('run-button').classList.toggle('ready',allConnected(state));
  $('ready-label').textContent=state.phase==='won'?'全部回路畅通。':allConnected(state)?'回路就绪，准备注入液体。':'连接全部端口后，让液体流动。';
  $('footer-hint').textContent='方向键布管 · Q / E 跨层 · Z 撤销 · 空格试运行';
  updateBoard();if(rebuildScene)scene?.update(state);else scene?.updateGuides();
  $('time-value').textContent=formatTime(state.elapsed);
}
function updateBoard() {
  const l=state.level,n=l.size,y=state.layer,occupied=new Map(),endpoints=new Map(),blocked=new Set(l.blocks.map(key)),moves=new Set(reachableMoves(state).map(key));
  l.circuits.forEach((c,i)=>{endpoints.set(key(c.start),{i,type:'in'});endpoints.set(key(c.end),{i,type:'out'});});
  state.paths.forEach((path,i)=>path.forEach((p,j)=>occupied.set(key(p),{i,j,vertical:(j>0&&path[j-1][1]!==p[1])||(j<path.length-1&&path[j+1][1]!==p[1])})));
  let paths='';
  state.paths.forEach((path,i)=>{
    for(let j=1;j<path.length;j++)if(path[j][1]===y&&path[j-1][1]===y) {
      const a=path[j-1],b=path[j];paths+=`<path d="M${a[0]*40+20},${a[2]*40+20} L${b[0]*40+20},${b[2]*40+20}" stroke="${COLORS[i]}" stroke-width="8" stroke-linecap="round" opacity="${i===state.selected?.80:.52}"/>`;
    }
  });
  let cells='';
  for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
    const p=[x,y,z],k=key(p),occ=occupied.get(k),ep=endpoints.get(k),block=blocked.has(k),head=same(p,state.paths[state.selected].at(-1));
    const color=ep?COLORS[ep.i]:occ?COLORS[occ.i]:COLORS[state.selected];
    let classes='cell',content='';
    if(ep){classes+=' endpoint';content=`<span>${l.circuits[ep.i].id}</span><small>${ep.type==='in'?'›':'‹'}</small>`;}
    else if(block){classes+=' blocked';content='<span aria-hidden="true"></span>';}
    else if(occ){classes+=' occupied'+(occ.vertical?' vertical':'');content=`<span aria-hidden="true">${occ.vertical?'↕':''}</span>`;}
    if(head)classes+=' head';if(moves.has(k))classes+=' available';if(state.ghost&&same(p,state.ghost))classes+=' hinted';
    const desc=ep?`回路 ${l.circuits[ep.i].id} ${ep.type==='in'?'入口':'出口'}`:block?'设备障碍':occ?`回路 ${l.circuits[occ.i].id} 已铺管路`:'空格点';
    cells+=`<button class="${classes}" data-cell="${k}" style="--fluid:${color}" aria-label="X${x+1} 第${y+1}层 Z${z+1}，${desc}${moves.has(k)?'，可连接':''}" ${state.phase!=='editing'?'disabled':''}>${content}</button>`;
  }
  $('board').style.setProperty('--n',n);$('board').innerHTML=`<svg viewBox="0 0 ${n*40} ${n*40}" aria-hidden="true">${paths}</svg>${cells}`;
}
function handleCell(p,quiet=false) {
  if(screen!=='game'||state.phase!=='editing'||paused||$('modal').open)return false;
  // Other circuits' ports switch selection, never overwrite or extend a foreign route.
  const other=state.level.circuits.findIndex(c=>same(c.start,p)||same(c.end,p));
  if(other>=0&&other!==state.selected){selectCircuit(state,other);sound.play('select');updateUI(true);saveSoon();return true;}
  const result=step(state,p);
  if(!result.ok){if(!quiet){toast(result.reason,true);sound.play('error');}return false;}
  sound.play(result.connected?'connect':result.backtrack?'back':'step',state.selected);updateUI(true);saveSoon();
  if(result.ready)toast('所有回路都接通了。试运行，让液体流动起来。');
  else if(result.connected)toast(`回路 ${state.level.circuits[state.selected].id} 接通。选择下一种液体继续。`);
  return true;
}
function moveVertical(delta) {const p=copy(state.paths[state.selected].at(-1));p[1]+=delta;handleCell(p);}
function select(i){if(screen!=='game'||state.phase==='running')return;selectCircuit(state,i);sound.play('select');updateUI(true);saveSoon();}
function doHint() {
  if(screen!=='game')return;
  const result=hint(state);if(!result.ok){toast(result.reason,true);return;}
  if(result.target[1]!==state.layer)state.layer=result.target[1];
  updateUI();saveSoon();sound.play('select');toast('黄色格点是建议的下一步。使用提示不影响通关，但会少一颗独立完成星。');
}
function run() {
  if(screen!=='game')return;
  if(state.phase==='won'){showWin();return;}
  if(state.phase==='running'){stopFlow(state);$('flow-banner').hidden=true;updateUI(true);saveNow();return;}
  const result=startFlow(state);if(!result.ok){toast(result.reason,true);sound.play('error');updateUI(true);return;}
  sound.play('run');$('flow-banner').hidden=false;$('flow-text').textContent='液体正在注入…';updateUI(true);saveNow();
}
function onWin() {
  const stars=score(state);store.record(state,stars,length(state));sound.play('win');$('flow-text').textContent='全部回路畅通。';
  updateUI(true);saveNow();setTimeout(()=>{if(screen==='game'&&state.phase==='won'&&!$('modal').open)showWin();},550);
}
function showWin() {
  const stars=score(state),index=campaignIndex(),next=index>=0&&index<23;
  openModal('实验完成',`<div class="win-content"><div class="win-mark" aria-hidden="true">✓</div><div class="win-stars" aria-label="获得 ${stars} 颗星">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div><h3>流动，自有其道。</h3><p>${esc(state.level.name)} · 每一股液体，都找到了自己的出口。</p><div class="win-stats"><div><strong>${length(state)}</strong><small>管长 / 格</small></div><div><strong>${formatTime(state.elapsed)}</strong><small>从容用时</small></div><div><strong>${pumpCount(state)}</strong><small>安装泵 / 台</small></div></div><div class="star-rule"><span>✓ 全回路畅通</span><span class="${length(state)>state.level.par?'no':''}">${length(state)<=state.level.par?'✓':'○'} 不超过参考管长</span><span class="${state.hints?'no':''}">${state.hints?'○':'✓'} 未使用提示</span></div><div class="modal-actions"><button class="secondary" data-action="inspect-win">欣赏机柜</button><button class="secondary" data-action="replay">再试一条路</button><button class="primary" data-action="${next?'next':index===23?'finish-campaign':'workshop'}">${next?'下一场实验 ↗':index===23?'完成全部旅程 ↗':'新的自由实验 ↗'}</button></div></div>`,'win','EXPERIMENT COMPLETE');
}
function showLevels() {
  const unlocked=unlockedIndex();let html=`<p class="modal-desc">从一股简单的流，到四路共生的小机房。${showPractice?'自由选关已开启，不受进度限制。':'完成当前关卡，解锁下一场实验。'}</p>`;
  CHAPTERS.forEach((chapter,ci)=>{
    html+=`<section class="chapter-section"><h3>${String(ci+1).padStart(2,'0')} / ${chapter.title}<span>${chapter.en}</span></h3><div class="level-grid">`;
    for(let j=0;j<6;j++){const i=ci*6+j,l=CAMPAIGN[i],record=store.profile.records[l.id],locked=!showPractice&&i>unlocked;
      html+=`<button class="level-tile ${i===unlocked?'current':''}" data-level="${i}" ${locked?'disabled':''} aria-label="第 ${i+1} 关 ${l.name}${locked?'，未解锁':''}"><strong>${locked?'·':String(i+1).padStart(2,'0')}</strong><small>${l.name}</small><span class="stars">${record?'★'.repeat(record.stars)+'☆'.repeat(3-record.stars):locked?'未解锁':'···'}</span></button>`;
    }html+='</div></section>';
  });
  html+=`<div class="modal-footer"><span>已完成 ${completedTotal()} / 24 · 收集 ${starsTotal()} / 72 颗星</span><button class="secondary" data-action="practice">${showPractice?'恢复逐关解锁':'自由选关'}</button></div>`;
  openModal('关卡图鉴',html,'levels','24 EXPERIMENTS / 4 CHAPTERS');
}
function showWorkshop() {
  openModal('自由实验',`<p class="modal-desc">先生成一组不重叠的参考路线，再放置设备障碍。每个实验都会自动检查可解性。同样的参数与种子，得到同一座机柜。</p><div class="form-grid"><label class="wide">实验种子<input id="seed-input" maxlength="48" value="STRATA-${getDateKey()}" autocomplete="off" spellcheck="false"></label><label>底板尺寸<select id="size-select"><option value="4">4 × 4 / 紧凑</option><option value="5" selected>5 × 5 / 标准</option><option value="6">6 × 6 / 宽敞</option><option value="7">7 × 7 / 大型</option></select></label><label>可用楼层<select id="height-select"><option value="2">2 层</option><option value="3">3 层</option><option value="4" selected>4 层</option><option value="5">5 层</option></select></label><label>液体回路<select id="count-select"><option value="2">2 条</option><option value="3" selected>3 条</option><option value="4">4 条</option></select></label><label>空间密度<select id="complexity-select"><option value="1">轻松</option><option value="2" selected>标准</option><option value="3">密集</option></select></label><label class="wide check-label"><input type="checkbox" id="gravity-input" checked>启用重力与有限泵额度</label></div><div class="settings-note">工坊支持关卡 JSON 导入与导出。导入关卡必须附带合法参考解，越界、重叠或泵不足的关卡会被拒绝。自由实验成绩不计入 24 关进度。</div><div class="modal-actions"><button class="secondary" data-action="import-level">导入关卡</button><button class="primary" data-action="generate">生成并开始 ↗</button></div>`,'workshop','PROCEDURAL / VERIFIED');
}
function showSettings() {
  const s=store.profile.settings;
  openModal('留一点自己的空间',`<div class="settings-list"><label class="setting-row"><span>合成音效<small>轻触、接通与实验完成的提示音。</small></span><input id="setting-sound" type="checkbox" ${s.sound?'checked':''}></label><label class="setting-row"><span>音量<small>不会自动播放背景音乐。</small></span><input type="range" id="setting-volume" min="0" max="100" value="${s.volume*100}" aria-label="音量"></label><label class="setting-row"><span>画面质量<small>较低质量使用较低分辨率与阴影精度。CPU 回退使用独立光栅内核，实际帧率受设备影响。</small></span><select id="setting-quality"><option value="high" ${s.quality==='high'?'selected':''}>精细画面</option><option value="low" ${s.quality==='low'?'selected':''}>低功耗</option></select></label><label class="setting-row"><span>减少动态效果<small>关闭镜头惯性、主页呼吸、叶轮与流体脉动。</small></span><input id="setting-motion" type="checkbox" ${s.reducedMotion?'checked':''}></label></div><div class="settings-note">存档仅保存在当前浏览器，没有登录、云同步或数据上报。更换设备、清理浏览器之前，请导出进度备份。</div><div class="modal-actions"><button class="secondary" data-action="export-save">导出进度</button><button class="secondary" data-action="import-save">导入进度</button><button class="secondary danger" data-action="reset-save">清空进度</button></div>`,'settings','MAKE YOURSELF COMFORTABLE');
}
function showHelp() {
  openModal('让思路，立体流动',`<p class="modal-desc">目标很简单：把每一组同字母的入口与出口接起来。不需要填满格点，也没有倒计时。</p><div class="help-steps"><div class="help-step"><div><h3>选一股液体，走到相邻格点</h3><p>点击 A / B / C / D 回路后，从入口开始。点击三维机柜上的发光格点，或在楼层布线板点击、拖动铺管。只能上下左右前后相邻连接，不能斜着走。</p></div></div><div class="help-step"><div><h3>平面被挡住，就换一层</h3><p>「上升 / 下降」从当前管路末端铺一段竖管。L1、L2 等楼层按钮只切换观察层，不会自动铺管。不同液体不能占同一格，但可以从上方或下方绕过。管路末端的楼层会有一个小圆点。</p></div></div><div class="help-step"><div><h3>重力模式下，每次上升都需要泵</h3><p>每上升一格自动装一台泵，消耗一份额度；平移、下降不消耗。拆掉该上升段会返还额度。这是明确的益智规则，不是工程水力学仿真。</p></div></div><div class="help-step"><div><h3>可以后悔，也可以慢一点</h3><p>点击本回路已经走过的格点，会回退到那里。「撤销」与「重做」记录有效操作。所有出口连接后点击「试运行」，观察液体注入并领取实验报告。</p></div></div></div><div class="settings-note">三星条件：全部接通 + 管长不超过参考解 + 未使用提示。参考解是经过验证的可行解，不保证是最短解。提示只建议当前回路的下一格，不保证后续所有回路无需调整。</div><div class="key-guide"><span><kbd>↑ ↓ ← →</kbd> 水平布管</span><span><kbd>Q / E</kbd> 下降 / 上升</span><span><kbd>1–4</kbd> 选择回路</span><span><kbd>Z / Y</kbd> 撤销 / 重做</span><span><kbd>H</kbd> 提示</span><span><kbd>空格</kbd> 试运行</span><span><kbd>Esc</kbd> 暂停</span></div><div class="modal-actions"><button class="primary" data-action="close-modal">开始寻找自己的路 →</button></div>`,'help','HOW TO FIND A WAY');
}
function showPause() {
  if(screen!=='game')return;paused=true;saveNow();
  openModal('让时间停一会儿',`<p class="modal-desc">实验已经暂停，计时与液体注入都已停止。当前管路已尝试保存到本机。</p><div class="modal-actions"><button class="secondary" data-action="home">返回首页</button><button class="secondary" data-action="export-level">导出关卡</button><button class="secondary" data-action="restart">重新开始</button><button class="primary" data-action="close-modal">继续实验 →</button></div>`,'pause','TAKE YOUR TIME');
}
function confirmRestart() {
  openModal('重新开始这场实验？','<p class="modal-desc">本关已铺管路将清空，关卡通关记录与历史最佳星数会保留。</p><div class="modal-actions"><button class="secondary" data-action="close-modal">保留当前路线</button><button class="primary" data-action="replay">重新布管</button></div>','restart');
}
function showAbout() {
  openModal('流层 STRATA',`<div class="about-copy"><p><strong>一个关于空间、秩序与流动的小实验。</strong><br>把平面的连线变成可以转动、可以错层的立体机房。</p><h3>这份版本包含什么</h3><p>24 个递进关卡、每日关卡、种子工坊、重力与泵规则、自动存档、进度备份、完整键盘操作与低功耗画质。所有几何体、界面和声音均由项目代码生成。</p><h3>透明的边界</h3><p>版本 2.0.0-rc.1 / ATELIER。它是可离线部署的单机 Web 游戏，不含账号、支付、广告 SDK、云存档或在线排行榜。流动是视觉化规则演示，不代表真实液体压力或流量计算。</p><p>渲染引擎为本地固定版本 Three.js r140（MIT 许可证）。第三方许可见交付包 THIRD_PARTY_NOTICES.md。无法使用 WebGL 时，会切换到投影同一 Three.js 场景的软件三维视图，新版 CPU 回退具有插值法线、金属高光和阴影深度图，但并非 WebGL 材质着色器的等价实现。原生 WebGL 与真机验收边界见交付记录。</p></div><div class="modal-actions"><button class="secondary" data-action="workshop">打开实验工坊</button><button class="primary" data-action="close-modal">回到流层 →</button></div>`,'about','STRATA / ATELIER 02');
}
function download(content,name,type='application/json') {
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function safeName(s){return String(s).replace(/[^\w\-\u4e00-\u9fff]/g,'_').slice(0,70);}
async function handleAction(action) {
  sound.unlock();
  if(action==='tour'){if(store.profile.settings.reducedMotion){toast('减少动态效果已开启；可拖动装置或使用视角按钮。');return;}scene.tour=!scene.tour;if(scene.tour){scene.tourTime=0;scene.view('iso');}document.querySelector('.presentation-tour').setAttribute('aria-pressed',String(scene.tour));document.querySelector('.presentation-tour').textContent=scene.tour?'停止环视':'自动环视';return;}
  if(action==='presentation'){togglePresentation(true);return;}
  if(action==='exit-presentation'){togglePresentation(false);return;}
  if(action==='home'){showHome();return;}
  if(action==='continue'){continueGame();return;}
  if(action==='levels'){showLevels();return;}
  if(action==='practice'){showPractice=!showPractice;showLevels();return;}
  if(action==='workshop'){showWorkshop();return;}
  if(action==='daily'){startLevel(dailyLevel());return;}
  if(action==='generate') {
    const seed=$('seed-input').value.trim()||'STRATA';
    const l=generateLevel(seed,{size:Number($('size-select').value),height:Number($('height-select').value),count:Number($('count-select').value),complexity:Number($('complexity-select').value),gravity:$('gravity-input').checked});
    l.name='自由实验';l.subtitle='SEED / '+seed;l.tip+=' 种子：'+seed;startLevel(l);toast('新的机柜已生成，参考解已通过规则校验。');return;
  }
  if(action==='close-modal'||action==='inspect-win'){closeModal();return;}
  if(action==='settings'){showSettings();return;}
  if(action==='help'){showHelp();return;}
  if(action==='about'){showAbout();return;}
  if(action==='sound'){store.profile.settings.sound=!store.profile.settings.sound;applySettings();store.save();if(store.profile.settings.sound)sound.play('select');return;}
  if(action==='up'){moveVertical(1);return;}if(action==='down'){moveVertical(-1);return;}
  if(action==='undo'||action==='redo') {
    if((action==='undo'?undo:redo)(state)){sound.play('back');updateUI(true);saveSoon();}return;
  }
  if(action==='clear'){if(clearCircuit(state)){sound.play('back');updateUI(true);saveSoon();}return;}
  if(action==='hint'){doHint();return;}if(action==='run'){run();return;}
  if(action==='pause'){showPause();return;}
  if(action==='restart'){confirmRestart();return;}
  if(action==='replay'){startLevel(state.level);return;}
  if(action==='next'){const index=campaignIndex();if(index>=0&&index<23)startLevel(CAMPAIGN[index+1]);return;}
  if(action==='finish-campaign'){showHome();toast('24 场实验之后，你已经让思路立体流动。每日与自由实验仍在等你。');return;}
  if(action==='slice'){if(!scene)return;scene.setSlice(!scene.slice);$('slice-button').classList.toggle('active',scene.slice);$('slice-button').setAttribute('aria-pressed',String(scene.slice));return;}
  if(action==='capture') {
    if(!scene){toast('三维渲染不可用，无法生成机柜截图。',true);return;}
    try {scene.render(performance.now()/1000);const a=document.createElement('a');a.href=scene.capture();a.download='STRATA-'+safeName(screen==='home'?'机柜':state.level.name)+'.png';a.click();toast('机柜截图已生成。');}catch{toast('浏览器未能导出画面。',true);}return;
  }
  if(action==='export-level'){download(JSON.stringify(state.level,null,2),'STRATA-'+safeName(state.level.id)+'.json');toast('关卡已导出，包含经过验证的参考路线。');return;}
  if(action==='import-level'){$('level-file').click();return;}
  if(action==='export-save'){if(screen==='game')saveNow();download(store.export(),'STRATA-progress-'+getDateKey()+'.json');toast('本机进度备份已导出。');return;}
  if(action==='import-save'){$('save-file').click();return;}
  if(action==='reset-save') {
    openModal('清空全部本机进度？','<p class="modal-desc">将删除当前浏览器里的星数、关卡记录和未完成路线。建议先导出备份。这不会删除已下载的备份文件。</p><div class="modal-actions"><button class="secondary" data-action="export-save">先导出备份</button><button class="secondary" data-action="close-modal">取消</button><button class="secondary danger" data-action="confirm-reset-save">确认清空</button></div>','reset-save');return;
  }
  if(action==='confirm-reset-save'){clearTimeout(saveTimer);screen='home';store.reset();applySettings();showHome();toast('本机进度已清空。');return;}
}
document.addEventListener('click',e=>{
  const target=e.target.closest('button');if(!target||target.disabled)return;
  if(target.dataset.action){handleAction(target.dataset.action).catch(err=>{console.error(err);toast('操作未能完成：'+err.message,true);});return;}
  if(target.dataset.level!==undefined){const i=Number(target.dataset.level);if(i>=0&&i<CAMPAIGN.length&&(showPractice||i<=unlockedIndex()))startLevel(CAMPAIGN[i]);return;}
  if(target.dataset.circuit!==undefined){select(Number(target.dataset.circuit));return;}
  if(target.dataset.layer!==undefined){state.layer=Number(target.dataset.layer);state.ghost=null;updateUI();saveSoon();return;}
  if(target.dataset.view){scene?.view(target.dataset.view);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===target));return;}
  if(target.dataset.cell&&e.detail===0){handleCell(target.dataset.cell.split(',').map(Number));}
});
let boardDrawing=false,lastBoardCell='';
$('board').addEventListener('pointerdown',e=>{
  const cell=e.target.closest('[data-cell]');if(!cell||cell.disabled||e.button>0)return;
  e.preventDefault();boardDrawing=true;lastBoardCell=cell.dataset.cell;cell.focus({preventScroll:true});$('board').setPointerCapture(e.pointerId);handleCell(lastBoardCell.split(',').map(Number));
});
$('board').addEventListener('pointermove',e=>{
  if(!boardDrawing)return;const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-cell]');if(!cell||cell.dataset.cell===lastBoardCell)return;
  lastBoardCell=cell.dataset.cell;handleCell(lastBoardCell.split(',').map(Number),true);
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('board').addEventListener(event,()=>{boardDrawing=false;lastBoardCell='';});
document.addEventListener('input',e=>{
  const id=e.target.id,s=store.profile.settings;
  if(id==='setting-sound')s.sound=e.target.checked;
  else if(id==='setting-volume')s.volume=Number(e.target.value)/100;
  else if(id==='setting-motion')s.reducedMotion=e.target.checked;
  else if(id==='setting-quality')s.quality=e.target.value;
  else return;
  applySettings();store.save();
});
$('level-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{if(file.size>200000)throw new Error('关卡文件不能超过 200 KB。');const l=validateLevel(JSON.parse(await file.text()));l.id='import-'+Date.now();l.name='导入 · '+l.name;startLevel(l);toast('关卡导入成功，参考路线合法。');}catch(err){toast('无法导入：'+err.message,true);}
});
$('save-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{if(file.size>400000)throw new Error('存档文件不能超过 400 KB。');clearTimeout(saveTimer);store.import(await file.text());screen='home';applySettings();showHome();toast('进度已恢复。点击继续流动，返回未完成的实验。');}catch(err){toast('无法恢复：'+err.message,true);}
});
document.addEventListener('keydown',e=>{
  if(presentation&&e.key==='Escape'){e.preventDefault();togglePresentation(false);return;}
  if(presentation&&e.key==='Tab'){const buttons=[...document.querySelectorAll('.presentation-exit,.presentation-tour,.scene-bottom button')].filter(b=>b.offsetWidth&&!b.disabled);let next=buttons.indexOf(document.activeElement)+(e.shiftKey?-1:1);e.preventDefault();buttons[(next+buttons.length)%buttons.length]?.focus();return;}
  if(presentation)return;
  if(screen!=='game'||$('modal').open||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.isComposing)return;
  const k=e.key.toLowerCase();
  if(k==='escape'){e.preventDefault();showPause();return;}
  if(paused)return;
  if(k===' '&&e.target.tagName==='BUTTON')return; // Preserve native focused-button activation.
  if(['arrowleft','arrowright','arrowup','arrowdown','q','e','z','y','h',' ','r','1','2','3','4'].includes(k))e.preventDefault();else return;
  if(k==='z'){handleAction(e.shiftKey?'redo':'undo');return;}if(k==='y'){handleAction('redo');return;}
  if(k==='q'){moveVertical(-1);return;}if(k==='e'){moveVertical(1);return;}
  if(k==='h'){doHint();return;}if(k===' '){run();return;}if(k==='r'){confirmRestart();return;}
  if(/^[1-4]$/.test(k)){select(Number(k)-1);return;}
  const dir={arrowleft:[-1,0,0],arrowright:[1,0,0],arrowup:[0,0,-1],arrowdown:[0,0,1]}[k];
  if(dir){const head=state.paths[state.selected].at(-1);handleCell(head.map((v,i)=>v+dir[i]));}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(screen==='game'&&state.phase!=='won'&&!$('modal').open)showPause();saveNow();sound.suspend();}
  lastTime=performance.now();
});
window.addEventListener('beforeunload',saveNow);
window.addEventListener('pagehide',saveNow);
function animate(now) {
  const dt=Math.min(1,Math.max(0,(now-lastTime)/1000));lastTime=now;
  if(!document.hidden) {
    if(screen==='game'&&!paused&&!$('modal').open) {
      if(tick(state,dt))onWin();uiClock+=dt;
      if(uiClock>.2){$('time-value').textContent=formatTime(state.elapsed);uiClock=0;}
      if(state.phase==='running')$('flow-progress').style.width=Math.min(100,100*state.flow/flowDuration(state))+'%';
    }
    scene?.render(now/1000);
  }
  requestAnimationFrame(animate);
}
$('settings-button').innerHTML=icon('settings');$('capture-button').innerHTML=icon('camera');
try {
  const {CabinetScene}=await import('./scene.js');
  scene=new CabinetScene($('viewport'),store.profile.settings,p=>handleCell(p),message=>toast(message,true));
}catch(err){console.warn('3D renderer unavailable:',err.message);$('render-fallback').hidden=false;}
applySettings();showHome();updateSaveLabel();if(store.error)toast(store.error,true);requestAnimationFrame(animate);
// Optional offline cache for a hosted copy. The single-file edition is offline without a service worker.
if('serviceWorker'in navigator&&location.protocol!=='file:'&&document.querySelector('meta[name="strata-build"]'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
// Diagnostics are opt-in and intentionally absent on the normal URL.
if(globalThis.__STRATA_ENABLE_TEST__===true||new URLSearchParams(location.search).get('test')==='1') {
  globalThis.__STRATA_TEST__={
    getState:()=>serializeState(state),getProfile:()=>copy(store.profile),getPhase:()=>state.phase,getScreen:()=>screen,
    levels:()=>copy(CAMPAIGN),load:i=>startLevel(CAMPAIGN[i]),select:i=>select(i),step:p=>handleCell(p),hint:()=>doHint(),run:()=>run(),
    advance:dt=>{if(tick(state,dt))onWin();},view:n=>scene?.view(n),slice:v=>scene?.setSlice(v),stats:()=>scene?.stats(),project:p=>scene?.screenPosition(p),
    close:()=>closeModal(),save:()=>saveNow(),home:()=>showHome(),showLevels,sceneCapture:()=>scene?.capture(),
    setState:s=>{state=restoreState(s);screen='game';$('app').className='mode-game';scene?.load(state);updateUI();},
    resize:()=>scene?.resize(),presentation:v=>togglePresentation(v),getPresentation:()=>presentation
  };
}
