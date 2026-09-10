import {spawnSync} from 'node:child_process';import {readdir} from 'node:fs/promises';
for(const dir of ['src','scripts','tests'])for(const name of await readdir(new URL('../'+dir+'/',import.meta.url)))if(/\.(m?js)$/.test(name)){const result=spawnSync(process.execPath,['--check',new URL('../'+dir+'/'+name,import.meta.url).pathname],{encoding:'utf8'});if(result.status){console.error(result.stderr);process.exit(result.status);}}
console.log('All source files passed node --check.');
