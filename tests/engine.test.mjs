import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import {CAMPAIGN,DEMO,generateLevel,dailyLevel,route,rng} from '../src/levels.js';
const solve=(s)=>{s.level.solution.forEach((path,i)=>{E.selectCircuit(s,i);for(const p of path.slice(1)){const result=E.step(s,p);assert.equal(result.ok,true,`${s.level.id} circuit ${i} ${p}: ${result.reason}`);}});return s;};
const finish=s=>{assert.equal(E.startFlow(s).ok,true);assert.equal(E.tick(s,E.flowDuration(s)),true);return s;};
const simple=()=>E.createState(CAMPAIGN[0]);

for(const level of CAMPAIGN) test(`campaign ${level.id}: every reference move legal, pumps sufficient, simulation and 3 stars`,()=>{
  const s=solve(E.createState(level));assert.equal(E.allConnected(s),true);assert.equal(E.length(s),level.par);assert.ok(E.pumpCount(s)<=level.pumps);
  finish(s);assert.equal(s.phase,'won');assert.equal(E.score(s),3);assert.equal(E.tick(s,10),false);assert.equal(E.step(s,[0,0,0]).ok,false);
});
test('demo scene is a fully legal solved puzzle',()=>finish(solve(E.createState(DEMO))));
test('starts at each inlet, not a pre-solved board',()=>{const s=E.createState(CAMPAIGN[5]);assert.equal(E.length(s),0);assert.equal(E.connectedCount(s),0);assert.equal(s.history.length,0);});
test('non-adjacent, diagonal, negative, fractional and malformed cells reject without mutation',()=>{
  const s=simple(),before=E.serializeState(s);
  for(const p of [[2,0,1],[1,1,1],[-1,0,1],[1.5,0,1],[0,0],[0,0,1,0],null,'bad',[NaN,0,1],[0,2,1]])assert.equal(E.step(s,p).ok,false);
  assert.deepEqual(E.serializeState(s),before);assert.equal(s.history.length,0);
});
test('obstacle occupancy is enforced',()=>{const s=E.createState(CAMPAIGN[1]);assert.equal(E.step(s,[1,0,1]).ok,false);assert.equal(E.length(s),0);});
test('other circuit inlets and outlets are reserved even before drawing',()=>{
  const l={id:'reserved',size:3,height:2,pumps:0,gravity:false,blocks:[],circuits:[{start:[0,0,0],end:[0,0,2]},{start:[1,0,0],end:[1,0,2]}],solution:[route([0,0,0],[0,0,2]),route([1,0,0],[1,0,2])]};
  const s=E.createState(l);assert.equal(E.step(s,[1,0,0]).ok,false);E.step(s,[0,0,1]);E.step(s,[0,0,2]);assert.equal(E.step(s,[1,0,2]).ok,false);
});
test('same-layer crossing is illegal; separate layers are legal',()=>{
  const s=E.createState(CAMPAIGN[2]);for(const p of s.level.solution[0].slice(1))E.step(s,p);E.selectCircuit(s,1);
  assert.equal(E.step(s,[2,0,1]).ok,true);assert.equal(E.step(s,[2,0,2]).ok,false);
  assert.equal(E.step(s,[2,1,1]).ok,true);assert.equal(E.step(s,[2,1,2]).ok,true);assert.equal(E.step(s,[2,1,3]).ok,true);assert.equal(E.step(s,[2,1,4]).ok,true);assert.equal(E.step(s,[2,0,4]).ok,true);assert.equal(E.allConnected(s),true);
});
test('clicking earlier own cell truncates, never branches or creates loops',()=>{
  const s=simple();E.step(s,[1,0,1]);E.step(s,[2,0,1]);assert.equal(E.step(s,[0,0,1]).backtrack,true);assert.equal(E.length(s),0);
});
test('completed route can be trimmed and redone',()=>{const s=solve(simple());assert.equal(E.step(s,[2,0,1]).backtrack,true);assert.equal(E.allConnected(s),false);E.undo(s);assert.equal(E.allConnected(s),true);E.redo(s);assert.equal(E.length(s),2);});
test('undo and redo restore layer, selected circuit and routes',()=>{
  const s=E.createState(CAMPAIGN[2]);E.step(s,[1,0,2]);E.selectCircuit(s,1);E.step(s,[2,1,0]);E.undo(s);assert.equal(s.selected,1);assert.equal(s.layer,0);assert.equal(s.paths[1].length,1);E.redo(s);assert.equal(s.layer,1);assert.equal(s.paths[1].length,2);
});
test('new edit clears redo and clear can be undone',()=>{const s=simple();E.step(s,[1,0,1]);E.undo(s);E.step(s,[0,1,1]);assert.equal(E.redo(s),false);E.clearCircuit(s);assert.equal(E.length(s),0);E.undo(s);assert.equal(E.length(s),1);});
test('history is bounded to 240 entries',()=>{const s=simple();for(let n=0;n<310;n++){E.step(s,[1,0,1]);E.step(s,[0,0,1]);}assert.equal(s.history.length,240);});
test('zero-pump gravity prohibits ascent, allows horizontal and descent',()=>{
  const s=E.createState(CAMPAIGN[12]);E.step(s,[0,1,1]);assert.equal(E.step(s,[1,1,1]).ok,true);assert.equal(E.step(s,[1,2,1]).ok,false);assert.equal(E.step(s,[0,1,1]).ok,true);assert.equal(E.step(s,[0,0,1]).ok,true);
});
test('upward segment spends pump; descending does not refund; trimming and undo do',()=>{
  const s=E.createState(CAMPAIGN[13]);E.step(s,[0,1,1]);assert.equal(E.pumpCount(s),1);assert.equal(E.step(s,[0,2,1]).ok,false);E.step(s,[0,1,0]);E.step(s,[0,0,0]);assert.equal(E.pumpCount(s),1);E.step(s,[0,0,1]);assert.equal(E.pumpCount(s),0);E.undo(s);assert.equal(E.pumpCount(s),1);E.redo(s);assert.equal(E.pumpCount(s),0);
});
test('free pressure mode permits ascent without a pump budget',()=>{const s=simple();assert.equal(E.step(s,[0,1,1]).ok,true);assert.equal(E.pumpCount(s),0);});
test('cannot start flow until every circuit is connected',()=>{const s=E.createState(CAMPAIGN[2]);assert.equal(E.startFlow(s).ok,false);s.level.solution[0].slice(1).forEach(p=>E.step(s,p));assert.equal(E.startFlow(s).ok,false);assert.equal(s.selected,1);});
test('flow locks edits, clears hint and can be stopped',()=>{const s=solve(simple());E.startFlow(s);assert.equal(E.clearCircuit(s),false);assert.equal(E.undo(s),false);assert.equal(E.hint(s).ok,false);assert.equal(E.step(s,[1,0,1]).ok,false);E.tick(s,.5);assert.equal(E.stopFlow(s),true);assert.equal(s.phase,'editing');assert.equal(s.flow,0);});
test('invalid delta times are ignored',()=>{const s=simple();for(const dt of [-1,0,NaN,Infinity])assert.equal(E.tick(s,dt),false);assert.equal(s.elapsed,0);E.tick(s,1);assert.equal(s.elapsed,1);});
test('hint shows one legal next cell and does not auto-complete',()=>{const s=simple();const h=E.hint(s);assert.equal(h.ok,true);assert.deepEqual(h.target,[1,0,1]);assert.equal(E.length(s),0);assert.equal(s.hints,1);assert.deepEqual(s.ghost,h.target);});
test('undo cannot erase hint use for an independent-solve star',()=>{const s=simple();E.hint(s);E.step(s,[1,0,1]);E.undo(s);assert.equal(s.hints,1);finish(solve(s));assert.equal(E.score(s),2);});
test('non-reference continuation uses collision-aware BFS',()=>{const s=simple();E.step(s,[0,1,1]);const route=E.findContinuation(s);assert.ok(route.length>0);for(const p of route)assert.equal(E.step(s,p).ok,true);assert.equal(E.connected(s,0),true);});
test('hint identifies blockage rather than fabricating a move',()=>{
  const s=simple();s.level.blocks.push([1,0,1],[0,0,0],[0,0,2],[0,1,1]);assert.equal(E.findContinuation(s),null);assert.equal(E.hint(s).ok,false);assert.equal(s.hints,0);
});
test('stars use a feasible reference bound, not a claimed mathematical optimum',()=>{
  const s=simple();E.step(s,[0,1,1]);E.step(s,[1,1,1]);E.step(s,[2,1,1]);E.step(s,[3,1,1]);E.step(s,[3,0,1]);finish(s);assert.equal(E.score(s),2);s.hints=1;assert.equal(E.score(s),1);
});
test('serialize restore roundtrip validates every route',()=>{
  const s=E.createState(CAMPAIGN[5]);s.level.solution[0].slice(1,4).forEach(p=>E.step(s,p));s.elapsed=91;s.hints=2;s.layer=2;
  const restored=E.restoreState(E.copy(E.serializeState(s)));assert.deepEqual(E.serializeState(restored),E.serializeState(s));assert.equal(restored.history.length,0);
});
test('running save resumes editing; completed save stays won',()=>{
  const s=solve(simple());E.startFlow(s);assert.equal(E.restoreState(E.serializeState(s)).phase,'editing');E.tick(s,100);assert.equal(E.restoreState(E.serializeState(s)).phase,'won');
});
test('forged won flag does not bypass missing connections',()=>{const saved=E.serializeState(simple());saved.won=true;assert.equal(E.restoreState(saved).phase,'editing');});
test('corrupt path, duplicate cells, foreign port and bad source saves reject',()=>{
  let saved=E.serializeState(simple());saved.paths[0].push([3,0,1]);assert.throws(()=>E.restoreState(saved));
  saved=E.serializeState(simple());saved.paths[0].push([1,0,1],[0,0,1]);assert.throws(()=>E.restoreState(saved));
  saved=E.serializeState(simple());saved.paths[0][0]=[1,0,1];assert.throws(()=>E.restoreState(saved));
  saved=E.serializeState(simple());saved.paths=[];assert.throws(()=>E.restoreState(saved));
});
test('level validator rejects invalid dimensions, endpoints, overlap, budget, and missing solution',()=>{
  for(const mutate of [l=>l.size=99,l=>l.height=1,l=>l.circuits=[],l=>l.pumps=-1,l=>l.blocks.push(l.circuits[0].start),l=>l.blocks.push([1,1,1],[1,1,1]),l=>l.solution=null,l=>l.solution[0][1]=[2,0,2],l=>l.circuits[0].end=l.circuits[0].start]){const l=E.copy(CAMPAIGN[0]);mutate(l);assert.throws(()=>E.validateLevel(l));}
  const l=E.copy(CAMPAIGN[13]);l.pumps=0;assert.throws(()=>E.validateLevel(l));
});
test('level validator returns a detached sanitized copy',()=>{const l=E.copy(CAMPAIGN[0]);l.name='x'.repeat(100);l.circuits[0].id='<script>';const v=E.validateLevel(l);assert.equal(v.name.length,40);assert.equal(v.circuits[0].id,'A');v.blocks.push([0,1,0]);assert.equal(l.blocks.length,0);});
test('reference route helper only permits axis-aligned waypoints',()=>{assert.throws(()=>route([0,0,0],[1,1,1]));assert.deepEqual(route([0,0,0],[2,0,0]),[[0,0,0],[1,0,0],[2,0,0]]);});
test('seeded random stream is reproducible',()=>{const a=rng('same'),b=rng('same');for(let i=0;i<100;i++)assert.equal(a(),b());});
test('daily levels are deterministic for a given local date',()=>{assert.deepEqual(dailyLevel('2026-09-10'),dailyLevel('2026-09-10'));assert.notDeepEqual(dailyLevel('2026-09-10'),dailyLevel('2026-09-11'));});
for(let batch=0;batch<8;batch++)test(`generated batch ${batch+1}/8: 25 varied seeds replay all solutions`,()=>{
  for(let j=0;j<25;j++){
    const i=batch*25+j,opts={size:4+(i%4),height:2+(Math.floor(i/4)%4),count:1+(Math.floor(i/16)%4),gravity:i%2===0,complexity:1+(i%3)},seed='stress-'+i;
    const level=generateLevel(seed,opts),again=generateLevel(seed,opts);assert.deepEqual(level,again);finish(solve(E.createState(level)));
  }
});
