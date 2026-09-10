/** Dependency-free deterministic packager. No npm download or CDN is needed. */
import {readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const name of ['src','vendor','THIRD_PARTY_NOTICES.md','icon.svg','manifest.webmanifest'])await cp(path.join(root,name),path.join(dist,name),{recursive:true});
let html=await readFile(path.join(root,'index.html'),'utf8');
html=html.replace('<meta charset="UTF-8">','<meta charset="UTF-8"><meta name="strata-build" content="2.0.0-rc.1">');
await writeFile(path.join(dist,'index.html'),html);
const modules=['engine','levels','storage','audio','legacy','kernel','software','scene','main'];
const map={imports:{}};const hashes={};
for(const name of modules) {
  let text=await readFile(path.join(root,'src',name+'.js'),'utf8');
  hashes[name]=createHash('sha256').update(text).digest('hex');
  text=text.replace(/(['"])\.\/([a-z]+)\.js\1/g,(_,q,dep)=>q+'@strata/'+dep+q);
  map.imports['@strata/'+name]='data:text/javascript;base64,'+Buffer.from(text).toString('base64');
}
const css=await readFile(path.join(root,'src/style.css'),'utf8'),three=await readFile(path.join(root,'vendor/three.r140.min.js'),'utf8'),svg=await readFile(path.join(root,'icon.svg'),'utf8');
const license=await readFile(path.join(root,'vendor/LICENSE.three.txt'),'utf8');
let offline=html.replace('<meta name="strata-build" content="2.0.0-rc.1">','');
offline=offline.replace('</head>','<!-- Bundled Three.js license\n'+license+'-->\n</head>');
offline=offline.replace('<link rel="stylesheet" href="./src/style.css">','<style>'+css+'</style>');
offline=offline.replace('<link rel="manifest" href="./manifest.webmanifest">','');
offline=offline.replace('./icon.svg','data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'));
offline=offline.replace('<script src="./vendor/three.r140.min.js"></script>',()=>'<script>'+three.replace(/<\/script/gi,'<\\/script')+'</script>');
offline=offline.replace('<script type="module" src="./src/main.js"></script>',()=>'<script type="importmap">'+JSON.stringify(map)+'</script><script type="module">import "@strata/main";</script>');
await writeFile(path.join(root,'STRATA-Offline.html'),offline);
const assets=['./','./index.html','./src/style.css','./vendor/three.r140.min.js','./icon.svg','./manifest.webmanifest','./THIRD_PARTY_NOTICES.md',...modules.map(n=>'./src/'+n+'.js')];
const hash=createHash('sha256').update(offline).digest('hex');
const sw=`const CACHE='strata-${hash.slice(0,12)}';const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('strata-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone));}return response;}).catch(()=>caches.match(event.request).then(hit=>hit||new Response('Offline resource unavailable',{status:503}))));});\n`;
await writeFile(path.join(dist,'sw.js'),sw);
await writeFile(path.join(dist,'build-info.json'),JSON.stringify({version:'2.0.0-rc.1',three:'r140',offlineSHA256:hash,sourceSHA256:hashes},null,2));
console.log(`Build OK. dist/ is ready for static hosting.\nSTRATA-Offline.html: ${(Buffer.byteLength(offline)/1024).toFixed(1)} KB (self-contained)\nSHA256: ${hash}`);
