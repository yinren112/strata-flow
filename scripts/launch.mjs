/** Local convenience launcher; the server is opened only after its listen callback. */
import {spawn} from 'node:child_process';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const child=spawn(process.execPath,['scripts/serve.mjs','dist'],{cwd:root,env:process.env,stdio:['inherit','pipe','inherit']});
let opened=false;
child.stdout.on('data',chunk=>{
  process.stdout.write(chunk);const match=chunk.toString().match(/Open (http:\/\/[^\s]+)/);
  if(!match||opened)return;opened=true;
  const url=match[1],command=process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/c','start','',url]:[url];
  const opener=spawn(command,args,{stdio:'ignore'});opener.on('error',()=>console.log('请在浏览器中打开：'+url));
});
child.on('error',err=>{console.error(err.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
