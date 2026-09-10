import {key, copy, distance, neighbors, ups, validateLevel} from './engine.js';
export const COLORS=['#41c5a4','#eab15f','#82afe4','#d388b2'];
export const FLUIDS=['薄荷冷却液','琥珀导热液','蓝色净水','莓色营养液'];
export const CHAPTERS=[
  {title:'空间入门',en:'SPATIAL THINKING',desc:'让管路离开平面。'},
  {title:'错层交汇',en:'CROSSING WITHOUT COLLISION',desc:'没有死路，只有还没发现的楼层。'},
  {title:'顺势而流',en:'GRAVITY & PUMPS',desc:'每一次抬升，都有它的代价。'},
  {title:'精密机房',en:'THE FINAL SYSTEM',desc:'让四种液体，在有限空间里各行其道。'}
];
export function route(...points) {
  const result=[copy(points[0])];
  for(const next of points.slice(1)) {
    let p=result.at(-1);
    if(p.filter((v,i)=>v!==next[i]).length!==1)throw new Error('每个路标必须沿单一坐标轴。');
    while(distance(p,next)) {const i=p.findIndex((v,j)=>v!==next[j]);p=p.map((v,j)=>v+(i===j?Math.sign(next[i]-v):0));result.push(p);}
  }
  return result;
}
function make(id,name,subtitle,tip,size,height,solution,blocks=[],gravity=false,pumps=0,chapter=0) {
  return validateLevel({id,name,subtitle,tip,size,height,solution,blocks,gravity,pumps,chapter,circuits:solution.map(p=>({start:p[0],end:p.at(-1)}))});
}
export function rng(seed) {
  let h=2166136261;for(const c of String(seed)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  return ()=> {h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
const shuffle=(a,r)=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

/** Generate solutions first, reserve every solution cell, then add obstacles. */
export function generateLevel(seed,opts={}) {
  const size=[4,5,6,7].includes(opts.size)?opts.size:5;
  const height=[2,3,4,5].includes(opts.height)?opts.height:4;
  const count=Math.max(1,Math.min(4,Math.trunc(opts.count||3)));
  const gravity=!!opts.gravity,complexity=Math.max(1,Math.min(3,Math.trunc(opts.complexity||2)));
  const r=rng(seed),level={size,height},occupied=new Set(),solutions=[];
  const boundary=[];for(let y=0;y<height;y++)for(let x=0;x<size;x++)for(let z=0;z<size;z++)if(x===0||z===0||x===size-1||z===size-1)boundary.push([x,y,z]);
  for(let i=0;i<count;i++) {
    let best=null;
    for(let attempt=0;attempt<160;attempt++) {
      const free=boundary.filter(p=>!occupied.has(key(p)));if(!free.length)break;
      const start=copy(free[Math.floor(r()*free.length)]),path=[start],visited=new Set([key(start)]);
      const targetLength=size+complexity*3+Math.floor(r()*4);
      while(path.length<targetLength) {
        const p=path.at(-1);
        let ns=shuffle(neighbors(level,p).filter(q=>!occupied.has(key(q))&&!visited.has(key(q))),r);
        // Prefer long horizontal sections over noisy staircase routes.
        if(path.length>1&&r()<.56) {
          const prev=path.at(-2),dir=p.map((v,j)=>v-prev[j]);
          ns.sort((a,b)=>Number(b.every((v,j)=>v-p[j]===dir[j]))-Number(a.every((v,j)=>v-p[j]===dir[j])));
        }
        if(!ns.length)break;
        const next=ns[0];path.push(next);visited.add(key(next));
      }
      // Finish on an accessible cabinet face, not in the middle of a block.
      while(path.length>3&&!boundary.some(q=>key(q)===key(path.at(-1))))path.pop();
      const displacement=distance(path[0],path.at(-1));
      const vertical=new Set(path.map(p=>p[1])).size;
      const quality=path.length+displacement*2+vertical*3;
      if(displacement>=Math.min(size,4)&&vertical>=Math.min(height,2)&&(best===null||quality>best.quality))best={path,quality};
      if(best&&attempt>12)break;
    }
    if(!best) {
      // Deterministic guaranteed fallback: one independent horizontal lane per circuit.
      const fallback=Array.from({length:count},(_,j)=>route([0,j%height,Math.floor(j/height)*2],[size-1,j%height,Math.floor(j/height)*2]));
      return make(`seed-${seed}`,'独立回路','GENERATED EXPERIMENT','在独立通道里练习精简布线。',size,height,fallback,[],gravity,0);
    }
    solutions.push(best.path);best.path.forEach(p=>occupied.add(key(p)));
  }
  const empty=[];for(let y=0;y<height;y++)for(let x=0;x<size;x++)for(let z=0;z<size;z++)if(!occupied.has(key([x,y,z])))empty.push([x,y,z]);
  const blockCount=Math.min(empty.length, Math.round(size*complexity*1.7));
  const blocks=shuffle(empty,r).slice(0,blockCount);
  const pumps=gravity?solutions.reduce((s,p)=>s+ups(p),0):0;
  return make(`seed-${seed}`,'自由实验','PROCEDURAL / VERIFIED','参考路线已自动校验。可以尝试比参考路线更短的布管方案。',size,height,solutions,blocks,gravity,pumps);
}

const first=[
  make('c01','第一股流','A SMALL BEGINNING','选中 A 回路，依次点击发光的相邻格点；连接 A 出口后点击「试运行」。',4,2,[route([0,0,1],[3,0,1])]),
  make('c02','多一层可能','A NEW DIMENSION','设备挡住了直线。尝试升到 L2，从上方越过它，再回到 L1。',4,3,[route([0,0,1],[0,1,1],[3,1,1],[3,0,1])],[[1,0,1],[2,0,1],[1,0,0],[1,0,2],[2,0,2]]),
  make('c03','互不打扰','TOGETHER, APART','A 与 B 在平面上交叉，但它们可以处在不同楼层。没有填满整个机柜的要求。',5,3,[route([0,0,2],[4,0,2]),route([2,0,0],[2,1,0],[2,1,4],[2,0,4])]),
  make('c04','转角之外','AROUND THE CORNER','点击已经铺过的节点可直接回退到那里。撤销也会退回一次有效操作。',5,3,[route([0,0,1],[0,1,1],[3,1,1],[3,1,4]),route([4,0,0],[4,2,0],[1,2,0],[1,2,4])],[[1,0,1],[2,0,1],[3,0,1],[3,0,2],[3,0,3],[2,1,2],[2,1,3]]),
  make('c05','第三种颜色','THREE LITTLE RIVERS','先看端口所在楼层，再安排三条回路。切层只改变观察层，不会自动接管。',5,4,[route([0,0,1],[4,0,1]),route([0,2,3],[4,2,3],[4,0,3]),route([2,0,0],[2,1,0],[2,1,4])],[[1,0,3],[1,1,3],[3,1,1],[3,2,1],[1,2,1],[3,0,0]]),
  make('c06','透明的秩序','A CLEAR LITTLE SYSTEM','转动机柜看背面的空间，也可以在右侧楼层板精确布线。',5,4,[route([0,0,2],[0,2,2],[4,2,2],[4,0,2]),route([2,0,0],[2,1,0],[2,1,4]),route([0,3,0],[4,3,0],[4,3,4],[0,3,4])],[[1,0,2],[2,0,2],[3,0,2],[1,1,2],[3,1,2],[1,2,4],[1,1,4]])
];
const names=[
 ['纵横之间','CROSSING LINES'],['中庭绕行','AROUND THE ATRIUM'],['背面的路','THE HIDDEN SIDE'],['层层相让','ROOM FOR EVERY RIVER'],['交错回廊','INTERLACED CORRIDORS'],['立体结','A KNOT IN SPACE'],
 ['顺流而下','FOLLOW THE FALL'],['第一台泵','THE FIRST LIFT'],['水往高处','A LITTLE AGAINST GRAVITY'],['有限抬升','EVERY LIFT COUNTS'],['重力回廊','GRAVITY CORRIDORS'],['势能之间','POTENTIAL & PATIENCE'],
 ['四路同归','FOUR STREAMS'],['静默机房','THE QUIET MACHINE'],['密集换热','THE HEAT EXCHANGE'],['一格之差','ONE CELL AWAY'],['精密共生','A PRECISE COEXISTENCE'],['流层','PERFECTLY IN FLOW']
];
export const CAMPAIGN=[...first];
for(let n=6;n<24;n++) {
  const chapter=Math.floor(n/6), [name,subtitle]=names[n-6];
  const l=generateLevel('STRATA-CAMPAIGN-'+String(n+1),{size:chapter===3?6:5,height:chapter===3?4:3+(n%2),count:chapter===3?4:3,gravity:chapter>=2,complexity:chapter===3?3:2});
  Object.assign(l,{id:'c'+String(n+1).padStart(2,'0'),name,subtitle,chapter,tip:chapter===2?'平移与下降自由；每上升一格自动安装一台泵，并消耗一份额度。':'多回路会互相占用空间。先规划难走的回路，再用剩余楼层连接其他回路。'});
  CAMPAIGN.push(l);
}
// Dedicated gravity lessons precede the multi-circuit challenges.
CAMPAIGN[12]=make('c13','顺流而下','FOLLOW THE FALL','本关没有泵，不能上升。先把高处的液体引下来。',5,3,[route([0,2,1],[4,2,1],[4,0,1]),route([2,2,4],[2,1,4],[2,1,0],[2,0,0])],[[1,0,1],[2,0,1],[3,0,1],[2,2,2]],true,0,2);
CAMPAIGN[13]=make('c14','第一台泵','THE FIRST LIFT','A 出口比入口高一层。第一次上升会自动装泵；下降不返还额度，撤回上升段才会返还。',5,3,[route([0,0,1],[0,1,1],[4,1,1]),route([0,2,3],[4,2,3],[4,0,3])],[[1,0,1],[2,0,1],[3,0,1],[2,1,3]],true,1,2);
export const DEMO=make('demo','流动的微型世界','THE ART OF FINDING A WAY','',5,4,[
 route([0,0,0],[0,2,0],[3,2,0],[3,2,3],[4,2,3],[4,0,3]),
 route([0,0,4],[1,0,4],[1,1,4],[1,1,1],[4,1,1],[4,0,1]),
 route([4,3,4],[0,3,4],[0,3,2],[2,3,2],[2,0,2]),
 route([4,0,4],[4,1,4],[3,1,4],[3,1,2],[3,0,2],[3,0,0])
],[[1,0,0],[2,0,0],[0,0,2],[0,1,2],[2,0,4],[2,1,0],[3,0,3],[0,2,4],[4,2,0]],true,4);
export const getDateKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function dailyLevel(date=getDateKey()) {
  const l=generateLevel('daily-'+date,{size:5,height:4,count:3,complexity:3,gravity:true});
  l.id='daily-'+date;l.name='每日一流';l.subtitle=date+' / DAILY FLOW';l.tip='所有使用同一本机日期的玩家获得同一关卡。成绩仅保存在本机。';return l;
}
