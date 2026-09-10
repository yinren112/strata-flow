import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import http from 'node:http';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),html=await readFile(path.join(root,'STRATA-Offline.html'),'utf8');
const modules=JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;
test('standalone embeds vendored Three core and all nine local modules',()=>{assert.ok(html.includes('Copyright'));assert.equal(Object.keys(modules).length,9);for(const name of ['engine','levels','storage','audio','legacy','kernel','software','scene','main'])assert.ok(modules['@strata/'+name]);});
test('standalone imports resolve exclusively to embedded data modules',()=>{
  for(const url of Object.values(modules)){assert.ok(url.startsWith('data:text/javascript;base64,'));const js=Buffer.from(url.split(',')[1],'base64').toString();assert.ok(!/from ['"]\.\//.test(js));assert.ok(!/import\(['"]\.\//.test(js));}
});
test('standalone has no CDN script or external style requirement',()=>{assert.ok(!/<script[^>]+src=/.test(html));assert.ok(!/<link[^>]+rel="stylesheet"/.test(html));assert.ok(!/<link[^>]+rel="manifest"/.test(html));});
test('build manifest hash matches exact standalone bytes',async()=>{const info=JSON.parse(await readFile(path.join(root,'dist/build-info.json')));assert.equal(info.offlineSHA256,createHash('sha256').update(html).digest('hex'));assert.equal(info.three,'r140');});
test('static build includes all runtime resources in service-worker precache',async()=>{const sw=await readFile(path.join(root,'dist/sw.js'),'utf8');for(const name of ['engine','levels','storage','audio','legacy','kernel','software','scene','main']){await access(path.join(root,'dist/src',name+'.js'));assert.ok(sw.includes('./src/'+name+'.js'));}await access(path.join(root,'dist/vendor/three.r140.min.js'));});
test('complete third-party license is present in standalone and static bundle',async()=>{assert.ok(html.includes('Permission is hereby granted, free of charge'));assert.ok(html.includes('THE SOFTWARE IS PROVIDED'));assert.ok((await readFile(path.join(root,'dist/THIRD_PARTY_NOTICES.md'),'utf8')).includes('Copyright © 2010-2022'));});
test('debug API remains opt-in instead of enabled in normal build',async()=>{const js=await readFile(path.join(root,'src/main.js'),'utf8');assert.ok(js.includes("globalThis.__STRATA_ENABLE_TEST__===true||new URLSearchParams(location.search).get('test')==='1'"));assert.ok(!html.includes('__STRATA_ENABLE_TEST__ = true'));});
test('local HTTP server delivers assets and correct MIME, HEAD, 404, 405, traversal checks',async()=>{
  const child=spawn(process.execPath,['scripts/serve.mjs','dist'],{cwd:root,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  try {
    const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),5000);child.once('error',reject);child.stderr.on('data',d=>reject(Error(d.toString())));child.stdout.on('data',d=>{const m=d.toString().match(/Open http:\/\/[^:]+:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});});
    const request=(url,method='GET')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:url,method},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.setTimeout(3000,()=>req.destroy(Error('timeout')));req.end();});
    const main=await request('/');assert.equal(main.status,200);assert.ok(main.headers['content-type'].startsWith('text/html'));assert.ok(main.body.includes('流层'));assert.equal(main.headers['x-content-type-options'],'nosniff');
    for(const file of ['/src/main.js','/src/software.js','/vendor/three.r140.min.js']){const r=await request(file);assert.equal(r.status,200);assert.ok(r.headers['content-type'].startsWith('text/javascript'));}
    assert.equal((await request('/src/style.css')).status,200);assert.equal((await request('/sw.js')).status,200);assert.equal((await request('/manifest.webmanifest')).status,200);
    assert.equal((await request('/','HEAD')).body,'');assert.equal((await request('/not-present')).status,404);assert.equal((await request('/','POST')).status,405);assert.equal((await request('/..%2F..%2Fetc%2Fpasswd')).status,403);assert.equal((await request('/%INVALID')).status,400);
  } finally {child.kill();}
});
