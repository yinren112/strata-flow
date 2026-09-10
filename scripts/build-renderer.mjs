/** Optional: regenerate the committed CPU kernel. Ordinary builds do not need clang. */
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=['--target=wasm32','-O3','-nostdlib','-fno-builtin','render/raster.c','-Wl,--no-entry','-Wl,--export-memory','-Wl,--initial-memory=100663296','-Wl,--max-memory=134217728','-Wl,--strip-all','-o','render/raster.wasm'];
const run=spawnSync(process.env.CLANG||'clang',args,{cwd:root,encoding:'utf8'});
if(run.error||run.status!==0){console.error('Kernel compilation failed. Install clang with WebAssembly target support, or use the already committed kernel.\n'+(run.error?.message||run.stderr));process.exit(1);}
const wasm=await readFile(new URL('../render/raster.wasm',import.meta.url));
await writeFile(new URL('../src/kernel.js',import.meta.url),'// Generated from render/raster.c. Rebuild with npm run build:renderer.\nexport const kernel="'+wasm.toString('base64')+'";\n');
console.log(`CPU kernel rebuilt (${wasm.length} bytes). Run npm run build to update both deliverables.`);
