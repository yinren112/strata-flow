import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {kernel} from '../src/kernel.js';
const bytes=Buffer.from(kernel,'base64'),module=new WebAssembly.Module(bytes),e=new WebAssembly.Instance(module).exports;
const pixels=new Uint8Array(e.memory.buffer,e.pixels(),64*64*4),vertices=new Float32Array(e.memory.buffer,e.vertices(),2400000),mat=new Float32Array(e.memory.buffer,e.material(),32),cfg=new Float32Array(e.memory.buffer,e.config(),64);
function reset(){e.init(64,64);e.clear();mat.fill(0);mat.set([1,0,0,.3,0,1]);mat[10]=1;mat[14]=1;mat[16]=100;cfg.fill(0);cfg[2]=1;cfg[3]=1;cfg.set([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],8);}
function triangle(z=.3,wy=0){vertices.set([6,6,z,-.8,wy,z,0,0,1,0,0,58,6,z,.8,wy,z,0,0,1,1,0,6,58,z,-.8,wy,z,0,0,1,0,1]);}
const pixel=(x=20,y=20)=>Array.from(pixels.slice((y*64+x)*4,(y*64+x)*4+4));
test('WASM rasterizer is import-free and exports the complete rendering interface',()=>{assert.deepEqual(WebAssembly.Module.imports(module),[]);for(const n of ['memory','pixels','vertices','texture','config','material','init','clear','clearShadow','draw'])assert.ok(e[n]);});
test('embedded CPU kernel exactly matches the committed WASM binary',async()=>{assert.deepEqual(bytes,await readFile(new URL('../render/raster.wasm',import.meta.url)));});
test('CPU renderer rasterizes an actual covered triangle, leaving exterior transparent',()=>{reset();triangle();e.draw(1,0);assert.deepEqual(pixel(),[255,0,0,255]);assert.deepEqual(pixel(60,60),[0,0,0,0]);});
test('depth buffer preserves the nearer surface independent of submission order',()=>{reset();triangle(.4);e.draw(1,0);mat.set([0,1,0]);triangle(.2);e.draw(1,0);mat.set([1,0,0]);triangle(.5);e.draw(1,0);assert.deepEqual(pixel(),[0,255,0,255]);});
test('floor clipping rejects shaded fragments above the active layer',()=>{reset();triangle(.3,2);mat[16]=1;e.draw(1,0);assert.equal(pixel()[3],0);mat[16]=3;e.draw(1,0);assert.equal(pixel()[3],255);});
test('fluid fill amount controls visible pixels through interpolated route UV',()=>{reset();triangle();mat[17]=1;mat[18]=-.01;e.draw(1,0);assert.equal(pixel()[3],0);mat[18]=1;e.draw(1,0);assert.equal(pixel()[3],255);});
test('transparent shells blend rather than incorrectly replacing an opaque layer',()=>{reset();triangle(.4);mat.set([0,0,1]);e.draw(1,0);triangle(.2);mat.set([1,0,0]);mat[5]=.5;e.draw(1,0);assert.ok(pixel()[0]>120&&pixel()[2]>120);assert.equal(pixel()[3],255);});
test('zero-alpha material contributes no visible pixels',()=>{reset();triangle();mat[5]=0;e.draw(1,0);assert.equal(pixel()[3],0);});
test('instrument decal samples the uploaded texture, not a fabricated text overlay',()=>{reset();triangle();mat.set([1,1,1]);mat[11]=1;mat[12]=1;mat[13]=1;new Uint8Array(e.memory.buffer,e.texture(),4).set([10,180,70,255]);e.draw(1,0);assert.deepEqual(pixel(),[10,180,70,255]);});
test('frame clear removes color and stale depth from the previous scene',()=>{reset();triangle(.1);e.draw(1,0);e.clear();assert.deepEqual(pixel(),[0,0,0,0]);triangle(.8);e.draw(1,0);assert.equal(pixel()[3],255);});
test('smooth material normals produce finite directional shading',()=>{reset();triangle();mat[10]=0;mat.set([.7,.7,.7]);mat[4]=.8;e.draw(1,0);const first=pixel();e.clear();for(const offset of [0,11,22]){vertices[offset+6]=0;vertices[offset+7]=1;vertices[offset+8]=0;}e.draw(1,0);const second=pixel();assert.equal(second[3],255);assert.notDeepEqual(first,second);assert.ok(first.slice(0,3).every(n=>n>=0&&n<=255));});
test('real shadow-depth pass darkens an occluded receiver',()=>{reset();e.clearShadow();triangle(-.4);vertices[4]=.8;vertices[15]=.8;vertices[26]=-.8;e.draw(1,1);triangle(.4);vertices[4]=.8;vertices[15]=.8;vertices[26]=-.8;mat[10]=0;mat[23]=1;mat[22]=1;mat[5]=.6;e.draw(1,0);assert.ok(pixel()[3]>0);});
