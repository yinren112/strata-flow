/** Pure deterministic rules. Coordinates are [x, y, z], y increases upward. */
export const key = p => p.join(',');
export const same = (a, b) => !!a && !!b && a.every((v, i) => v === b[i]);
export const distance = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
export const copy = value => JSON.parse(JSON.stringify(value));
export const DIRECTIONS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export const inBounds = (level, p) => Array.isArray(p) && p.length === 3 && p.every(Number.isInteger) && p[0]>=0 && p[0]<level.size && p[1]>=0 && p[1]<level.height && p[2]>=0 && p[2]<level.size;
export const neighbors = (level, p) => DIRECTIONS.map(d => p.map((v,i)=>v+d[i])).filter(q=>inBounds(level,q));
export const ups = path => path.reduce((n,p,i)=>n+(i>0 && p[1]>path[i-1][1] ? 1:0),0);
export const length = state => state.paths.reduce((n,p)=>n+Math.max(0,p.length-1),0);
export const pumpCount = state => state.level.gravity ? state.paths.reduce((n,p)=>n+ups(p),0) : 0;
export const connected = (state, i) => same(state.paths[i]?.at(-1), state.level.circuits[i]?.end);
export const connectedCount = state => state.paths.filter((_,i)=>connected(state,i)).length;
export const allConnected = state => connectedCount(state) === state.level.circuits.length;

export function validateLevel(input) {
  if (!input || typeof input!=='object') throw new Error('关卡必须是 JSON 对象。');
  const l = copy(input);
  if (!Number.isInteger(l.size) || l.size<3 || l.size>7 || !Number.isInteger(l.height) || l.height<2 || l.height>5) throw new Error('尺寸须为 3–7 格，楼层须为 2–5 层。');
  if (!Array.isArray(l.circuits) || l.circuits.length<1 || l.circuits.length>4) throw new Error('支持 1–4 条液体回路。');
  if (!Array.isArray(l.blocks) || l.blocks.length>170) throw new Error('障碍物数量不合法。');
  l.gravity=!!l.gravity;
  if (!Number.isInteger(l.pumps) || l.pumps<0 || l.pumps>60) throw new Error('泵额度须为 0–60。');
  l.id=String(l.id||'custom').slice(0,80); l.name=String(l.name||'自定义实验').slice(0,40);
  l.subtitle=String(l.subtitle||'CUSTOM EXPERIMENT').slice(0,80);
  l.tip=String(l.tip||'连接每一组同字母端口，避开设备与其他管路。').slice(0,180);
  const occupied = new Set();
  for (const p of l.blocks) {
    if (!inBounds(l,p) || occupied.has(key(p))) throw new Error('障碍物越界或重复。');
    occupied.add(key(p));
  }
  for (let i=0;i<l.circuits.length;i++) {
    const c=l.circuits[i];
    if (!c || !inBounds(l,c.start) || !inBounds(l,c.end) || same(c.start,c.end)) throw new Error('端口坐标不合法。');
    for(const p of [c.start,c.end]) { if(occupied.has(key(p))) throw new Error('端口与障碍或其他端口重叠。'); occupied.add(key(p)); }
    c.id=String.fromCharCode(65+i);
  }
  if (!Array.isArray(l.solution) || l.solution.length!==l.circuits.length) throw new Error('关卡必须包含可验证的参考路线 solution。');
  const used=new Set(l.blocks.map(key)); let total=0, up=0;
  for(let i=0;i<l.solution.length;i++) {
    const p=l.solution[i]; const c=l.circuits[i];
    if(!Array.isArray(p) || p.length<2 || p.length>l.size*l.size*l.height || !same(p[0],c.start) || !same(p.at(-1),c.end)) throw new Error('参考路线端点不匹配。');
    for(let j=0;j<p.length;j++) {
      if(!inBounds(l,p[j]) || used.has(key(p[j])) || (j>0 && distance(p[j-1],p[j])!==1)) throw new Error('参考路线断开、重叠或穿过障碍。');
      used.add(key(p[j]));
    }
    total+=p.length-1; up+=ups(p);
  }
  if(l.gravity && up>l.pumps) throw new Error('参考路线超出泵额度。');
  l.par=total; l.chapter=Number.isInteger(l.chapter)?Math.max(0,Math.min(3,l.chapter)):0;
  return l;
}

export function createState(level) {
  const safe=validateLevel(level);
  return {level:safe,paths:safe.circuits.map(c=>[copy(c.start)]),selected:0,layer:safe.circuits[0].start[1],moves:0,hints:0,elapsed:0,phase:'editing',flow:0,history:[],future:[],ghost:null};
}
const snapshot = s => ({paths:copy(s.paths),selected:s.selected,layer:s.layer,moves:s.moves});
const applySnapshot = (s,v) => {s.paths=copy(v.paths);s.selected=v.selected;s.layer=v.layer;s.moves=v.moves;s.phase='editing';s.flow=0;s.ghost=null;};
function saveHistory(s) { s.history.push(snapshot(s)); if(s.history.length>240)s.history.shift(); s.future=[]; }
export function selectCircuit(s,i) {
  if(!Number.isInteger(i)||i<0||i>=s.paths.length)return false;
  s.selected=i;s.layer=s.paths[i].at(-1)[1];s.ghost=null;return true;
}
export function reasonForMove(s,p,i=s.selected) {
  if(s.phase!=='editing')return '试运行期间不能修改管路。';
  if(!inBounds(s.level,p))return '已经到达机柜边界。';
  const path=s.paths[i],head=path.at(-1);
  if(same(p,head))return '这里已经是管路末端。';
  if(path.some(q=>same(q,p)))return null; // Clicking a previous node explicitly trims the route.
  if(connected(s,i))return '这条回路已接通。点击已有管路节点可以回退。';
  if(distance(head,p)!==1)return '只能连接相邻格点；跨层请使用升降按钮。';
  if(s.level.blocks.some(q=>same(q,p)))return '设备占用了这个格点，请绕行。';
  for(let j=0;j<s.paths.length;j++)if(j!==i) {
    const c=s.level.circuits[j];
    if(same(p,c.start)||same(p,c.end)||s.paths[j].some(q=>same(q,p)))return '不同液体不能共用格点，请从另一层绕过。';
  }
  if(s.level.gravity && p[1]>head[1] && pumpCount(s)>=s.level.pumps)return '泵额度已用完：每上升一格需要一台泵。';
  return null;
}
export function step(s,p) {
  const reason=reasonForMove(s,p); if(reason)return {ok:false,reason};
  saveHistory(s);
  const path=s.paths[s.selected],index=path.findIndex(q=>same(q,p));
  if(index>=0)path.splice(index+1);else path.push(copy(p));
  s.layer=p[1];s.moves++;s.ghost=null;
  return {ok:true,connected:connected(s,s.selected),ready:allConnected(s),backtrack:index>=0};
}
export function clearCircuit(s) {
  if(s.phase!=='editing'||s.paths[s.selected].length===1)return false;
  saveHistory(s);s.paths[s.selected]=[copy(s.level.circuits[s.selected].start)];s.moves++;s.layer=s.paths[s.selected][0][1];s.ghost=null;return true;
}
export function undo(s) {
  if(s.phase!=='editing'||!s.history.length)return false;
  s.future.push(snapshot(s));applySnapshot(s,s.history.pop());return true;
}
export function redo(s) {
  if(s.phase!=='editing'||!s.future.length)return false;
  s.history.push(snapshot(s));applySnapshot(s,s.future.pop());return true;
}
export function reachableMoves(s) {
  if(s.phase!=='editing'||connected(s,s.selected))return [];
  return neighbors(s.level,s.paths[s.selected].at(-1)).filter(p=>!reasonForMove(s,p));
}

/** Shortest continuation with a bounded ascent state; never crosses another circuit. */
export function findContinuation(s,i=s.selected) {
  if(connected(s,i))return [];
  const current=s.paths[i],start=current.at(-1),goal=s.level.circuits[i].end;
  const forbidden=new Set(s.level.blocks.map(key));
  for(let j=0;j<s.paths.length;j++) {
    if(j===i) { current.slice(0,-1).forEach(p=>forbidden.add(key(p))); continue; }
    s.paths[j].forEach(p=>forbidden.add(key(p)));
    forbidden.add(key(s.level.circuits[j].start));forbidden.add(key(s.level.circuits[j].end));
  }
  const remaining=s.level.gravity?s.level.pumps-pumpCount(s):0;
  const queue=[{p:start,used:0,parent:-1}],seen=new Set([key(start)+'|0']);let at=0,found=-1;
  while(at<queue.length) {
    const node=queue[at];
    if(same(node.p,goal)){found=at;break;}
    for(const p of neighbors(s.level,node.p)) {
      if(forbidden.has(key(p)))continue;
      const used=node.used+(s.level.gravity && p[1]>node.p[1]?1:0);
      if(used>remaining)continue;
      const id=key(p)+'|'+used;
      if(seen.has(id))continue;seen.add(id);queue.push({p,used,parent:at});
    }
    at++;
  }
  if(found<0)return null;
  const path=[];while(found>=0){path.push(queue[found].p);found=queue[found].parent;}
  return path.reverse().slice(1);
}
export function hint(s) {
  if(s.phase!=='editing')return {ok:false,reason:'请先停止试运行。'};
  let i=s.selected;
  if(connected(s,i))i=s.paths.findIndex((_,j)=>!connected(s,j));
  if(i<0)return {ok:false,reason:'所有回路已经接通，点击「试运行」。'};
  selectCircuit(s,i);
  const current=s.paths[i],reference=s.level.solution[i];
  let target=null;
  if(current.every((p,j)=>same(p,reference[j]))) {
    const next=reference[current.length];if(next&&!reasonForMove(s,next))target=next;
  }
  if(!target) {const continuation=findContinuation(s,i);target=continuation?.[0];}
  if(!target)return {ok:false,reason:'当前布局挡住了出口。撤回一部分管路，或先布置其他回路。'};
  s.hints++;s.ghost=copy(target);
  return {ok:true,target};
}
export function startFlow(s) {
  if(s.phase!=='editing')return {ok:false,reason:'当前不在布管模式。'};
  if(!allConnected(s)) {
    const i=s.paths.findIndex((_,j)=>!connected(s,j));selectCircuit(s,i);
    return {ok:false,reason:`回路 ${s.level.circuits[i].id} 尚未接通，请连接到同字母出口。`};
  }
  s.phase='running';s.flow=0;s.ghost=null;return {ok:true};
}
export const flowDuration = s => 1.8+Math.max(...s.paths.map(p=>p.length-1))*.13;
export function tick(s,dt) {
  if(!Number.isFinite(dt)||dt<=0)return false;
  if(s.phase==='editing'||s.phase==='running')s.elapsed+=dt;
  if(s.phase==='running') {
    s.flow+=dt;
    if(s.flow>=flowDuration(s)){s.flow=flowDuration(s);s.phase='won';return true;}
  }
  return false;
}
export function stopFlow(s) {if(s.phase==='running'){s.phase='editing';s.flow=0;return true;}return false;}
export function score(s) { return 1+(length(s)<=s.level.par?1:0)+(s.hints===0?1:0); }

export function serializeState(s) {
  return {level:s.level,paths:copy(s.paths),selected:s.selected,layer:s.layer,moves:s.moves,hints:s.hints,elapsed:s.elapsed,won:s.phase==='won'};
}
export function restoreState(saved) {
  if(!saved||typeof saved!=='object')throw new Error('存档为空。');
  const s=createState(saved.level);
  if(!Array.isArray(saved.paths)||saved.paths.length!==s.paths.length)throw new Error('存档回路数量不匹配。');
  for(let i=0;i<saved.paths.length;i++) {
    const path=saved.paths[i];if(!Array.isArray(path)||!same(path[0],s.level.circuits[i].start))throw new Error('存档起点损坏。');
    selectCircuit(s,i);
    for(const p of path.slice(1)) {const result=step(s,p);if(!result.ok)throw new Error('存档路线不合法：'+result.reason);}
    if(s.paths[i].length!==path.length)throw new Error('存档路线包含回路重复。');
  }
  s.selected=Number.isInteger(saved.selected)&&saved.selected>=0&&saved.selected<s.paths.length?saved.selected:0;
  s.layer=Number.isInteger(saved.layer)?Math.max(0,Math.min(s.level.height-1,saved.layer)):s.paths[s.selected].at(-1)[1];
  s.moves=Number.isInteger(saved.moves)?Math.max(0,Math.min(1e7,saved.moves)):0;
  s.hints=Number.isInteger(saved.hints)?Math.max(0,Math.min(1e7,saved.hints)):0;
  s.elapsed=Number.isFinite(saved.elapsed)?Math.max(0,Math.min(1e8,saved.elapsed)):0;
  s.history=[];s.future=[];
  if(saved.won&&allConnected(s)){s.phase='won';s.flow=flowDuration(s);}
  return s;
}
